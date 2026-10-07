// GTV system firmware update-cache controls.
// Uses the already elevated LG App Update Blocker service; no SSH session is required.
(function () {
    'use strict';

    var statusEl = document.getElementById('firmwareCacheStatus');
    var contentEl = document.getElementById('firmwareCacheContent');
    var refreshBtn = document.getElementById('refreshFirmwareCache');
    var clearBtn = document.getElementById('clearFirmwareCache');
    var serviceReadyBtn = document.getElementById('refreshUpdateInfo');
    var responseEl = document.getElementById('response');
    var serviceReady = false;
    var lastState = null;

    if (!statusEl || !contentEl || !refreshBtn || !clearBtn || !serviceReadyBtn) {
        return;
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatBytes(bytes) {
        if (!bytes) return '0 B';
        var units = ['B', 'KiB', 'MiB', 'GiB'];
        var value = bytes;
        var unit = 0;
        while (value >= 1024 && unit < units.length - 1) {
            value /= 1024;
            unit++;
        }
        return (unit === 0 ? value : value.toFixed(value >= 10 ? 1 : 2)) + ' ' + units[unit];
    }

    function showMessage(message, isError) {
        if (!responseEl) return;
        responseEl.className = isError ? 'response error' : 'response';
        responseEl.innerText = message;
        responseEl.style.display = 'block';
        setTimeout(function () {
            responseEl.style.display = 'none';
        }, 5000);
    }

    function setStatus(text, color) {
        statusEl.innerText = text;
        statusEl.style.color = color;
    }

    function renderState(state) {
        lastState = state;
        clearBtn.disabled = true;

        if (!state.exists) {
            setStatus('Firmware update cache directory is not present on this TV', 'var(--text-secondary)');
            contentEl.innerHTML =
                '<p>No <code>/mnt/lg/cmn_data/swupdate/</code> directory was found.</p>' +
                '<p>Nothing will be deleted.</p>';
            return;
        }

        var entries = Array.isArray(state.entries) ? state.entries : [];
        if (entries.length === 0) {
            setStatus('No cached system firmware update files found', 'var(--success-color)');
            contentEl.innerHTML = '<p>The system firmware update cache is empty.</p>';
            return;
        }

        setStatus(
            entries.length + ' firmware update cache entr' + (entries.length === 1 ? 'y' : 'ies') + ' found',
            'var(--warning-text)'
        );

        var parts = [];
        if (state.phase) {
            parts.push('<p><strong>Reported phase:</strong> ' + escapeHtml(state.phase) + '</p>');
        }
        parts.push('<p><strong>Total regular-file size:</strong> ' + escapeHtml(formatBytes(state.totalBytes || 0)) + '</p>');
        parts.push('<ul style="margin: 10px 0; padding-left: 20px;">');

        entries.forEach(function (entry) {
            var details = entry.type;
            if (entry.type === 'file') {
                details += ', ' + formatBytes(entry.size || 0);
            }
            if (entry.error) {
                details += ', error: ' + entry.error;
            }
            parts.push(
                '<li><strong>' + escapeHtml(entry.name) + '</strong> <span style="color: var(--text-secondary);">(' +
                escapeHtml(details) + ')</span></li>'
            );
        });
        parts.push('</ul>');

        if ((state.deletableCount || 0) < entries.length) {
            parts.push('<p style="color: var(--text-secondary);">Directories and other non-file entries are shown but will not be removed.</p>');
        }

        contentEl.innerHTML = parts.join('');
        clearBtn.disabled = !serviceReady || (state.deletableCount || 0) === 0;
    }

    function loadCache() {
        if (!serviceReady) return;

        refreshBtn.disabled = true;
        clearBtn.disabled = true;
        setStatus('Checking firmware update cache...', 'var(--text-secondary)');

        webOS.service.request("luna://org.webosbrew.appupdateblocker.service", {
            method: "readSystemUpdateCache",
            parameters: {},
            onSuccess: function (res) {
                refreshBtn.disabled = false;
                renderState(res);
            },
            onFailure: function (error) {
                refreshBtn.disabled = false;
                setStatus('Failed to inspect firmware update cache', 'var(--error-color)');
                contentEl.innerHTML = '<p>' + escapeHtml(error.errorText || 'Unknown error') + '</p>';
            }
        });
    }

    function markServiceReady() {
        if (serviceReady) return;
        serviceReady = true;
        refreshBtn.disabled = false;
        loadCache();
    }

    if (!serviceReadyBtn.disabled) {
        markServiceReady();
    } else {
        var observer = new MutationObserver(function () {
            if (!serviceReadyBtn.disabled) {
                observer.disconnect();
                markServiceReady();
            }
        });
        observer.observe(serviceReadyBtn, { attributes: true, attributeFilter: ['disabled'] });
    }

    refreshBtn.onclick = function () {
        loadCache();
    };

    clearBtn.onclick = function () {
        if (!serviceReady || !lastState || (lastState.deletableCount || 0) === 0) {
            return;
        }

        var count = lastState.deletableCount;
        var prompt =
            'Delete ' + count + ' cached system firmware update file' + (count === 1 ? '' : 's') +
            ' from /mnt/lg/cmn_data/swupdate/?\n\n' +
            'This clears cached update state only. It does not downgrade the TV or delete directories.';

        if (!confirm(prompt)) {
            return;
        }

        refreshBtn.disabled = true;
        clearBtn.disabled = true;
        setStatus('Deleting firmware update cache files...', 'var(--text-secondary)');

        webOS.service.request("luna://org.webosbrew.appupdateblocker.service", {
            method: "clearSystemUpdateCache",
            parameters: {},
            onSuccess: function (res) {
                showMessage(res.message || 'Firmware update cache cleared', false);
                refreshBtn.disabled = false;
                loadCache();
            },
            onFailure: function (error) {
                showMessage('Failed to clear firmware update cache: ' + (error.errorText || 'Unknown error'), true);
                refreshBtn.disabled = false;
                loadCache();
            }
        });
    };
})();
