// webOS 5-way remote navigation patch for LG App Update Blocker.
// Keeps application/service behavior unchanged; only adds keyboard/remote focus movement.
(function () {
    'use strict';

    const NAV_SELECTOR = 'button:not(:disabled), textarea:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]';

    function visible(el) {
        const r = el.getBoundingClientRect();
        const s = window.getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    }

    function candidates() {
        return Array.prototype.slice.call(document.querySelectorAll(NAV_SELECTOR)).filter(visible);
    }

    function center(el) {
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }

    function move(direction) {
        const items = candidates();
        if (!items.length) return;

        let current = document.activeElement;
        if (items.indexOf(current) === -1) {
            items[0].focus();
            items[0].scrollIntoView({ block: 'nearest', inline: 'nearest' });
            return;
        }

        const from = center(current);
        let best = null;
        let bestScore = Infinity;

        items.forEach(function (item) {
            if (item === current) return;
            const to = center(item);
            const dx = to.x - from.x;
            const dy = to.y - from.y;

            let primary;
            let secondary;
            if (direction === 'left' && dx < -2) { primary = -dx; secondary = Math.abs(dy); }
            else if (direction === 'right' && dx > 2) { primary = dx; secondary = Math.abs(dy); }
            else if (direction === 'up' && dy < -2) { primary = -dy; secondary = Math.abs(dx); }
            else if (direction === 'down' && dy > 2) { primary = dy; secondary = Math.abs(dx); }
            else return;

            const score = primary + secondary * 2.5;
            if (score < bestScore) {
                bestScore = score;
                best = item;
            }
        });

        if (best) {
            best.focus();
            best.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        }
    }

    document.addEventListener('keydown', function (event) {
        const key = event.key || event.keyCode;
        const active = document.activeElement;
        const typing = active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT');

        if ((key === 'Enter' || key === 13) && active && active.tagName === 'BUTTON' && !active.disabled) {
            event.preventDefault();
            active.click();
            return;
        }

        if (typing) return;

        const map = {
            ArrowLeft: 'left', 37: 'left',
            ArrowUp: 'up', 38: 'up',
            ArrowRight: 'right', 39: 'right',
            ArrowDown: 'down', 40: 'down'
        };
        const direction = map[key];
        if (!direction) return;

        event.preventDefault();
        move(direction);
    }, false);

    function ensureFocus() {
        const items = candidates();
        if (items.length && items.indexOf(document.activeElement) === -1) {
            items[0].focus();
        }
    }

    window.addEventListener('load', function () {
        setTimeout(ensureFocus, 250);
        setTimeout(ensureFocus, 1500);
    });

    const observer = new MutationObserver(function (mutations) {
        for (let i = 0; i < mutations.length; i++) {
            if (mutations[i].attributeName === 'disabled') {
                ensureFocus();
                break;
            }
        }
    });

    document.querySelectorAll('button, textarea, input, select').forEach(function (el) {
        observer.observe(el, { attributes: true });
    });
})();
