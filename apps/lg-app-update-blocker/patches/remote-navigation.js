// webOS 5-way remote navigation patch for LG App Update Blocker.
// Keeps application/service behavior unchanged; only adds keyboard/remote focus movement.
(function () {
    'use strict';

    // Deliberately exclude text inputs and the theme toggle from D-pad navigation.
    // On webOS, merely focusing a textarea can open the on-screen keyboard and trap
    // arrow-key navigation. Text entry remains available through pointer-based focus.
    const NAV_SELECTOR = 'button:not(:disabled):not(.theme-toggle)';
    const PREFERRED_START_ID = 'refreshUpdateInfo';

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

    function preferredStart() {
        const el = document.getElementById(PREFERRED_START_ID);
        return el && !el.disabled && visible(el) ? el : null;
    }

    function focusElement(el) {
        if (!el) return;
        el.focus();
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    function ensureFocus(forcePreferred) {
        const items = candidates();
        if (!items.length) return;

        const preferred = preferredStart();
        if (forcePreferred && preferred) {
            focusElement(preferred);
            return;
        }

        if (items.indexOf(document.activeElement) === -1) {
            focusElement(preferred || items[0]);
        }
    }

    function move(direction) {
        const items = candidates();
        if (!items.length) return;

        let current = document.activeElement;
        if (items.indexOf(current) === -1) {
            focusElement(preferredStart() || items[0]);
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

        if ((key === 'Enter' || key === 13) && active && active.tagName === 'BUTTON' && !active.disabled) {
            event.preventDefault();
            active.click();
            return;
        }

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

    window.addEventListener('load', function () {
        // The service enables the real controls asynchronously. Prefer the top-left
        // Refresh Status button once it becomes available instead of inheriting
        // browser focus from the theme button or an input field.
        setTimeout(function () { ensureFocus(true); }, 250);
        setTimeout(function () { ensureFocus(true); }, 1500);
    });

    const observer = new MutationObserver(function (mutations) {
        for (let i = 0; i < mutations.length; i++) {
            if (mutations[i].attributeName === 'disabled') {
                const target = mutations[i].target;
                if (target && target.id === PREFERRED_START_ID && !target.disabled) {
                    focusElement(target);
                } else {
                    ensureFocus(false);
                }
                break;
            }
        }
    });

    document.querySelectorAll('button').forEach(function (el) {
        observer.observe(el, { attributes: true });
    });
})();
