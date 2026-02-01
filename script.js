const firebaseConfig = {
  apiKey: "AIzaSyDeQBdoFn7GSISvbApUm3cYibNXLnnfx7U",
  authDomain: "cloudwed.firebaseapp.com",
  databaseURL: "https://cloudwed-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "cloudwed",
  storageBucket: "cloudwed.firebasestorage.app",
  messagingSenderId: "439323775591",
  appId: "1:439323775591:web:c51ee6faa887be1b52bac2",
  measurementId: "G-DJKCVMND8M"
};
firebase.initializeApp(firebaseConfig);

const db = firebase.database();
const auth = firebase.auth();

// --- STATE ---
let isAdmin = false;
let currentTab = 'video';
let currentFolderId = null; // null = root
let currentSortMode = 'date_desc';
let currentSearchTerm = ''; // MỚI: Từ khóa tìm kiếm
let allData = [];
let dataMap = {}; 

// Clipboard nội bộ
let appClipboard = { action: null, id: null };
let contextTargetId = null;

// --- THEME / DARK MODE (MỚI) ---
function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        document.getElementById('themeBtn').innerText = '☀️'; // Icon mặt trời
    } else {
        document.documentElement.removeAttribute('data-theme');
        document.getElementById('themeBtn').innerText = '🌙'; // Icon mặt trăng
    }
}
// Chạy ngay khi load
initTheme();

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    if (current === 'dark') {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('theme', 'light');
        document.getElementById('themeBtn').innerText = '🌙';
    } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
        document.getElementById('themeBtn').innerText = '☀️';
    }
}

// --- AUTH LISTENER ---
auth.onAuthStateChanged((user) => {
    const btnNew = document.getElementById('btnNew');
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const adminTool = document.getElementById('adminTool');

    if (user) {
        isAdmin = true;
        btnNew.style.display = 'block';
        loginBtn.style.display = 'none';
        logoutBtn.style.display = 'block';
        console.log("Logged in:", user.email);
    } else {
        isAdmin = false;
        btnNew.style.display = 'none';
        adminTool.style.display = 'none';
        loginBtn.style.display = 'block';
        logoutBtn.style.display = 'none';
    }
});

// --- INIT & RENDER ---
db.ref('videos').on('value', (snapshot) => {
    allData = [];
    dataMap = {}; 
    
    snapshot.forEach(child => {
        const val = child.val();
        if (val.parentId === undefined) val.parentId = null;
        
        const item = { key: child.key, ...val };
        allData.push(item);
        dataMap[child.key] = item; 
    });
    renderGrid();
});

function changeSortMode(mode) {
    currentSortMode = mode;
    renderGrid();
}

// Hàm xử lý tìm kiếm (MỚI)
function handleSearch(val) {
    currentSearchTerm = val.toLowerCase().trim();
    renderGrid();
}

function renderGrid() {
    const grid = document.getElementById('grid');
    updateBreadcrumb(); 

    // 1. Lọc dữ liệu (Đã thêm Search)
    let filtered = allData.filter(item => {
        // Lọc theo thư mục
        if (item.parentId !== currentFolderId) return false;
        
        // Lọc theo Tab
        let tabMatch = (item.type === 'folder') 
            ? (item.tabCategory === currentTab) 
            : (item.type === currentTab);
        if (!tabMatch) return false;

        // Lọc theo Tìm kiếm (MỚI)
        if (currentSearchTerm && !item.title.toLowerCase().includes(currentSearchTerm)) {
            return false;
        }

        return true;
    });

    // 2. SẮP XẾP
    filtered.sort((a, b) => {
        if (a.type === 'folder' && b.type !== 'folder') return -1;
        if (a.type !== 'folder' && b.type === 'folder') return 1;

        const [criteria, order] = currentSortMode.split('_'); 
        
        let valA, valB;
        if (criteria === 'date') {
            valA = a.timestamp; valB = b.timestamp;
        } else {
            valA = a.title.toLowerCase(); valB = b.title.toLowerCase();
        }

        if (valA < valB) return order === 'asc' ? -1 : 1;
        if (valA > valB) return order === 'asc' ? 1 : -1;
        return 0;
    });

    // 3. Render HTML
    if (filtered.length === 0) {
        let msg = currentSearchTerm ? `Không tìm thấy "${currentSearchTerm}"` : "Thư mục trống";
        grid.innerHTML = `<p style="grid-column:1/-1; text-align:center; color:var(--text-sub); margin-top:50px;">${msg}</p>`;
        return;
    }

    const htmlBuffer = filtered.map(data => {
        const isFolder = data.type === 'folder';
        
        let icon = '▶';
        if (isFolder) icon = '📁';
        else if (data.type === 'image') icon = '📷';
        else if (data.type === 'doc') icon = '📄';
        else if (data.type === 'other') icon = '📦';

        const thumbUrl = !isFolder ? `https://drive.google.com/thumbnail?id=${data.id}&sz=w400` : '';
        
        let thumbContent = '';
        if (isFolder) {
            thumbContent = `<div class="folder-icon">📁</div>`;
        } else if (data.type === 'other') {
            thumbContent = `<div style="font-size:40px">📦</div>`; 
        } else {
            thumbContent = `<img src="${thumbUrl}" loading="lazy" decoding="async" onerror="this.style.display='none'">`;
        }

        const downloadLink = `https://drive.google.com/uc?export=download&id=${data.id}`;
        const downloadIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`;
        
        const downloadBtn = !isFolder ? `
            <a href="${downloadLink}" class="btn-download" title="Tải xuống" target="_blank" onclick="event.stopPropagation()">
                ${downloadIcon}
            </a>` : '';

        const playOverlay = (!isFolder && data.type === 'video') ? '<div class="play-overlay">▶</div>' : '';

        return `
            <div class="card ${isFolder ? 'is-folder' : ''}" 
                 oncontextmenu="showContextMenu(event, '${data.key}', true)"
                 onclick="handleClick('${data.key}', '${data.type}', '${data.id}')">
                
                <div class="thumb-box">
                    ${thumbContent}
                    ${playOverlay}
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
    }).join('');

    grid.innerHTML = htmlBuffer;
}

// --- NAVIGATION ---
function switchTab(type) {
    if (currentTab === type) return; 
    currentTab = type;
    currentFolderId = null; 
    currentSearchTerm = ''; // Reset tìm kiếm khi chuyển tab
    document.getElementById('searchInput').value = '';
    
    const activeBtn = document.querySelector('.tab-btn.active');
    if(activeBtn) activeBtn.classList.remove('active');
    document.getElementById(`tab-${type}`).classList.add('active');
    
    renderGrid();
}

function handleClick(key, type, driveId) {
    if (type === 'folder') {
        currentFolderId = key;
        currentSearchTerm = ''; // Reset tìm kiếm khi vào folder mới
        document.getElementById('searchInput').value = '';
        renderGrid();
    } else {
        openMedia(driveId, type);
    }
}

function navigateTo(targetId) {
    currentFolderId = (targetId === 'root') ? null : targetId;
    currentSearchTerm = ''; // Reset tìm kiếm
    document.getElementById('searchInput').value = '';
    renderGrid();
}

function updateBreadcrumb() {
    const bc = document.getElementById('breadcrumb');
    let html = `<span class="crumb-item" onclick="navigateTo('root')">Trang chủ (${currentTab})</span>`;
    
    if (currentFolderId) {
        let path = [];
        let curr = dataMap[currentFolderId];
        let safetyCounter = 0;
        while(curr && safetyCounter < 50) {
            path.unshift(curr);
            if (!curr.parentId) break;
            curr = dataMap[curr.parentId]; 
            safetyCounter++;
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
            showContextMenu(e, null, false);
        }
    }
});

document.addEventListener('click', () => {
    if (contextMenu.style.display === 'block') contextMenu.style.display = 'none';
});

function showContextMenu(e, key, isItem) {
    e.preventDefault();
    e.stopPropagation(); 
    contextTargetId = key; 

    let top = e.clientY;
    let left = e.clientX;
    contextMenu.style.display = 'block'; 
    if (left + contextMenu.offsetWidth > window.innerWidth) left = window.innerWidth - contextMenu.offsetWidth - 10;
    if (top + contextMenu.offsetHeight > window.innerHeight) top = window.innerHeight - contextMenu.offsetHeight - 10;
    contextMenu.style.top = `${top}px`;
    contextMenu.style.left = `${left}px`;

    const menuItems = document.getElementById('menu-item');
    const menuBg = document.getElementById('menu-bg');

    if (isItem) {
        menuItems.style.display = 'block';
        menuBg.style.display = 'none';
    } else {
        menuItems.style.display = 'none';
        menuBg.style.display = 'block';
    }
}

// --- CUSTOM MODAL LOGIC ---
const acModal = document.getElementById('actionModal');
const acTitle = document.getElementById('acModalTitle');
const acDesc = document.getElementById('acModalDesc');
const acInput = document.getElementById('acModalInput');
const acBtn = document.getElementById('acModalBtn');
const acCancelBtn = document.querySelector('.btn-modal-cancel');

function showActionModal({ title, desc, type, initialValue = '', onConfirm }) {
    acModal.style.display = 'flex';
    acTitle.innerText = title;
    acDesc.innerText = desc || '';
    acInput.value = initialValue;
    acBtn.onclick = null; 
    
    acInput.style.display = (type === 'prompt') ? 'block' : 'none';
    acDesc.style.display = (type !== 'prompt') ? 'block' : 'none';
    acCancelBtn.style.display = (type === 'alert') ? 'none' : 'block';

    if (type === 'prompt') setTimeout(() => acInput.focus(), 100);

    acBtn.onclick = () => {
        if (type === 'prompt' && !acInput.value.trim()) return;
        if (onConfirm) onConfirm(acInput.value);
        closeActionModal();
    };

    acInput.onkeydown = (e) => {
        if (e.key === 'Enter') acBtn.click();
    };
}

function closeActionModal() {
    acModal.style.display = 'none';
}

// --- ACTION HANDLERS ---
function createFolderUI() {
    if (!isAdmin) { showActionModal({ title: "Thông báo", desc: "Cần quyền Admin!", type: 'alert' }); return; }
    showActionModal({
        title: "Tạo thư mục mới",
        type: 'prompt',
        initialValue: "Thư mục mới",
        onConfirm: (name) => {
            db.ref('videos').push({
                title: name,
                type: 'folder',
                tabCategory: currentTab,
                parentId: currentFolderId,
                timestamp: firebase.database.ServerValue.TIMESTAMP
            });
        }
    });
}

function renameItemUI() {
    if (!isAdmin) { showActionModal({ title: "Thông báo", desc: "Cần quyền Admin!", type: 'alert' }); return; }
    const item = dataMap[contextTargetId];
    if (!item) return;
    showActionModal({
        title: "Đổi tên tệp",
        type: 'prompt',
        initialValue: item.title,
        onConfirm: (newName) => {
            if (newName && newName !== item.title) {
                db.ref('videos/' + contextTargetId).update({ title: newName });
            }
        }
    });
}

function deleteItem() {
    if (!isAdmin) { showActionModal({ title: "Thông báo", desc: "Cần quyền Admin!", type: 'alert' }); return; }
    showActionModal({
        title: "Xóa mục này?",
        desc: "Hành động này không thể hoàn tác.",
        type: 'confirm',
        onConfirm: () => {
            db.ref('videos/' + contextTargetId).remove();
        }
    });
}

function copyItem() {
    if (!isAdmin) { showToast("Cần quyền Admin!"); return; }
    appClipboard = { action: 'copy', id: contextTargetId };
    showToast("Đã chép vào bộ nhớ tạm");
}

function cutItem() {
    if (!isAdmin) { showToast("Cần quyền Admin!"); return; }
    appClipboard = { action: 'cut', id: contextTargetId };
    showToast("Đã chọn để di chuyển");
}

function pasteItem() {
    if (!isAdmin) { showToast("Cần quyền Admin!"); return; }
    if (!appClipboard.id) { showToast("Chưa có gì để dán!"); return; }
    if (appClipboard.id === currentFolderId) {
        showActionModal({ title: "Lỗi", desc: "Không thể dán vào chính nó!", type: 'alert' });
        return;
    }
    const sourceItem = dataMap[appClipboard.id];
    if (!sourceItem) return;

    const updates = {
        parentId: currentFolderId,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    };
    if (sourceItem.type === 'folder') updates.tabCategory = currentTab;
    else updates.type = currentTab;

    if (appClipboard.action === 'cut') {
        db.ref('videos/' + appClipboard.id).update(updates)
            .then(() => {
                showToast("Đã di chuyển");
                appClipboard = { action: null, id: null }; 
            });
    } else if (appClipboard.action === 'copy') {
        const newItem = { ...sourceItem, ...updates, title: sourceItem.title + " (Copy)" };
        delete newItem.key; 
        db.ref('videos').push(newItem).then(() => showToast("Đã dán bản sao"));
    }
}

function downloadItem() {
    const item = dataMap[contextTargetId];
    if (item && item.type !== 'folder') {
        window.open(`https://drive.google.com/uc?export=download&id=${item.id}`, '_blank');
    }
}

function openContextItem() {
    const item = dataMap[contextTargetId];
    if (item) handleClick(item.key, item.type, item.id);
}

// --- UTILS ---
function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.innerText = msg;
    toast.className = "show";
    setTimeout(() => toast.className = toast.className.replace("show", ""), 3000);
}

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
    el.style.display = (el.style.display === 'block') ? 'none' : 'block';
}

function addToCloud() {
    if (!isAdmin) return;
    const url = document.getElementById('mediaUrl').value;
    const id = extractFileId(url);
    const title = document.getElementById('mediaTitle').value || ("File " + id?.substring(0,5));
    if (id) {
        db.ref('videos').push({
            id: id, title: title, type: currentTab, 
            parentId: currentFolderId, 
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });
        document.getElementById('mediaUrl').value = '';
        document.getElementById('mediaTitle').value = '';
        toggleAdminTool();
        showToast("Thêm tệp thành công!"); 
    } else {
        showActionModal({ title: "Lỗi Link", desc: "Link không hợp lệ.", type: 'alert' });
    }
}

// --- PREVIEW ---
function openMedia(id, type) {
    const modal = document.getElementById('mediaModal');
    const content = document.getElementById('modalContent');
    content.innerHTML = '<div class="loader"></div>';
    modal.style.display = 'flex';
    requestAnimationFrame(() => {
        let html = `<span class="close-modal" onclick="closeMedia(event, true)">&times;</span>`;
        if (type === 'image') {
            html += `<img src="https://drive.google.com/thumbnail?id=${id}&sz=w2000" onload="this.style.opacity=1; document.querySelector('.loader').style.display='none'" style="opacity:0; transition:opacity 0.3s">`;
        } else {
            html += `<iframe src="https://drive.google.com/file/d/${id}/preview" allow="autoplay; fullscreen" onload="this.style.opacity=1; document.querySelector('.loader').style.display='none'" style="opacity:0; transition:opacity 0.3s"></iframe>`;
        }
        content.innerHTML += html;
    });
}

function closeMedia(e, force) {
    if (force || e.target.id === 'mediaModal') {
        document.getElementById('mediaModal').style.display = 'none';
        document.getElementById('modalContent').innerHTML = '';
    }
}

// --- AUTH FNS ---
function showLogin() {
    document.getElementById('overlay').style.display = 'block';
    document.getElementById('login-panel').style.display = 'block';
    document.getElementById('loginError').style.display = 'none';
}
function closeLogin() {
    document.getElementById('overlay').style.display = 'none';
    document.getElementById('login-panel').style.display = 'none';
}

function loginAdmin() {
    const email = document.getElementById('adminEmail').value;
    const pass = document.getElementById('adminPass').value;
    const btn = document.querySelector('#login-panel .btn-submit');
    const errObj = document.getElementById('loginError');

    btn.innerText = "Đang xử lý...";
    btn.disabled = true;
    errObj.style.display = 'none';

    auth.signInWithEmailAndPassword(email, pass)
        .then(() => closeLogin())
        .catch((error) => {
            errObj.innerText = "Lỗi: " + error.message;
            errObj.style.display = 'block';
        })
        .finally(() => {
            btn.innerText = "Đăng nhập";
            btn.disabled = false;
        });
}

function logout() {
    auth.signOut().then(() => showToast("Đã đăng xuất"));
}