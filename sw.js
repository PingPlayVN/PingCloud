// sw.js - Service Worker

const CACHE_NAME = 'wind-share-v2'; // Đổi tên này nếu bạn update code để ép trình duyệt tải lại
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css',
    './icon.png',
    './js/core.js',
    './js/cloud.js',
    './js/drop.js',
    './js/palette.js',
    // Cache luôn các thư viện ngoài để chạy nhanh hơn
    'https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js',
    'https://www.gstatic.com/firebasejs/8.10.0/firebase-app.js',
    'https://www.gstatic.com/firebasejs/8.10.0/firebase-auth.js',
    'https://www.gstatic.com/firebasejs/8.10.0/firebase-database.js'
];

// 1. Cài đặt (Install) - Lưu file vào bộ nhớ đệm
self.addEventListener('install', (e) => {
    console.log('[Service Worker] Install');
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

// 2. Kích hoạt (Activate) - Xóa cache cũ
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) {
                    return caches.delete(key);
                }
            }));
        })
    );
    self.clients.claim();
});

// 3. Bắt sự kiện lấy dữ liệu (Fetch) - Ưu tiên Cache, nếu không có mới tải mạng
self.addEventListener('fetch', (e) => {
    // Không cache các request database của Firebase (để dữ liệu luôn mới)
    if (e.request.url.includes('firebase') || e.request.url.includes('firestore') || e.request.url.includes('googleapis')) {
        return; 
    }

    e.respondWith(
        caches.match(e.request).then((response) => {
            return response || fetch(e.request).catch(() => {
                // Nếu mất mạng hoàn toàn và không có trong cache -> Có thể trả về trang offline tùy biến
                // Hiện tại cứ để mặc định
            });
        })
    );
});