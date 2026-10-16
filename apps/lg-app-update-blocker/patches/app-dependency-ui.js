// GTV: inspect and clear updateDependencyInfo without altering original updateInfo.
(function () {
    'use strict';

    var statusEl = document.getElementById('updateDependencyStatus');
    var contentEl = document.getElementById('updateDependencyContent');
    var refreshBtn = document.getElementById('refreshUpdateDependencyInfo');
    var clearBtn = document.getElementById('clearUpdateDependencyInfo');
    var serviceReadyBtn = document.getElementById('refreshUpdateInfo');
    var responseEl = document.getElementById('response');
    var serviceReady = false;
    var canClear = false;

    if (!statusEl || !contentEl || !refreshBtn || !clearBtn || !serviceReadyBtn) return;

    function showMessage(message, error) {
        if (!responseEl) return;
        responseEl.className = error ? 'response error' : 'response';
        responseEl.textContent = message;
        responseEl.style.display = 'block';
        setTimeout(function () { responseEl.style.display = 'none'; }, 5000);
    }

    function setStatus(message) {
        statusEl.textContent = message;
    }

    function renderState(state) {
        canClear = false;
        clearBtn.disabled = true;

        if (!state.exists) {
            setStatus('Dependency cache file is not present on this TV');
            contentEl.textContent = 'No updateDependencyInfo file was found. Nothing to clear.';
            return;
        }

        var raw = state.content || '';
        if (!raw.trim()) {
            setStatus('Dependency cache file is empty');
            contentEl.textContent = '(empty file)';
            return;
        }

        var data;
        try {
            data = JSON.parse(raw);
        } catch (error) {
            setStatus('Unrecognized dependency cache format; clearing disabled');
            contentEl.textContent = raw;
            return;
        }

        contentEl.textContent = JSON.stringify(data, null, 2);
        if (Array.isArray(data)) {
            canClear = data.length > 0;
            setStatus(data.length + ' cached dependency entr' + (data.length === 1 ? 'y' : 'ies'));
        } else if (data !== null && typeof data === 'object') {
            var count = Object.keys(data).length;
            canClear = count > 0;
            setStatus(count + ' top-level dependency entr' + (count === 1 ? 'y' : 'ies'));
        } else {
            setStatus('Unexpected dependency cache JSON type; clearing disabled');
        }
        clearBtn.disabled = !serviceReady || !canClear;
    }

    function loadState() {
        if (!serviceReady) return;
        refreshBtn.disabled = true;
        clearBtn.disabled = true;
        setStatus('Reading dependency update cache...');
        webOS.service.request('luna://org.webosbrew.appupdateblocker.service', {
            method: 'readUpdateDependencyInfo',
            parameters: {},
            onSuccess: function (res) {
                refreshBtn.disabled = false;
                if (!res.returnValue) {
                    setStatus('Could not read dependency update cache');
                    contentEl.textContent = res.errorText || 'Unknown service error';
                    return;
                }
                renderState(res);
            },
            onFailure: function (error) {
                refreshBtn.disabled = false;
                setStatus('Could not read dependency update cache');
                contentEl.textContent = error.errorText || 'Unknown service error';
            }
        });
    }

    function markServiceReady() {
        if (serviceReady) return;
        serviceReady = true;
        refreshBtn.disabled = false;
        loadState();
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

    refreshBtn.onclick = function () { loadState(); };

    clearBtn.onclick = function () {
        if (!serviceReady || !canClear) return;
        if (!confirm('Clear cached dependency-update information?\n\n' +
                     'Only updateDependencyInfo will be cleared. The original forced-update list is untouched. ' +
                     'A full TV restart may be needed to dismiss the update gate.')) return;

        refreshBtn.disabled = true;
        clearBtn.disabled = true;
        canClear = false;
        setStatus('Clearing dependency update cache...');
        webOS.service.request('luna://org.webosbrew.appupdateblocker.service', {
            method: 'clearUpdateDependencyInfo',
            parameters: {},
            onSuccess: function (res) {
                if (!res.returnValue) showMessage(res.errorText || 'Could not clear dependency update cache', true);
                else showMessage(res.message || 'Dependency update cache cleared', false);
                refreshBtn.disabled = false;
                loadState();
            },
            onFailure: function (error) {
                showMessage('Could not clear dependency update cache: ' + (error.errorText || 'Unknown error'), true);
                refreshBtn.disabled = false;
                loadState();
            }
        });
    };
})();
