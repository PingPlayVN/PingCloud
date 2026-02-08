// js/palette.js

let currentPaletteHex = [];

function updatePaletteSystem() {
    const baseHexInput = document.getElementById('baseColorInput');
    if(!baseHexInput) return;
    
    const baseHex = baseHexInput.value;
    if (!isValidHex(baseHex)) {
        showToast('Mã màu không hợp lệ');
        return;
    }
    const rule = document.getElementById('harmonyRule').value;
    
    const hexDisplay = document.getElementById('baseColorHex');
    if(hexDisplay) hexDisplay.innerText = baseHex.toUpperCase();
    
    const hsl = hexToHSL(baseHex); 
    let palette = [];

    switch(rule) {
        case 'analogous': 
            palette = [shiftHue(hsl, -30), shiftHue(hsl, -15), hsl, shiftHue(hsl, 15), shiftHue(hsl, 30)];
            break;
        case 'monochromatic': 
            palette = [
                [hsl[0], hsl[1], Math.max(10, hsl[2] - 30)],
                [hsl[0], hsl[1], Math.max(20, hsl[2] - 15)],
                hsl,
                [hsl[0], Math.max(20, hsl[1] - 30), Math.min(90, hsl[2] + 20)],
                [hsl[0], hsl[1], Math.min(95, hsl[2] + 40)]
            ];
            break;
        case 'complementary': 
            palette = [hsl, shiftHue(hsl, 180), [hsl[0], Math.max(10, hsl[1]-20), Math.min(90, hsl[2]+30)], [shiftHue(hsl, 180)[0], hsl[1], Math.max(20, hsl[2]-30)], [hsl[0], hsl[1], 95]];
            break;
        case 'split-complementary': 
            palette = [hsl, shiftHue(hsl, 150), shiftHue(hsl, 210), [hsl[0], 30, 90], [hsl[0], 20, 20]];
            break;
        case 'triadic': 
            palette = [hsl, shiftHue(hsl, 120), shiftHue(hsl, 240), [shiftHue(hsl, 120)[0], 50, 80], [shiftHue(hsl, 240)[0], 50, 80]];
            break;
        case 'tetradic': 
            palette = [hsl, shiftHue(hsl, 180), shiftHue(hsl, 60), shiftHue(hsl, 240), [hsl[0], 10, 90]];
            break;
        default:
            palette = [hsl, hsl, hsl, hsl, hsl];
    }

    renderPalette(palette);
}

function renderPalette(hslArray) {
    const grid = document.getElementById('paletteGrid');
    if(!grid) return;
    grid.innerHTML = '';
    
    currentPaletteHex = [];

    hslArray.forEach((hsl, index) => {
        const hex = HSLToHex(hsl[0], hsl[1], hsl[2]);
        currentPaletteHex.push(hex);

        const strip = document.createElement('div');
        strip.className = 'color-strip';
        strip.style.backgroundColor = hex;
        strip.onclick = () => copyColor(hex);

        let name = index === 2 && hslArray.length === 5 ? "Base" : `Color ${index+1}`;
        if (document.getElementById('harmonyRule').value === 'monochromatic') name = `Lightness ${Math.round(hsl[2])}%`;

        // choose readable label color based on luminance
        const labelColor = getReadableTextColor(hex);

        strip.innerHTML = `
            <div class="strip-info" style="color: ${labelColor}">
                <span class="strip-hex">${hex}</span>
                <span class="strip-name">${name}</span>
            </div>
        `;
        grid.appendChild(strip);
    });
}

function copyColor(hex) {
    navigator.clipboard.writeText(hex).then(() => {
        showToast(`Đã copy màu: ${hex} 📋`);
    }).catch(err => showToast('Không thể copy màu: ' + (err && err.message ? err.message : '')));
}

function randomBaseColor() {
    const randomHex = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
    document.getElementById('baseColorInput').value = randomHex;
    updatePaletteSystem();
}

function exportPalette() {
    if (currentPaletteHex.length > 0) {
        const text = currentPaletteHex.join(', ');
        navigator.clipboard.writeText(text).then(() => {
            showToast("Đã copy toàn bộ mã màu! 📋");
        }).catch(err => showToast('Không thể copy: ' + (err && err.message ? err.message : '')));
    }
}

// Export palette as JSON file
function exportPaletteJSON() {
    if (currentPaletteHex.length === 0) return showToast('Không có bảng màu để xuất');
    const payload = {
        createdAt: new Date().toISOString(),
        base: document.getElementById('baseColorInput') ? document.getElementById('baseColorInput').value : null,
        rule: document.getElementById('harmonyRule') ? document.getElementById('harmonyRule').value : null,
        colors: currentPaletteHex
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `palette-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('Đã tải file JSON');
}

// --- Helpers for validation and contrast ---
function isValidHex(h) {
    return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(h);
}

function getReadableTextColor(hex) {
    // compute luminance, return '#000' or '#fff'
    if (!isValidHex(hex)) return '#000';
    const r = parseInt(hex.substr(1,2),16);
    const g = parseInt(hex.substr(3,2),16);
    const b = parseInt(hex.substr(5,2),16);
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return lum > 0.6 ? '#000' : '#fff';
}

// --- MATH HELPERS ---
function shiftHue(hsl, degree) {
    let newHue = (hsl[0] + degree) % 360;
    if (newHue < 0) newHue += 360;
    return [newHue, hsl[1], hsl[2]];
}

function hexToHSL(H) {
    let r = 0, g = 0, b = 0;
    if (H.length == 4) {
        r = "0x" + H[1] + H[1]; g = "0x" + H[2] + H[2]; b = "0x" + H[3] + H[3];
    } else if (H.length == 7) {
        r = "0x" + H[1] + H[2]; g = "0x" + H[3] + H[4]; b = "0x" + H[5] + H[6];
    }
    r /= 255; g /= 255; b /= 255;
    let cmin = Math.min(r,g,b), cmax = Math.max(r,g,b), delta = cmax - cmin;
    let h = 0, s = 0, l = 0;

    if (delta == 0) h = 0;
    else if (cmax == r) h = ((g - b) / delta) % 6;
    else if (cmax == g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;

    h = Math.round(h * 60);
    if (h < 0) h += 360;
    l = (cmax + cmin) / 2;
    s = delta == 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
    s = +(s * 100).toFixed(1);
    l = +(l * 100).toFixed(1);
    return [h, s, l];
}

function HSLToHex(h, s, l) {
    s /= 100; l /= 100;
    let c = (1 - Math.abs(2 * l - 1)) * s,
        x = c * (1 - Math.abs(((h / 60) % 2) - 1)),
        m = l - c / 2,
        r = 0, g = 0, b = 0;

    if (0 <= h && h < 60) { r = c; g = x; b = 0; }
    else if (60 <= h && h < 120) { r = x; g = c; b = 0; }
    else if (120 <= h && h < 180) { r = 0; g = c; b = x; }
    else if (180 <= h && h < 240) { r = 0; g = x; b = c; }
    else if (240 <= h && h < 300) { r = x; g = 0; b = c; }
    else if (300 <= h && h < 360) { r = c; g = 0; b = x; }
    
    r = Math.round((r + m) * 255).toString(16);
    g = Math.round((g + m) * 255).toString(16);
    b = Math.round((b + m) * 255).toString(16);

    if (r.length == 1) r = "0" + r;
    if (g.length == 1) g = "0" + g;
    if (b.length == 1) b = "0" + b;
    return "#" + r + g + b;
}