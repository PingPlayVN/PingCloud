// js/core.js

// --- 1. FIREBASE CONFIG ---
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
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const db = firebase.database();
const auth = firebase.auth();

// --- 2. GLOBAL STATE ---
window.isAdmin = false;
window.appClipboard = { action: null, id: null };
window.currentFolderId = null; 

// --- 3. SYSTEM UTILS ---
function initDeviceLimit() {
    const activeRef = db.ref('active_sessions');
    const myDeviceRef = activeRef.push(); 
    const connectedRef = db.ref('.info/connected');

    connectedRef.on('value', (snap) => {
        if (snap.val() === true) {
            activeRef.once('value').then(snapshot => {
                const count = snapshot.numChildren();
                const overlay = document.getElementById('limit-overlay');
                
                if (count >= 25 && overlay) { 
                    overlay.style.display = 'flex';
                } else {
                    if(overlay) overlay.style.display = 'none';
                    myDeviceRef.onDisconnect().remove();
                    myDeviceRef.set({
                        timestamp: firebase.database.ServerValue.TIMESTAMP,
                        userAgent: navigator.userAgent
                    });
                }
            });
        }
    });
}
initDeviceLimit();

window.showToast = function(msg) {
    const toast = document.getElementById('toast');
    if(!toast) return;
    toast.innerText = msg;
    toast.className = "show";
    setTimeout(() => toast.className = toast.className.replace("show", ""), 3000);
}

window.extractFileId = function(url) {
    if (!url) return null;
    const match = url.match(/\/d\/([a-zA-Z0-9_-]+)|id=([a-zA-Z0-9_-]+)/);
    return match ? (match[1] || match[2]) : null;
}

// --- 4. MODAL SYSTEM (ĐÃ SỬA LỖI CRASH DOM) ---
// Thay vì cloneNode, ta lấy element trực tiếp mỗi lần gọi hàm
window.showActionModal = function({ title, desc, type, initialValue = '', onConfirm }) {
    const acModal = document.getElementById('actionModal');
    const acTitle = document.getElementById('acModalTitle');
    const acDesc = document.getElementById('acModalDesc');
    const acInput = document.getElementById('acModalInput');
    const acSelect = document.getElementById('acModalSelect');
    const acBtn = document.getElementById('acModalBtn');
    const acCancelBtn = document.querySelector('.btn-modal-cancel');

    if(!acModal) return;

    // Reset trạng thái
    acModal.style.display = 'flex';
    acTitle.innerText = title;
    acDesc.innerText = desc || '';
    acInput.style.display = 'none';
    acDesc.style.display = 'none';
    acSelect.style.display = 'none';
    acCancelBtn.style.display = 'block';

    // Xử lý Input
    if (type === 'prompt') {
        acInput.style.display = 'block';
        acInput.value = initialValue;
        setTimeout(() => acInput.focus(), 100);
    } 
    else if (type === 'select') {
        acSelect.style.display = 'block';
        acSelect.value = initialValue || 'date_desc';
    }
    else if (type === 'confirm') {
        acDesc.style.display = 'block';
    }
    else if (type === 'alert') {
        acDesc.style.display = 'block';
        acCancelBtn.style.display = 'none';
    }

    // Gán sự kiện Click mới (ghi đè sự kiện cũ)
    acBtn.onclick = () => {
        let value = null;
        if (type === 'prompt') value = acInput.value;
        if (type === 'select') value = acSelect.value;
        
        if (onConfirm) onConfirm(value);
        window.closeActionModal();
    };

    // Sự kiện Enter
    acInput.onkeydown = (e) => {
        if (e.key === 'Enter') acBtn.click();
    };
}

window.closeActionModal = function() {
    const acModal = document.getElementById('actionModal');
    if(acModal) acModal.style.display = 'none';
}

// --- 5. AUTH SYSTEM ---
window.showLogin = function() {
    const sidebar = document.getElementById('main-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if(sidebar) sidebar.classList.remove('open');
    if(overlay) overlay.classList.remove('open');

    document.getElementById('overlay').style.display = 'block';
    document.getElementById('login-panel').style.display = 'flex'; 
    
    const errEl = document.getElementById('loginError');
    if(errEl) errEl.style.display = 'none';
}

window.closeLogin = function() {
    document.getElementById('overlay').style.display = 'none';
    document.getElementById('login-panel').style.display = 'none';
}

window.loginAdmin = function() {
    const email = document.getElementById('adminEmail').value;
    const pass = document.getElementById('adminPass').value;
    const btn = document.getElementById('btnLogin');
    const errObj = document.getElementById('loginError');

    if(btn) { btn.innerText = "Đang xử lý..."; btn.disabled = true; }
    
    auth.signInWithEmailAndPassword(email, pass)
        .then(() => {
            window.closeLogin();
            window.showToast("Xin chào Admin! 👋");
        })
        .catch((error) => {
            if(errObj) {
                errObj.innerText = "Sai tài khoản hoặc mật khẩu!";
                errObj.style.display = 'block';
            }
        })
        .finally(() => {
            if(btn) { btn.innerText = "Truy cập!"; btn.disabled = false; }
        });
}

window.logout = function() {
    auth.signOut().then(() => {
        window.showToast("Đã đăng xuất");
        setTimeout(() => location.reload(), 1000);
    });
}

auth.onAuthStateChanged((user) => {
    const btnNew = document.getElementById('btnNew');
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const adminTool = document.getElementById('adminTool');

    if (user) {
        window.isAdmin = true;
        if(btnNew) btnNew.style.display = 'block';
        if(loginBtn) loginBtn.style.display = 'none';
        if(logoutBtn) logoutBtn.style.display = 'flex'; 
    } else {
        window.isAdmin = false;
        if(btnNew) btnNew.style.display = 'none';
        if(adminTool) adminTool.style.display = 'none';
        if(loginBtn) loginBtn.style.display = 'flex';
        if(logoutBtn) logoutBtn.style.display = 'none';
    }
});

// --- 6. NAVIGATION & THEME ---
window.toggleSidebar = function() {
    const sidebar = document.getElementById('main-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    sidebar.classList.toggle('open');
    overlay.classList.toggle('open');
}

window.switchApp = function(appName) {
    window.toggleSidebar();
    const menuItems = document.querySelectorAll('.sidebar-menu .menu-item');
    menuItems.forEach(item => item.classList.remove('active'));

    ['app-cloud', 'app-palette', 'app-drop', 'app-windgame'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    if (appName === 'cloud') {
        if(menuItems[0]) menuItems[0].classList.add('active'); 
        document.getElementById('app-cloud').style.display = 'block';
        document.title = "Wind Cloud - Storage";
    } 
    else if (appName === 'palette') {
        if(menuItems[1]) menuItems[1].classList.add('active');
        document.getElementById('app-palette').style.display = 'block';
        document.title = "Wind Cloud - Color Studio";
        if(typeof updatePaletteSystem === 'function') updatePaletteSystem();
    } 
    else if (appName === 'drop') {
        if(menuItems[2]) menuItems[2].classList.add('active');
        document.getElementById('app-drop').style.display = 'block';
        document.title = "Wind Cloud - Wind Drop";
        if(typeof initWindDrop === 'function') initWindDrop();
    }
    else if (appName === 'windgame') {
        // mark the clicked menu item active (by attribute match)
        const el = document.querySelector(`.sidebar-menu .menu-item[onclick="switchApp('windgame')"]`);
        if (el) el.classList.add('active');
        document.getElementById('app-windgame').style.display = 'block';
        document.title = "Wind Cloud - Wind Game";
        if (typeof initWindGame === 'function') initWindGame();
    }
}

window.toggleTheme = function() {
    const checkbox = document.getElementById('theme-checkbox');
    if (checkbox.checked) {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
    } else {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('theme', 'light');
    }
}
const savedTheme = localStorage.getItem('theme');
if (savedTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    const cb = document.getElementById('theme-checkbox');
    if(cb) cb.checked = true;
}

// --- AUTO-RESTORE WIND GAME TAB ON RETURN FROM GAME ---
function checkAndRestoreWindGame() {
    // Check 1: Hash parameter from game EXIT
    const hash = window.location.hash;
    if (hash === '#windgame') {
        console.log('Hash #windgame detected - restoring Wind Game tab');
        // Clear hash
        window.history.replaceState({}, document.title, window.location.pathname);
        // Use setTimeout to ensure all elements are rendered
        setTimeout(() => {
            window.goToWindGameTab();
        }, 50);
        return;
    }
    
    // Check 2: sessionStorage flag (backup)
    const shouldReturnToWindGame = sessionStorage.getItem('returnToWindGame');
    if (shouldReturnToWindGame === 'true') {
        console.log('sessionStorage flag detected - restoring Wind Game tab');
        sessionStorage.removeItem('returnToWindGame');
        // Use setTimeout to ensure all elements are rendered
        setTimeout(() => {
            window.goToWindGameTab();
        }, 50);
    }
}

// Check on DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkAndRestoreWindGame);
} else {
    // DOM already loaded
    checkAndRestoreWindGame();
}

// Also check on page visibility (for bfcache scenario)
window.addEventListener('pageshow', checkAndRestoreWindGame);
window.goToWindGameTab = function() {
    console.log('goToWindGameTab() called - switching to Wind Game tab...');
    // Clear query parameters to avoid loops
    window.history.replaceState({}, document.title, window.location.pathname);
    // Switch to windgame app - but skip toggleSidebar to prevent flickering
    const menuItems = document.querySelectorAll('.sidebar-menu .menu-item');
    menuItems.forEach(item => item.classList.remove('active'));

    ['app-cloud', 'app-palette', 'app-drop', 'app-windgame'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    // Mark windgame as active
    const el = document.querySelector(`.sidebar-menu .menu-item[onclick="switchApp('windgame')"]`);
    if (el) el.classList.add('active');
    
    // Show windgame app
    document.getElementById('app-windgame').style.display = 'block';
    document.title = "Wind Cloud - Wind Game";
    
    // Initialize windgame
    if (typeof initWindGame === 'function') {
        initWindGame();
    }
    
    console.log('Wind Game tab is now active');
}

// --- 7. PWA REGISTRATION ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then((reg) => {
                console.log('PWA Service Worker đã đăng ký!', reg.scope);
            })
            .catch((err) => {
                console.log('Lỗi đăng ký PWA:', err);
            });
    });
}

// Bắt sự kiện cài đặt để hiển thị nút cài đặt (nếu muốn làm nâng cao sau này)
window.deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    window.deferredPrompt = e;
    // Sau này có thể hiện nút "Cài đặt ứng dụng" và gọi window.deferredPrompt.prompt()
    console.log("App sẵn sàng để cài đặt!");
});