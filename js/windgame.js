// Dynamic Wind Game card rendering + iframe host
(function(){
    const GAMES = [
        {
            id: 'tankbattle',
            title: 'Tank Battle',
            desc: 'Trò chơi chiến đấu xe tăng PvP',
            thumb: './games/tankbattle/thumnail.png',
            url: './games/tankbattle/index.html'
        }
        // future games can be appended here
    ];

    window.initWindGame = function() {
        renderGameCards();
    }

    function renderGameCards() {
        const grid = document.getElementById('windgame-grid');
        if (!grid) return;
        grid.innerHTML = '';
        GAMES.forEach(g => {
            const card = document.createElement('div');
            card.className = 'game-card';

            // derive domain for favicon fallback
            let thumb = g.thumb || '';
            try {
                const urlObj = new URL(g.url);
                const domain = urlObj.hostname;
                if (!thumb) thumb = `https://www.google.com/s2/favicons?sz=256&domain=${domain}`;
            } catch (e) {
                if (!thumb) thumb = 'https://via.placeholder.com/400x200.png?text=Game';
            }

            card.innerHTML = `
                <img src="${thumb}" class="game-thumb" alt="${escapeHtml(g.title)}" />
                <div class="game-title">${escapeHtml(g.title)}</div>
                <div class="game-desc">${escapeHtml(g.desc)}</div>
                <div class="game-actions">
                    <button class="btn-play" onclick="launchGame('${g.url}')">Chơi Ngay</button>
                </div>`;
            // open on card click as well
            card.onclick = (ev) => {
                // avoid triggering when clicking a button inside
                if (ev.target.tagName.toLowerCase() === 'button') return;
                launchGame(g.url);
            };
            grid.appendChild(card);
        });
    }

    // Navigate to game page (embed or standalone)
    window.launchGame = function(url) {
        const isLocalGame = url.includes('/games/');
        if (isLocalGame) {
            // Mark that we're launching a game so we can restore on return
            sessionStorage.setItem('returnToWindGame', 'true');
            console.log('Launching game - sessionStorage.returnToWindGame = true');
            // Navigate to local game
            window.location.href = url;
        } else {
            // For future online games - could embed in iframe
            window.open(url, '_blank');
        }
    }

    // (removed open-in-new-tab button — games launch in current context)



    window.closeWindGame = function() {
        // This function is no longer needed as games now open in new context
        console.log('Games now open in new context - no iframe cleanup needed');
    }

    // small helpers
    function escapeHtml(s) { return (s+'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
    function escapeJs(s) { return (s+'').replace(/'/g, "\\'").replace(/\n/g,'\\n'); }

})();
