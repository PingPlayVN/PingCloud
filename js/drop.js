// js/drop.js

const isMyDeviceMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
const myDeviceType = isMyDeviceMobile ? 'mobile' : 'pc';

let myPeer = null;
let myPeerId = sessionStorage.getItem('wind_peer_id');
let isTransferring = false;
let activeConnection = null;
let incomingChunks = [];
let receivedSize = 0;

if (!myPeerId) {
    myPeerId = 'wind_' + Math.floor(Math.random() * 9000 + 1000); 
    sessionStorage.setItem('wind_peer_id', myPeerId);
}

// Chặn thoát trang
window.addEventListener('beforeunload', (e) => {
    if (isTransferring) {
        e.preventDefault();
        e.returnValue = 'Đang chuyển tệp, bạn có chắc muốn thoát không?'; 
        return 'Đang chuyển tệp, bạn có chắc muốn thoát không?';
    }
});

window.initWindDrop = function() {
    if (myPeer && !myPeer.destroyed) {
        console.log("Wind Drop đã sẵn sàng.");
        return; 
    }

    const statusEl = document.getElementById('dropStatus');
    if(statusEl) statusEl.innerText = "Đang kết nối...";

    myPeer = new Peer(myPeerId, {
        debug: 1,
        config: {
            'iceServers': [
                { url: 'stun:stun.l.google.com:19302' },
                { url: 'stun:stun1.l.google.com:19302' }
            ]
        }
    });

    myPeer.on('open', (id) => {
        myPeerId = id;
        if(statusEl) statusEl.innerText = "Sẵn sàng (ID: " + id + ")";
        announcePresence();
    });

    myPeer.on('connection', (conn) => {
        if (isTransferring) {
            conn.on('open', () => { 
                conn.send({ type: 'busy' }); 
                setTimeout(() => conn.close(), 500); 
            });
            return;
        }
        setupIncomingConnection(conn);
    });

    myPeer.on('error', (err) => {
        if (err.type === 'unavailable-id') {
            myPeerId = 'wind_' + Math.floor(Math.random() * 9000 + 1000);
            sessionStorage.setItem('wind_peer_id', myPeerId);
            initWindDrop();
            return;
        }
        if(statusEl) statusEl.innerText = "Lỗi kết nối: " + err.type;
        resetTransferState();
    });

    db.ref('wind_drop_active').on('value', (snapshot) => {
        renderPeers(snapshot.val());
    });
}

function announcePresence() {
    const userRef = db.ref('wind_drop_active/' + myPeerId);
    userRef.onDisconnect().remove();
    userRef.set({
        name: (window.isAdmin) ? "Admin" : "Khách " + myPeerId.split('_')[1],
        lastSeen: firebase.database.ServerValue.TIMESTAMP
    });
}

function renderPeers(users) {
    const orbitZone = document.getElementById('user-orbit-zone');
    if(!orbitZone) return;
    orbitZone.innerHTML = '';
    
    if (!users) return;
    const userList = Object.keys(users).filter(id => id !== myPeerId); 
    const statusEl = document.getElementById('dropStatus');
    if(statusEl) statusEl.innerText = `Đang quét: ${userList.length} thiết bị`;

    const radarContainer = document.querySelector('.radar-zone');
    if(!radarContainer) return;

    const orbitRadius = radarContainer.clientWidth * 0.32; 
    const centerX = radarContainer.clientWidth / 2;
    const centerY = radarContainer.clientHeight / 2;

    userList.forEach((userId, index) => {
        const user = users[userId];
        const el = document.createElement('div');
        el.className = 'peer-user';
        
        const angle = (index / userList.length) * 2 * Math.PI;
        const x = Math.cos(angle) * orbitRadius + centerX;
        const y = Math.sin(angle) * orbitRadius + centerY;
        
        el.style.left = x + 'px';
        el.style.top = y + 'px';
        el.innerHTML = `<div class="peer-icon">👤</div><span>${user.name}</span>`;
        
        // Gắn sự kiện kéo thả vào chính icon này
        setupDragDrop(el, userId);
        orbitZone.appendChild(el);
    });
}

function setupDragDrop(element, targetId) {
    element.addEventListener('dragover', (e) => { e.preventDefault(); element.classList.add('drag-over'); });
    element.addEventListener('dragleave', () => { element.classList.remove('drag-over'); });
    element.addEventListener('drop', (e) => {
        e.preventDefault();
        element.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0) {
            uploadFileP2P(e.dataTransfer.files[0], targetId);
        }
    });
    element.onclick = () => {
         const input = document.createElement('input');
         input.type = 'file';
         input.onchange = (e) => {
             if(e.target.files[0]) uploadFileP2P(e.target.files[0], targetId);
         };
         input.click();
    };
}

// --- LOGIC GỬI FILE (Đã thêm Delay an toàn) ---
function uploadFileP2P(file, targetPeerId) {
    if (!myPeer) return;
    window.showToast(`Đang kết nối tới ${targetPeerId}...`);
    
    const conn = myPeer.connect(targetPeerId, { reliable: true });
    
    conn.on('open', () => {
        const safeType = file.type || 'application/octet-stream';
        // QUAN TRỌNG: Đợi 500ms để kết nối ổn định trước khi gửi yêu cầu
        // Giúp tránh việc máy khách chưa kịp lắng nghe sự kiện
        setTimeout(() => {
            conn.send({ type: 'meta', fileName: file.name, fileSize: file.size, fileType: safeType });
        }, 500); 
    });

    conn.on('data', (response) => {
        if (response.type === 'ack' && response.status === 'ok') {
            isTransferring = true;
            document.getElementById('transfer-panel').style.display = 'block';
            
            // Lấy loại thiết bị đích để tối ưu gói tin
            const receiverType = response.deviceType || 'mobile';
            sendFileInChunks(file, conn, receiverType);
        } else if (response.type === 'busy') {
            window.showToast("Người nhận đang bận!");
            conn.close();
        }
    });
}

async function sendFileInChunks(file, conn, receiverType) {
    let offset = 0;
    const CHUNK = 64 * 1024;
    let chunkCounter = 0;
    let lastUpdateTime = 0;

    // CẤU HÌNH TỐC ĐỘ (Quan trọng)
    let maxBufferThreshold; 
    let throttleInterval;   
    let sleepTime;          

    if (myDeviceType === 'pc') {
        if (receiverType === 'pc') {
            maxBufferThreshold = 8 * 1024 * 1024; 
            throttleInterval = 100; sleepTime = 1;
        } else {
            maxBufferThreshold = 2 * 1024 * 1024; 
            throttleInterval = 10; sleepTime = 20;
        }
    } else {
        if (receiverType === 'pc') {
            maxBufferThreshold = 8 * 1024 * 1024; 
            throttleInterval = 200; sleepTime = 1;
        } else {
            maxBufferThreshold = 6 * 1024 * 1024; 
            throttleInterval = 100; sleepTime = 2;
        }
    }

    try {
        while (offset < file.size) {
            if(!isTransferring || !conn.open) break;
            
            if (conn.dataChannel.bufferedAmount > maxBufferThreshold) {
                 await new Promise(r => setTimeout(r, 5)); 
                 continue;
            }

            const slice = file.slice(offset, offset + CHUNK);
            const buffer = await slice.arrayBuffer();
            
            conn.send({ type: 'chunk', data: buffer });
            offset += CHUNK;
            chunkCounter++;
            
            if (throttleInterval > 0 && chunkCounter % throttleInterval === 0) {
                await new Promise(r => setTimeout(r, sleepTime)); 
            }

            const now = Date.now();
            if (now - lastUpdateTime > 100 || offset === file.size) {
                const percent = (offset / file.size) * 100;
                updateTransferUI(percent, 'Đang gửi...');
                lastUpdateTime = now;
            }
        }
        
        if (isTransferring) {
            window.showToast("✅ Gửi hoàn tất!");
            resetTransferState();
        }
    } catch(e) {
        console.error(e);
        window.showToast("Lỗi khi gửi file");
        resetTransferState();
    }
}

function setupIncomingConnection(conn) {
    conn.on('data', (data) => {
        if(data.type === 'meta') {
            window.incomingMeta = data;
            
            // Gọi Explicit window.showActionModal để đảm bảo tìm thấy hàm
            window.showActionModal({
                title: "Nhận file?",
                desc: `Bạn có muốn nhận file "${data.fileName}" (${formatSize(data.fileSize)}) không?`,
                type: 'confirm',
                onConfirm: () => {
                    isTransferring = true;
                    conn.send({ type: 'ack', status: 'ok', deviceType: myDeviceType });
                    
                    document.getElementById('transfer-panel').style.display = 'block';
                    document.getElementById('tf-filename').innerText = data.fileName;
                    incomingChunks = [];
                    receivedSize = 0;
                }
            });
            
        } else if (data.type === 'chunk') {
            incomingChunks.push(data.data);
            receivedSize += data.data.byteLength;
            
            const percent = (receivedSize / window.incomingMeta.fileSize) * 100;
            updateTransferUI(percent, 'Đang nhận...');

            if(receivedSize >= window.incomingMeta.fileSize) {
                const blob = new Blob(incomingChunks, { type: window.incomingMeta.fileType });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = window.incomingMeta.fileName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                
                resetTransferState();
                window.showToast("Đã tải xong!");
            }
        } else if (data.type === 'cancel') {
            window.showToast("Người gửi đã hủy");
            resetTransferState();
        }
    });
}

function updateTransferUI(percent, text) {
    document.getElementById('tf-progress').style.width = percent + '%';
    document.getElementById('tf-status').innerText = `${text} ${Math.floor(percent)}%`;
}

function resetTransferState() {
    isTransferring = false;
    activeConnection = null;
    incomingChunks = [];
    receivedSize = 0;
    const panel = document.getElementById('transfer-panel');
    if(panel) panel.style.display = 'none';
}

function formatSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}