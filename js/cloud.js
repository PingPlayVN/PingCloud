// js/cloud.js

let currentTab = 'video';
let currentSortMode = 'date_desc';
let currentSearchTerm = ''; 
let currentViewMode = 'grid';
let allData = [];
let dataMap = {}; 
let processedData = []; 
let renderLimit = 24;   
let searchTimeout = null; 
let contextTargetId = null;

// --- UTILS ---
function handleImgError(img) {
    img.onerror = null; 
    img.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23e0e0e0'%3E%3Cpath d='M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z'/%3E%3C/svg%3E";
    img.style.objectFit = "contain";
    img.style.padding = "20px";
}

// --- DATA FETCHING ---
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
    updateDataPipeline();
});

// --- CORE PIPELINE ---
function updateDataPipeline() {
    updateBreadcrumb();
    let filtered = allData.filter(item => {
        if (item.parentId !== window.currentFolderId) return false;
        let tabMatch = (item.type === 'folder') ? (item.tabCategory === currentTab) : (item.type === currentTab);
        if (!tabMatch) return false;
        if (currentSearchTerm && !item.title.toLowerCase().includes(currentSearchTerm)) return false;
        return true;
    });

    // Sắp xếp
    filtered.sort((a, b) => {
        if (a.type === 'folder' && b.type !== 'folder') return -1;
        if (a.type !== 'folder' && b.type === 'folder') return 1;
        
        const [criteria, order] = currentSortMode.split('_'); 
        if (criteria === 'date') {
            return order === 'asc' ? (a.timestamp||0) - (b.timestamp||0) : (b.timestamp||0) - (a.timestamp||0);
        } else {
            const nameA = a.title || "";
            const nameB = b.title || "";
            return order === 'asc' 
                ? nameA.localeCompare(nameB, 'vi', {numeric: true}) 
                : nameB.localeCompare(nameA, 'vi', {numeric: true});
        }
    });

    processedData = filtered;
    renderLimit = 24; 
    renderGrid();     
}

function renderGrid() {
    const grid = document.getElementById('grid');
    if (processedData.length === 0) {
        let msg = currentSearchTerm ? `Không tìm thấy "${currentSearchTerm}"` : "Thư mục trống";
        grid.innerHTML = `<p style="grid-column:1/-1; text-align:center; color:var(--text-sub); margin-top:50px;">${msg}</p>`;
        return;
    }

    const itemsToRender = processedData.slice(0, renderLimit);
    const htmlBuffer = itemsToRender.map(data => {
        const isFolder = data.type === 'folder';
        let icon = isFolder ? '📁' : (data.type === 'image' ? '📷' : (data.type === 'doc' ? '📄' : '📦'));
        const thumbUrl = !isFolder ? `https://drive.google.com/thumbnail?id=${data.id}&sz=w400` : '';
        let thumbContent = '';
        
        if (isFolder) {
            thumbContent = `<div class="folder-icon">📁</div>`;
        } else if (data.type === 'other') {
            thumbContent = `<div style="font-size:40px">📦</div>`; 
        } else {
            thumbContent = `<img src="${thumbUrl}" loading="lazy" decoding="async" onerror="handleImgError(this)">`;
        }

        const downloadLink = `https://drive.google.com/uc?export=download&id=${data.id}`;
        const downloadIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`;
        const downloadBtn = !isFolder ? `<a href="${downloadLink}" class="btn-download" title="Tải xuống" target="_blank" onclick="event.stopPropagation()">${downloadIcon}</a>` : '';
        const playOverlay = (!isFolder && data.type === 'video') ? `<div class="play-overlay"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></div>` : '';

        return `
            <div class="card ${isFolder ? 'is-folder' : ''}" 
                 oncontextmenu="showContextMenu(event, '${data.key}', true)"
                 onclick="handleClick('${data.key}', '${data.type}', '${data.id}')">
                <div class="thumb-box">${thumbContent}${playOverlay}</div>
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

// --- VIEW & SCROLL ---
window.initViewMode = function() {
    const savedMode = localStorage.getItem('viewMode');
    if (savedMode === 'list') {
        currentViewMode = 'list';
        document.getElementById('grid').classList.add('list-view');
        const btn = document.getElementById('viewBtn');
        if(btn) btn.innerText = '▦';
    }
}
window.initViewMode();

window.toggleViewMode = function() {
    const grid = document.getElementById('grid');
    const btn = document.getElementById('viewBtn');
    if (currentViewMode === 'grid') {
        currentViewMode = 'list';
        grid.classList.add('list-view');
        btn.innerText = '▦'; 
        localStorage.setItem('viewMode', 'list');
    } else {
        currentViewMode = 'grid';
        grid.classList.remove('list-view');
        btn.innerText = '⊞';
        localStorage.setItem('viewMode', 'grid');
    }
}

window.addEventListener('scroll', () => {
    if (renderLimit < processedData.length && (window.innerHeight + window.scrollY) >= document.body.offsetHeight - 200) {
        renderLimit += 24; renderGrid();      
    }
});

// --- NAVIGATION ---
window.switchTab = function(type) {
    if (currentTab === type) return; 
    currentTab = type;
    window.currentFolderId = null; 
    currentSearchTerm = ''; 
    document.getElementById('searchInput').value = '';
    changeSortMode('date_desc'); 
    
    const radio = document.getElementById(`tab-${type}-radio`);
    if(radio) radio.checked = true;

    updateDataPipeline();
}

window.handleClick = function(key, type, driveId) {
    if (type === 'folder') {
        window.currentFolderId = key;
        currentSearchTerm = '';
        document.getElementById('searchInput').value = '';
        
        // Áp dụng sắp xếp riêng nếu có
        const folder = dataMap[key];
        if (folder && folder.defaultSort) {
            changeSortMode(folder.defaultSort);
        } else {
            updateDataPipeline();
        }
    } else {
        const item = dataMap[key];
        openMedia(driveId, type, item ? item.title : 'Viewer');
    }
}

window.navigateTo = function(targetId) {
    window.currentFolderId = (targetId === 'root') ? null : targetId;
    currentSearchTerm = '';
    document.getElementById('searchInput').value = '';
    updateDataPipeline();
}

function updateBreadcrumb() {
    const bc = document.getElementById('breadcrumb');
    let html = `<span class="crumb-item" onclick="navigateTo('root')">Trang chủ (${currentTab})</span>`;
    if (window.currentFolderId) {
        let path = [];
        let curr = dataMap[window.currentFolderId];
        let i = 0;
        while(curr && i < 50) {
            path.unshift(curr);
            if (!curr.parentId) break;
            curr = dataMap[curr.parentId]; 
            i++;
        }
        path.forEach(folder => html += ` <span class="crumb-separator">/</span> <span class="crumb-item" onclick="navigateTo('${folder.key}')">${folder.title}</span>`);
    }
    bc.innerHTML = html;
}

// --- CONTEXT MENU ---
document.addEventListener('contextmenu', function(e) {
    if (e.target.closest('#app-cloud')) {
        e.preventDefault(); 
        if (!e.target.closest('.card')) {
            showContextMenu(e, null, false);
        }
    }
});

document.addEventListener('click', () => {
    const menu = document.getElementById('contextMenu');
    if (menu && menu.style.display === 'block') menu.style.display = 'none';
});

window.showContextMenu = function(e, key, isItem) {
    e.preventDefault();
    e.stopPropagation();
    contextTargetId = key;

    const contextMenu = document.getElementById('contextMenu');
    const menuFile = document.getElementById('ctx-file-actions');
    const menuBg = document.getElementById('ctx-bg-actions');
    const menuSetSort = document.getElementById('menuSetSort');

    menuFile.style.display = 'none';
    menuBg.style.display = 'none';

    if (isItem) {
        menuFile.style.display = 'block';
        const targetItem = dataMap[key];
        
        // QUAN TRỌNG: Kiểm tra window.isAdmin để hiện menu
        if (targetItem && targetItem.type === 'folder' && window.isAdmin) {
            menuSetSort.style.display = 'flex'; 
        } else {
            menuSetSort.style.display = 'none';
        }
    } else {
        menuBg.style.display = 'block';
    }

    contextMenu.style.display = 'block';
    let top = e.clientY;
    let left = e.clientX;
    const menuWidth = 260; 
    const menuHeight = contextMenu.offsetHeight || 300; 

    if (left + menuWidth > window.innerWidth) left = window.innerWidth - menuWidth - 10;
    if (top + menuHeight > window.innerHeight) top = window.innerHeight - menuHeight - 10;

    contextMenu.style.top = `${top}px`;
    contextMenu.style.left = `${left}px`;
}

// --- ADMIN ACTIONS (Fix biến window.isAdmin) ---

window.editLinkUI = function() {
    if (!window.isAdmin) return window.showToast("Cần quyền Admin!");
    const item = dataMap[contextTargetId];
    if (!item) return;
    if (item.type === 'folder') return window.showToast("Không thể sửa link thư mục!");

    window.showActionModal({
        title: "Sửa Link File",
        desc: "Dán link Google Drive mới vào bên dưới:",
        type: 'prompt',
        initialValue: "", 
        onConfirm: (val) => {
            const newId = window.extractFileId(val);
            if(newId) {
                db.ref('videos/' + contextTargetId).update({ id: newId })
                  .then(() => window.showToast("Đã cập nhật link!"));
            } else {
                window.showToast("Link không hợp lệ!");
            }
        }
    });
}

window.setFolderSortUI = function() {
    if (!window.isAdmin) return window.showToast("Cần quyền Admin!");
    const item = dataMap[contextTargetId];
    if (!item || item.type !== 'folder') return;

    window.showActionModal({
        title: "Cài đặt sắp xếp",
        desc: "Chọn cách sắp xếp mặc định cho thư mục này:",
        type: 'select',
        initialValue: item.defaultSort || 'date_desc',
        onConfirm: (mode) => {
            db.ref('videos/' + contextTargetId).update({ defaultSort: mode })
              .then(() => window.showToast("Đã lưu cài đặt!"));
        }
    });
}

window.deleteItem = function() {
    if (!window.isAdmin) return window.showToast("Cần quyền Admin!");
    
    window.showActionModal({
        title: "Xác nhận xóa?",
        desc: "Hành động này không thể hoàn tác!",
        type: 'confirm',
        onConfirm: () => {
            const allIdsToDelete = [contextTargetId, ...getDescendantIds(contextTargetId)];
            const updates = {};
            allIdsToDelete.forEach(id => updates['videos/' + id] = null);
            db.ref().update(updates).then(() => {
                window.showToast(`Đã xóa ${allIdsToDelete.length} mục.`);
                if (contextTargetId === window.currentFolderId) navigateTo('root');
            });
        }
    });
}

window.renameItemUI = function() {
    if (!window.isAdmin) return window.showToast("Cần quyền Admin!");
    const item = dataMap[contextTargetId];
    if (!item) return;
    
    window.showActionModal({
        title: "Đổi tên",
        type: 'prompt',
        initialValue: item.title,
        onConfirm: (newName) => {
            if (newName && newName !== item.title) {
                db.ref('videos/' + contextTargetId).update({ title: newName });
            }
        }
    });
}

window.createFolderUI = function() {
    if (!window.isAdmin) return window.showToast("Cần quyền Admin!");
    
    window.showActionModal({
        title: "Tạo thư mục",
        type: 'prompt',
        initialValue: "Thư mục mới",
        onConfirm: (name) => {
            if (name) {
                db.ref('videos').push({
                    title: name,
                    type: 'folder',
                    tabCategory: currentTab,
                    parentId: window.currentFolderId,
                    timestamp: firebase.database.ServerValue.TIMESTAMP
                });
            }
        }
    });
}

// Helpers
function getDescendantIds(targetId) {
    let ids = [];
    const children = allData.filter(item => item.parentId === targetId);
    children.forEach(child => {
        ids.push(child.key);
        if (child.type === 'folder') {
            ids = ids.concat(getDescendantIds(child.key));
        }
    });
    return ids;
}

window.copyItem = function() {
    if (!window.isAdmin) return window.showToast("Cần quyền Admin!");
    window.appClipboard = { action: 'copy', id: contextTargetId };
    window.showToast("Đã chép vào bộ nhớ tạm");
}

window.cutItem = function() {
    if (!window.isAdmin) return window.showToast("Cần quyền Admin!");
    window.appClipboard = { action: 'cut', id: contextTargetId };
    window.showToast("Đã chọn để di chuyển");
}

window.pasteItem = function() {
    if (!window.isAdmin) return window.showToast("Cần quyền Admin!");
    if (!window.appClipboard.id) return window.showToast("Chưa có gì để dán!");
    if (window.appClipboard.id === window.currentFolderId) return window.showToast("Không thể dán vào chính nó!");

    const sourceItem = dataMap[window.appClipboard.id];
    if (!sourceItem) return;

    const updates = {
        parentId: window.currentFolderId,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    };
    if (sourceItem.type === 'folder') updates.tabCategory = currentTab;
    else updates.type = currentTab;

    if (window.appClipboard.action === 'cut') {
        db.ref('videos/' + window.appClipboard.id).update(updates)
            .then(() => {
                window.showToast("Đã di chuyển");
                window.appClipboard = { action: null, id: null }; 
            });
    } else if (window.appClipboard.action === 'copy') {
        const newItem = { ...sourceItem, ...updates, title: sourceItem.title + " (Copy)" };
        delete newItem.key; 
        db.ref('videos').push(newItem).then(() => window.showToast("Đã dán bản sao"));
    }
}

window.downloadItem = function() {
    const item = dataMap[contextTargetId];
    if (item && item.type !== 'folder') {
        window.open(`https://drive.google.com/uc?export=download&id=${item.id}`, '_blank');
    }
}

window.openContextItem = function() {
    const item = dataMap[contextTargetId];
    if (item) handleClick(item.key, item.type, item.id);
}

// --- MEDIA MODAL ---
function openMedia(id, type, title) {
    const modal = document.getElementById('mediaModal');
    const content = document.getElementById('modalContent');
    content.innerHTML = '';
    content.className = 'modal-content'; 
    if (type === 'doc') content.classList.add('view-doc');

    modal.style.display = 'flex';
    content.innerHTML = `
        <div class="media-window">
            <div class="media-header">
                <h3 class="media-title">${title}</h3>
                <button class="btn-close-media" onclick="document.getElementById('mediaModal').style.display='none'">✕</button>
            </div>
            <div class="media-body">
                ${type === 'image' 
                    ? `<img src="https://drive.google.com/thumbnail?id=${id}&sz=w2000" class="media-content loaded">`
                    : `<iframe src="https://drive.google.com/file/d/${id}/preview" class="media-content loaded" allow="autoplay"></iframe>`
                }
            </div>
        </div>
    `;
}

// --- ADMIN TOOL INPUT ---
window.autoFillID = function() {
    const id = window.extractFileId(document.getElementById('mediaUrl').value);
    if (id) document.getElementById('mediaTitle').placeholder = "Nhập tên...";
}

window.toggleAdminTool = function() {
    const el = document.getElementById('adminTool');
    el.style.display = (el.style.display === 'block') ? 'none' : 'block';
}

window.addToCloud = function() {
    if (!window.isAdmin) return;
    const url = document.getElementById('mediaUrl').value;
    const id = window.extractFileId(url);
    const title = document.getElementById('mediaTitle').value || ("File " + id?.substring(0,5));
    if (id) {
        db.ref('videos').push({
            id: id, title: title, type: currentTab, 
            parentId: window.currentFolderId, 
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });
        document.getElementById('mediaUrl').value = '';
        document.getElementById('mediaTitle').value = '';
        toggleAdminTool();
        window.showToast("Thêm tệp thành công!"); 
    } else {
        window.showToast("Link không hợp lệ");
    }
}

window.changeSortMode = function(mode) {
    currentSortMode = mode;
    const select = document.getElementById('sortSelect');
    if(select) select.value = mode;
    updateDataPipeline();
}
window.handleSearch = function(val) {
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        currentSearchTerm = val.toLowerCase().trim();
        updateDataPipeline();
    }, 300);
}