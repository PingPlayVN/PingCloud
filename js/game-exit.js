// Common exit handler for all games in /games folder
// When a game calls `exitToWindGame()` this will navigate back to the main
// index and trigger the Wind Game tab restore (via core.js auto-restore).

function exitToWindGame() {
    try {
        // navigate to root index with #windgame hash so core.js can restore the tab
        window.location.href = '../../index.html#windgame';
    } catch (e) {
        // fallback: try parent opener if available
        try {
            if (window.opener && !window.opener.closed) {
                try { window.opener.location.href = '/index.html#windgame'; } catch (e2) { /* ignore cross-origin */ }
            }
        } catch (ignored) {}
        // final fallback
        window.location.href = '/index.html#windgame';
    }
}

console.log('game-exit.js loaded');
