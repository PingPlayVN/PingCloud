const firebaseConfig = { databaseURL: "https://cloudwed-default-rtdb.asia-southeast1.firebasedatabase.app/" };
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// --- STATE ---
let isAdmin = false;
const SECRET_KEY = "Gp140709@";
let currentTab = 'video';
let currentFolderId = null; // null = root
let allData = [];

// Clipboard nội bộ
let appClipboard = { action: null, id: null };
// Right click target
let contextTargetId = null;

// --- INIT & RENDER ---
db.ref('videos').on('value', (snapshot) => {
    allData = [];
    snapshot.forEach(child => {
        const val = child.val();
        if (val.parentId === undefined) val.parentId = null;
        allData.push({ key: child.key, ...val });
    });
    renderGrid();
});

function renderGrid() {
    const grid = document.getElementById('grid');
    grid.innerHTML = '';
    updateBreadcrumb();

    const filtered = allData.filter(item => {
        const isCorrectParent = (item.parentId === currentFolderId);
        if (!isCorrectParent) return false;

        if (item.type === 'folder') {
            return item.tabCategory === currentTab; 
        } else {
            return item.type === currentTab;
        }
    });

    filtered.sort((a, b) => (a.type === 'folder' ? -1 : 1));

    if (filtered.length === 0) {
        grid.innerHTML = `<p style="grid-column:1/-1; text-align:center; color:#999; margin-top:50px;">Thư mục trống</p>`;
        return;
    }

    filtered.forEach(data => {
        const isFolder = data.type === 'folder';
        
        let icon = '▶';
        if (isFolder) icon = '📁';
        else if (data.type === 'image') icon = '📷';
        else if (data.type === 'doc') icon = '📄';
        else if (data.type === 'other') icon = '📦';

        const thumbUrl = !isFolder ? `https://drive.google.com/thumbnail?id=${data.id}&sz=w400` : '';
        
        let thumbContent = `<img src="${thumbUrl}" loading="lazy" onerror="this.style.display='none'">`;
        if (!isFolder && data.type === 'other') {
             thumbContent = `<div style="font-size:40px">📦</div>`; 
        }
        if (isFolder) thumbContent = `<div class="folder-icon">📁</div>`;

        // NÚT TẢI XUỐNG VỚI ICON SVG
        const downloadLink = `https://drive.google.com/uc?export=download&id=${data.id}`;
        
        // Icon tải xuống chuẩn
        const downloadIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`;
        
        const downloadBtn = !isFolder ? `
            <a href="${downloadLink}" class="btn-download" title="Tải xuống" target="_blank" onclick="event.stopPropagation()">
                ${downloadIcon}
            </a>` : '';

        let cardHtml = `
            <div class="card ${isFolder ? 'is-folder' : ''}" 
                 oncontextmenu="showContextMenu(event, '${data.key}', true)"
                 onclick="handleClick('${data.key}', '${data.type}', '${data.id}')">
                
                <div class="thumb-box">
                    ${thumbContent}
                    ${!isFolder && data.type === 'video' ? '<div class="play-overlay">▶</div>' : ''}
                </div>

                <div class="card-footer">
                    <div class="file-info">
                        ${!isFolder ? `<span style="margin-right:5px">${icon}</span>` : ''}
                        <span class="file-name" title="${data.title}">${data.title}</span>
                    </div>
                    ${downloadBtn}
                </div>
            </div>
        `;
        grid.innerHTML += cardHtml;
    });
}

// --- NAVIGATION ---
function switchTab(type) {
    currentTab = type;
    currentFolderId = null; 
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`tab-${type}`).classList.add('active');
    renderGrid();
}

function handleClick(key, type, driveId) {
    if (type === 'folder') {
        currentFolderId = key;
        renderGrid();
    } else {
        openMedia(driveId, type);
    }
}

function navigateTo(targetId) {
    if (targetId === 'root') {
        currentFolderId = null;
    } else {
        currentFolderId = targetId;
    }
    renderGrid();
}

function updateBreadcrumb() {
    const bc = document.getElementById('breadcrumb');
    let html = `<span class="crumb-item" onclick="navigateTo('root')">Trang chủ (${currentTab})</span>`;
    
    if (currentFolderId) {
        let path = [];
        let curr = allData.find(i => i.key === currentFolderId);
        while(curr) {
            path.unshift(curr);
            if (!curr.parentId) break;
            curr = allData.find(i => i.key === curr.parentId);
        }

        path.forEach(folder => {
            html += ` <span class="crumb-separator">/</span> <span class="crumb-item" onclick="navigateTo('${folder.key}')">${folder.title}</span>`;
        });
    }
    bc.innerHTML = html;
}

// --- CONTEXT MENU ---
const contextMenu = document.getElementById('contextMenu');

document.addEventListener('contextmenu', function(e) {
    if (e.target.closest('.container')) {
        e.preventDefault();
        if (!e.target.closest('.card')) {
            showContextMenu(event, null, false);
        }
    }
});

document.addEventListener('click', () => contextMenu.style.display = 'none');

function showContextMenu(e, key, isItem) {
    e.preventDefault();
    e.stopPropagation(); 
    
    contextTargetId = key; 

    contextMenu.style.top = `${e.clientY}px`;
    contextMenu.style.left = `${e.clientX}px`;
    contextMenu.style.display = 'block';

    if (isItem) {
        document.getElementById('menu-item').style.display = 'block';
        document.getElementById('menu-bg').style.display = 'none';
    } else {
        document.getElementById('menu-item').style.display = 'none';
        document.getElementById('menu-bg').style.display = 'block';
    }
}

// --- ACTIONS ---
function createFolderUI() {
    if (!isAdmin) { alert("Cần quyền Admin!"); return; }
    const name = prompt("Nhập tên thư mục mới:", "Thư mục mới");
    if (name) {
        db.ref('videos').push({
            title: name,
            type: 'folder',
            tabCategory: currentTab,
            parentId: currentFolderId,
            timestamp: Date.now()
        });
    }
}

function renameItemUI() {
    if (!isAdmin) { alert("Cần quyền Admin!"); return; }
    const item = allData.find(i => i.key === contextTargetId);
    if (!item) return;

    const newName = prompt("Đổi tên thành:", item.title);
    if (newName && newName !== item.title) {
        db.ref('videos/' + contextTargetId).update({ title: newName });
    }
}

function deleteItem() {
    if (!isAdmin) { alert("Cần quyền Admin!"); return; }
    if (confirm("Bạn có chắc muốn xóa?")) {
        db.ref('videos/' + contextTargetId).remove();
    }
}

function copyItem() {
    if (!isAdmin) { alert("Cần quyền Admin!"); return; }
    appClipboard = { action: 'copy', id: contextTargetId };
    
    const toast = document.getElementById('toast');
    toast.className = "show";
    setTimeout(() => toast.className = toast.className.replace("show", ""), 3000);
}

function pasteItem() {
    if (!isAdmin) { alert("Cần quyền Admin!"); return; }
    if (!appClipboard.id) { alert("Chưa có gì để dán!"); return; }

    const sourceItem = allData.find(i => i.key === appClipboard.id);
    if (!sourceItem) return;

    const newItem = { ...sourceItem };
    delete newItem.key; 
    newItem.parentId = currentFolderId; 
    newItem.title = newItem.title + " (Copy)";
    newItem.timestamp = Date.now();

    db.ref('videos').push(newItem);
}

// Download function for Context Menu
function downloadItem() {
    const item = allData.find(i => i.key === contextTargetId);
    if (item && item.type !== 'folder') {
        window.open(`https://drive.google.com/uc?export=download&id=${item.id}`, '_blank');
    }
}

function openContextItem() {
    const item = allData.find(i => i.key === contextTargetId);
    if (item) handleClick(item.key, item.type, item.id);
}

// --- UPLOAD ---
function extractFileId(url) {
    const match = url.match(/\/d\/([a-zA-Z0-9_-]+)|id=([a-zA-Z0-9_-]+)/);
    return match ? (match[1] || match[2]) : null;
}

function autoFillID() {
    const id = extractFileId(document.getElementById('mediaUrl').value);
    if (id) document.getElementById('mediaTitle').placeholder = "Nhập tên...";
}

function toggleAdminTool() {
    const el = document.getElementById('adminTool');
    el.style.display = el.style.display === 'block' ? 'none' : 'block';
}

function addToCloud() {
    if (!isAdmin) return;
    const url = document.getElementById('mediaUrl').value;
    const id = extractFileId(url);
    const title = document.getElementById('mediaTitle').value || ("File " + id?.substring(0,5));
    const type = currentTab; 

    if (id) {
        db.ref('videos').push({
            id: id, title: title, type: type, 
            parentId: currentFolderId, timestamp: Date.now()
        });
        document.getElementById('mediaUrl').value = '';
        document.getElementById('mediaTitle').value = '';
        toggleAdminTool();
    } else {
        alert("Link Google Drive không hợp lệ");
    }
}

// --- PREVIEW ---
function openMedia(id, type) {
    const modal = document.getElementById('mediaModal');
    const content = document.getElementById('modalContent');
    
    content.innerHTML = '<div class="loader"></div>';
    modal.style.display = 'flex';

    setTimeout(() => {
        let html = `<span class="close-modal" onclick="closeMedia(event, true)">&times;</span>`;
        if (type === 'image') {
            html += `<img src="https://drive.google.com/thumbnail?id=${id}&sz=w2000" onload="this.style.opacity=1; document.querySelector('.loader').style.display='none'" style="opacity:0; transition:0.3s">`;
        } else {
            html += `<iframe src="https://drive.google.com/file/d/${id}/preview" allow="autoplay; fullscreen" onload="this.style.opacity=1; document.querySelector('.loader').style.display='none'" style="opacity:0; transition:0.3s"></iframe>`;
        }
        content.innerHTML += html;
    }, 100);
}

function closeMedia(e, force) {
    if (force || e.target.id === 'mediaModal') {
        document.getElementById('mediaModal').style.display = 'none';
        document.getElementById('modalContent').innerHTML = '';
    }
}

// --- AUTH ---
function showLogin() {
    document.getElementById('overlay').style.display = 'block';
    document.getElementById('login-panel').style.display = 'block';
}
function closeLogin() {
    document.getElementById('overlay').style.display = 'none';
    document.getElementById('login-panel').style.display = 'none';
}
function checkPassword() {
    if (document.getElementById('adminPass').value === SECRET_KEY) {
        isAdmin = true;
        document.getElementById('btnNew').style.display = 'block';
        document.getElementById('loginBtn').style.display = 'none';
        document.getElementById('logoutBtn').style.display = 'block';
        closeLogin();
    } else { alert("Sai mật khẩu"); }
}
function logout() {
    isAdmin = false;
    document.getElementById('btnNew').style.display = 'none';
    document.getElementById('loginBtn').style.display = 'block';
    document.getElementById('logoutBtn').style.display = 'none';
}