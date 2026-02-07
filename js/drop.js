// js/drop.js

const isMyDeviceMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
const myDeviceType = isMyDeviceMobile ? 'mobile' : 'pc';

let myPeer = null;
let myPeerId = sessionStorage.getItem('wind_peer_id');
let isTransferring = false;
let activeConnection = null;
let incomingChunks = [];
let receivedSize = 0;
let currentWriter = null;

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

// --- THUẬT TOÁN ADAPTIVE CHUNKING ---
async function sendFileInChunks(file, conn, receiverType) {
    let offset = 0;
    
    // Cấu hình thuật toán thích ứng
    let chunkSize = 64 * 1024; // Khởi điểm: 64KB
    const MAX_CHUNK_SIZE = 1024 * 1024; // Tối đa: 1MB (Tăng tốc độ mạng LAN)
    const MIN_CHUNK_SIZE = 16 * 1024;   // Tối thiểu: 16KB (Cho mạng yếu)
    
    // Cấu hình bộ đệm (Backpressure)
    // Mobile RAM yếu nên giữ buffer thấp hơn PC
    const MAX_BUFFERED_AMOUNT = (receiverType === 'mobile' || myDeviceType === 'mobile') 
        ? 8 * 1024 * 1024  // 8MB cho Mobile
        : 16 * 1024 * 1024; // 16MB cho PC

    let lastUpdateTime = 0;
    let lastChunkDuration = 0;

    // Thiết lập ngưỡng báo động thấp cho WebRTC
    try {
        if (conn.dataChannel) {
            conn.dataChannel.bufferedAmountLowThreshold = 65536; // 64KB
        }
    } catch (e) { console.warn("Browser not support bufferedAmountLowThreshold"); }

    try {
        const fileReader = new FileReader(); // Dùng FileReader tái sử dụng để giảm GC (Garbage Collection)

        while (offset < file.size) {
            if (!isTransferring || !conn.open) break;

            // 1. BACKPRESSURE: Kiểm soát dòng chảy
            // Nếu "ống nước" đang đầy, hãy chờ nó rút bớt nước
            if (conn.dataChannel.bufferedAmount > MAX_BUFFERED_AMOUNT) {
                await new Promise(resolve => {
                    const onLow = () => {
                        conn.dataChannel.removeEventListener('bufferedamountlow', onLow);
                        resolve();
                    };
                    conn.dataChannel.addEventListener('bufferedamountlow', onLow);
                    // Fallback: Nếu mạng lag không báo event, tự check lại sau 500ms
                    setTimeout(() => {
                        conn.dataChannel.removeEventListener('bufferedamountlow', onLow);
                        resolve();
                    }, 500);
                });
            }

            // 2. CHUẨN BỊ DỮ LIỆU
            const chunkStartTime = Date.now();
            const slice = file.slice(offset, offset + chunkSize);
            const buffer = await slice.arrayBuffer();

            // 3. GỬI DỮ LIỆU
            try {
                conn.send({ type: 'chunk', data: buffer });
            } catch (err) {
                console.warn("Lỗi gửi chunk, thử lại...", err);
                // Nếu lỗi, giảm ngay size gói tin và thử lại vòng sau (không tăng offset)
                chunkSize = Math.max(MIN_CHUNK_SIZE, chunkSize / 2);
                await new Promise(r => setTimeout(r, 500)); // Nghỉ 1 chút
                continue; 
            }

            // 4. THUẬT TOÁN THÍCH ỨNG (ADAPTIVE LOGIC)
            const chunkEndTime = Date.now();
            const duration = chunkEndTime - chunkStartTime;

            // Nếu gửi quá nhanh (< 50ms) -> Mạng tốt -> Tăng size để gửi được nhiều hơn
            if (duration < 50 && chunkSize < MAX_CHUNK_SIZE) {
                chunkSize *= 2; 
                // console.log("🚀 Tăng tốc độ: Gói tin lên " + chunkSize/1024 + "KB");
            }
            // Nếu gửi quá chậm (> 200ms) -> Mạng nghẽn -> Giảm size để gói tin đi mượt hơn
            else if (duration > 200 && chunkSize > MIN_CHUNK_SIZE) {
                chunkSize = Math.ceil(chunkSize / 2);
                // console.log("🐢 Mạng chậm: Giảm gói tin xuống " + chunkSize/1024 + "KB");
            }

            // 5. CẬP NHẬT TIẾN TRÌNH
            offset += buffer.byteLength; // Dùng byteLength thực tế
            
            // Chỉ update UI mỗi 100ms để đỡ lag Main Thread
            if (chunkEndTime - lastUpdateTime > 100 || offset >= file.size) {
                const percent = (offset / file.size) * 100;
                // Tính tốc độ truyền (MB/s) - Optional
                // const speed = (chunkSize / duration) * 1000 / 1024 / 1024; 
                
                updateTransferUI(percent, `Đang gửi...`); 
                lastUpdateTime = chunkEndTime;
                
                // Nhường thread cho UI vẽ lại (quan trọng)
                await new Promise(r => setTimeout(r, 0));
            }
        }

        if (isTransferring) {
            window.showToast("✅ Gửi hoàn tất!");
            resetTransferState();
        }
    } catch (e) {
        console.error("Transfer Critical Error:", e);
        window.showToast("Lỗi truyền tải: " + e.message);
        resetTransferState();
    }
}

function setupIncomingConnection(conn) {
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
                    activeConnection = conn; 
                    conn.send({ type: 'ack', status: 'ok', deviceType: myDeviceType });
                    
                    document.getElementById('transfer-panel').style.display = 'block';
                    document.getElementById('tf-filename').innerText = data.fileName;
                    
                    // [NÂNG CẤP] Khởi tạo StreamSaver thay vì mảng Array
                    // Tạo luồng ghi trực tiếp xuống ổ cứng
                    const fileStream = streamSaver.createWriteStream(data.fileName, {
                        size: data.fileSize // Khai báo kích thước để hiện thanh tiến độ trình duyệt
                    });
                    
                    // Lấy writer để ghi dữ liệu sau này
                    window.currentWriter = fileStream.getWriter();
                    receivedSize = 0;
                }
            });
            
        } else if (data.type === 'chunk') {
            if (!isTransferring || !window.currentWriter) return; 

            // [NÂNG CẤP] Ghi thẳng vào ổ cứng, không lưu RAM
            // data.data là ArrayBuffer, cần chuyển thành Uint8Array để ghi
            window.currentWriter.write(new Uint8Array(data.data));
            
            receivedSize += data.data.byteLength;
            
            // Cập nhật giao diện (Giữ nguyên logic cũ)
            const percent = (receivedSize / window.incomingMeta.fileSize) * 100;
            updateTransferUI(percent, 'Đang nhận...');

            // Khi nhận xong
            if(receivedSize >= window.incomingMeta.fileSize) {
                // Đóng luồng ghi file
                if (window.currentWriter) {
                    window.currentWriter.close();
                    window.currentWriter = null;
                }
                
                resetTransferState();
                window.showToast("Đã lưu file thành công!");
            }
        } else if (data.type === 'cancel') {
            window.showToast("⛔ Người gửi đã hủy chuyển tệp.");
            // Nếu hủy giữa chừng, đóng writer và báo lỗi cho trình duyệt biết
            if (window.currentWriter) {
                window.currentWriter.abort("Người gửi đã hủy");
                window.currentWriter = null;
            }
            resetTransferState();
        }
    });

    conn.on('close', () => {
        if (isTransferring) {
            window.showToast("Mất kết nối!");
            if (window.currentWriter) {
                window.currentWriter.close(); // Hoặc .abort() tùy ý
                window.currentWriter = null;
            }
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
    // Không còn incomingChunks nữa
    receivedSize = 0;
    window.currentWriter = null; // Reset writer
    
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