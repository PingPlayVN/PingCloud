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
    
    // [FIX 1] Gán activeConnection để nút Hủy hoạt động phía người gửi
    activeConnection = conn;

    conn.on('open', () => {
        const safeType = file.type || 'application/octet-stream';
        setTimeout(() => {
            if (conn.open) {
                conn.send({ type: 'meta', fileName: file.name, fileSize: file.size, fileType: safeType });
            }
        }, 500); 
    });

    conn.on('data', (response) => {
        if (response.type === 'ack' && response.status === 'ok') {
            isTransferring = true;
            document.getElementById('transfer-panel').style.display = 'block';
            
            const receiverType = response.deviceType || 'mobile';
            sendFileInChunks(file, conn, receiverType);
        } 
        else if (response.type === 'busy') {
            window.showToast("Người nhận đang bận!");
            conn.close();
        }
        // [FIX 2] Xử lý khi người nhận bấm Hủy
        else if (response.type === 'cancel') {
            window.showToast("⛔ Người nhận đã từ chối/hủy chuyển tệp!");
            isTransferring = false; // Ngắt vòng lặp gửi chunk
            resetTransferState();
            setTimeout(() => conn.close(), 500); // Đóng kết nối sau khi xử lý xong
        }
    });

    conn.on('close', () => {
        if (isTransferring) {
            window.showToast("Mất kết nối với người nhận!");
            resetTransferState();
        }
    });
}

async function sendFileInChunks(file, conn, receiverType) {
    let offset = 0;
    const CHUNK = 64 * 1024; // Chunk 64KB (Kích thước chuẩn tối ưu cho PeerJS)
    let lastUpdateTime = 0;

    // 1. Cấu hình High Water Mark (Ngưỡng tràn bộ nhớ đệm)
    // Tăng giới hạn bộ đệm lên cao hơn để tận dụng tốc độ mạng LAN/Wifi 5GHz
    let highWaterMark = 16 * 1024 * 1024; // PC: 16MB buffer

    if (myDeviceType === 'mobile' || receiverType === 'mobile') {
        // Mobile bộ nhớ ít hơn, giảm buffer xuống để tránh crash trình duyệt
        highWaterMark = 16 * 1024 * 1024; // Mobile: 8MB buffer
    }

    // Thiết lập ngưỡng thấp: Khi buffer giảm xuống mức này, sự kiện sẽ được kích hoạt để gửi tiếp
    try {
        if (conn.dataChannel) {
            conn.dataChannel.bufferedAmountLowThreshold = 65536; // 64KB
        }
    } catch (e) {
        console.warn("Trình duyệt không hỗ trợ bufferedAmountLowThreshold", e);
    }

    try {
        while (offset < file.size) {
            // Kiểm tra xem người dùng có hủy hoặc mất kết nối không
            if (!isTransferring || !conn.open) break;

            // 2. BACKPRESSURE CONTROL (Kiểm soát tốc độ thông minh)
            // Nếu hàng đợi đang đầy quá ngưỡng, dừng lại chờ nó vơi bớt
            if (conn.dataChannel.bufferedAmount > highWaterMark) {
                await new Promise(resolve => {
                    const onLow = () => {
                        conn.dataChannel.removeEventListener('bufferedamountlow', onLow);
                        resolve();
                    };
                    conn.dataChannel.addEventListener('bufferedamountlow', onLow);
                    
                    // Fallback an toàn: Nếu mạng bị lag và sự kiện không nổ sau 1s, tự động check lại
                    // Giúp tránh tình trạng treo tiến trình mãi mãi
                    setTimeout(() => {
                        conn.dataChannel.removeEventListener('bufferedamountlow', onLow);
                        resolve();
                    }, 800); 
                });
            }

            // 3. Đọc file và Gửi
            const slice = file.slice(offset, offset + CHUNK);
            const buffer = await slice.arrayBuffer();
            
            try {
                conn.send({ type: 'chunk', data: buffer });
            } catch (err) {
                console.warn("Lỗi gửi chunk (có thể do mất kết nối):", err);
                break;
            }

            offset += CHUNK;

            // 4. Cập nhật UI (Throttle)
            // Chỉ cập nhật UI mỗi 100ms để dành CPU cho việc gửi file
            const now = Date.now();
            if (now - lastUpdateTime > 100 || offset >= file.size) {
                const percent = (offset / file.size) * 100;
                updateTransferUI(percent, 'Đang gửi...');
                lastUpdateTime = now;
                
                // QUAN TRỌNG: Nhường 1 chút thời gian (0ms) cho Main Thread vẽ lại UI
                // Giúp thanh tiến trình mượt mà, không bị đơ trình duyệt
                await new Promise(r => setTimeout(r, 0));
            }
        }

        if (isTransferring) {
            window.showToast("✅ Gửi hoàn tất!");
            resetTransferState();
        }
    } catch (e) {
        console.error("Transfer Error:", e);
        window.showToast("Lỗi truyền tải file: " + e.message);
        resetTransferState();
    }
}

function setupIncomingConnection(conn) {
    // [FIX 3] Gán activeConnection ngay khi có người kết nối tới
    activeConnection = conn;

    conn.on('data', (data) => {
        if(data.type === 'meta') {
            window.incomingMeta = data;
            
            window.showActionModal({
                title: "Nhận file?",
                desc: `Bạn có muốn nhận file "${data.fileName}" (${formatSize(data.fileSize)}) không?`,
                type: 'confirm',
                onConfirm: () => {
                    isTransferring = true;
                    // Gán lại lần nữa cho chắc chắn khi bắt đầu nhận
                    activeConnection = conn; 
                    conn.send({ type: 'ack', status: 'ok', deviceType: myDeviceType });
                    
                    document.getElementById('transfer-panel').style.display = 'block';
                    document.getElementById('tf-filename').innerText = data.fileName;
                    incomingChunks = [];
                    receivedSize = 0;
                }
            });
            
        } else if (data.type === 'chunk') {
            // Nếu đã bị hủy thì không nhận thêm
            if (!isTransferring) return; 

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
            // [FIX 4] Xử lý khi người gửi bấm Hủy
            window.showToast("⛔ Người gửi đã hủy chuyển tệp.");
            resetTransferState();
        }
    });

    conn.on('close', () => {
        if (isTransferring) {
            // Chỉ thông báo lỗi nếu đang chuyển mà bị ngắt, 
            // còn nếu đã xong hoặc đã hủy thì bỏ qua
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

window.cancelTransfer = function() {
    if (!isTransferring && !activeConnection) {
        resetTransferState();
        return;
    }

    // 1. Ngắt trạng thái ngay lập tức để vòng lặp sendFileInChunks dừng lại
    isTransferring = false; 

    // 2. Gửi tín hiệu hủy cho đối phương
    if (activeConnection && activeConnection.open) {
        try {
            console.log("Đang gửi lệnh hủy...");
            activeConnection.send({ type: 'cancel' });
        } catch (err) {
            console.warn("Lỗi gửi lệnh hủy:", err);
        }
    }
    
    window.showToast("⛔ Đã hủy chuyển tệp.");
    resetTransferState();

    // 3. Đợi 1 chút cho tin nhắn đi rồi mới đóng kết nối
    if (activeConnection) {
        const connToClose = activeConnection;
        setTimeout(() => { 
            if(connToClose) {
                connToClose.close(); 
            }
            activeConnection = null;
        }, 800); 
    }
}