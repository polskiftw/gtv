// GTV: application launch inspection, opt-in direct launch, and reversible Home icon policy.
// Home icon changes only when the user explicitly confirms an app-specific override.
(function () {
    'use strict';

    var ROOT_SERVICE = 'luna://org.webosbrew.appupdateblocker.service';
    var HOMEBREW_SERVICE = 'luna://org.webosbrew.hbchannel.service';
    var APP_MANAGER = 'luna://com.webos.applicationManager';
    var HISTORY_KEY = 'gtv.launchDiagnostic.lastRequest';
    var INVENTORY_COMMAND = "/usr/bin/luna-send -n 1 -w 5000 luna://com.webos.applicationManager/listApps '{}'";
    var PAGE_SIZE = 8;
    var apps = [];
    var selected = -1;
    var page = 0;
    var ready = false;

    var refreshBtn = document.getElementById('refreshLaunchApps');
    var previousBtn = document.getElementById('previousLaunchPage');
    var nextBtn = document.getElementById('nextLaunchPage');
    var inspectBtn = document.getElementById('inspectLaunchApp');
    var launchBtn = document.getElementById('launchWithoutUpdateCheck');
    var homeEnableBtn = document.getElementById('enableHomeLaunchOverride');
    var homeRestoreBtn = document.getElementById('restoreHomeLaunchOverride');
    var homeStatusEl = document.getElementById('homeLaunchPolicyStatus');
    var homeLookupSerial = 0;
    var listEl = document.getElementById('launchAppList');
    var statusEl = document.getElementById('launchInventoryStatus');
    var selectedEl = document.getElementById('selectedLaunchApp');
    var reportEl = document.getElementById('launchDiagnosticResult');
    var historyEl = document.getElementById('launchDiagnosticHistory');
    var serviceReadyBtn = document.getElementById('refreshUpdateInfo');
    if (!refreshBtn || !previousBtn || !nextBtn || !inspectBtn || !launchBtn ||
        !homeEnableBtn || !homeRestoreBtn || !homeStatusEl ||
        !listEl || !statusEl || !selectedEl || !reportEl || !historyEl || !serviceReadyBtn) return;

    function errorText(result) {
        if (!result) return 'No response from webOS';
        var message = result.errorText || result.message || result.error || 'Unknown webOS service error';
        return String(message) + (result.errorCode == null ? '' : ' (code ' + result.errorCode + ')');
    }

    function savedResult(message) {
        historyEl.textContent = message;
        try {
            localStorage.setItem(HISTORY_KEY, message);
        } catch (ignored) {}
    }

    try {
        historyEl.textContent = localStorage.getItem(HISTORY_KEY) || 'No launch test attempted.';
    } catch (ignored) {
        historyEl.textContent = 'No previous launch result available.';
    }

    function selectedApp() {
        return selected >= 0 && selected < apps.length ? apps[selected] : null;
    }

    function renderPage() {
        listEl.textContent = '';
        var start = page * PAGE_SIZE;
        var end = Math.min(start + PAGE_SIZE, apps.length);
        for (var index = start; index < end; index++) {
            (function (appIndex) {
                var app = apps[appIndex];
                var button = document.createElement('button');
                button.type = 'button';
                button.style.display = 'block';
                button.style.width = '100%';
                button.style.textAlign = 'left';
                button.textContent = (appIndex === selected ? '[Selected] ' : '') +
                    app.title + ' — ' + app.id;
                button.onclick = function () {
                    selected = appIndex;
                    // Keep the pressed button in the DOM so TV remote focus is not lost.
                    for (var row = 0; row < listEl.children.length; row++) {
                        var rowIndex = page * PAGE_SIZE + row;
                        var rowApp = apps[rowIndex];
                        listEl.children[row].textContent =
                            (rowIndex === selected ? '[Selected] ' : '') +
                            rowApp.title + ' — ' + rowApp.id;
                    }
                    renderSelection();
                };
                listEl.appendChild(button);
            })(index);
        }
        previousBtn.disabled = !ready || page <= 0;
        nextBtn.disabled = !ready || end >= apps.length;
        statusEl.textContent = apps.length ?
            'Installed apps: ' + apps.length + ' | Page ' + (page + 1) + ' of ' + Math.ceil(apps.length / PAGE_SIZE) :
            'No installed apps were returned.';
    }

    function renderSelection() {
        var app = selectedApp();
        inspectBtn.disabled = !ready || !app;
        launchBtn.disabled = !ready || !app;
        homeEnableBtn.disabled = true;
        homeRestoreBtn.disabled = true;
        homeLookupSerial++;
        if (!app) {
            homeStatusEl.textContent = 'Select an app to check its original Home icon.';
            selectedEl.textContent = 'Select an installed app above.';
            return;
        }
        var flag = app.checkUpdateOnLaunch === null ? 'not reported by webOS' :
            (app.checkUpdateOnLaunch ? 'true' : 'false');
        selectedEl.textContent = 'Selected: ' + app.title + ' (' + app.id + ')' +
            ' | Installed version: ' + (app.version || 'not reported') +
            ' | Manifest checkUpdateOnLaunch: ' + flag;
        reportEl.textContent = 'Press Inspect Update Gate to compare this app against the two known update caches.';
        loadHomeLaunchState(app.id, homeLookupSerial);
    }


    function loadHomeLaunchState(id, serial) {
        homeStatusEl.textContent = 'Checking whether the original Home icon can be changed...';
        webOS.service.request(ROOT_SERVICE, {
            method: 'readHomeLaunchOverride',
            parameters: { id: id },
            onSuccess: function (state) {
                if (serial !== homeLookupSerial || !selectedApp() || selectedApp().id !== id) return;
                if (state.returnValue !== true) {
                    homeStatusEl.textContent = 'Unable to inspect Home icon policy: ' + errorText(state);
                    return;
                }
                if (!state.supported) {
                    homeStatusEl.textContent = state.reason ||
                        'This app is not in the writable LG Content Store directory; its original Home icon cannot be changed using this method.';
                    return;
                }
                if (state.managed) {
                    homeStatusEl.textContent = state.disabledOnDisk ?
                        'Home icon bypass enabled on disk. Restart the TV fully once to ensure the normal icon picks it up.' :
                        'Override saved, but the app manifest was replaced since. Press Fix Original Home Icon again.';
                } else {
                    homeStatusEl.textContent = state.disabledOnDisk ?
                        'The installed app manifest already has checkUpdateOnLaunch:false.' :
                        'Ready: this will disable the installed app manifest update check. The same original Home icon remains in place.';
                }
                homeEnableBtn.disabled = !ready || (state.managed && state.disabledOnDisk);
                homeRestoreBtn.disabled = !ready || !state.managed;
            },
            onFailure: function (error) {
                if (serial !== homeLookupSerial) return;
                homeStatusEl.textContent = 'Unable to check Home icon policy: ' + errorText(error);
            }
        });
    }

    function updateHomePolicy(method) {
        var app = selectedApp();
        if (!ready || !app || (method !== 'enableHomeLaunchOverride' && method !== 'restoreHomeLaunchOverride')) return;
        var enable = method === 'enableHomeLaunchOverride';
        var promptText = enable ?
            'Make the original Home screen icon for ' + app.title +
            ' stop checking for app updates on launch?\n\n' +
            'This changes one field in its installed app manifest, saves the previous value for undo, and needs ONE full TV reboot. It does not update or reinstall the app.' :
            'Restore the original Home screen launch setting for ' + app.title +
            '?\n\nThis restores only the saved launch-policy field and needs a full TV reboot.';
        if (!confirm(promptText)) return;
        var id = app.id;
        var serial = ++homeLookupSerial;
        homeEnableBtn.disabled = true;
        homeRestoreBtn.disabled = true;
        homeStatusEl.textContent = enable ? 'Enabling Home icon bypass...' : 'Restoring original Home icon setting...';
        webOS.service.request(ROOT_SERVICE, {
            method: method,
            parameters: { id: id },
            onSuccess: function (response) {
                if (serial !== homeLookupSerial) return;
                if (response.returnValue !== true) {
                    homeStatusEl.textContent = 'Could not change the original Home icon: ' + errorText(response);
                    loadHomeLaunchState(id, serial);
                    return;
                }
                homeStatusEl.textContent = response.message || 'Saved. Fully restart the TV once to apply.';
                // Refresh the button state without changing or launching the selected app.
                webOS.service.request(ROOT_SERVICE, {
                    method: 'readHomeLaunchOverride',
                    parameters: { id: id },
                    onSuccess: function (state) {
                        if (serial !== homeLookupSerial || !selectedApp() || selectedApp().id !== id) return;
                        homeEnableBtn.disabled = state.returnValue !== true || !state.supported ||
                            (state.managed && state.disabledOnDisk);
                        homeRestoreBtn.disabled = state.returnValue !== true || !state.managed;
                    },
                    onFailure: function () {}
                });
            },
            onFailure: function (error) {
                if (serial !== homeLookupSerial) return;
                homeStatusEl.textContent = 'Could not change the original Home icon: ' + errorText(error);
                loadHomeLaunchState(id, serial);
            }
        });
    }

    function normalizeApps(items) {
        var result = [];
        var seen = {};
        items.forEach(function (item) {
            if (!item || typeof item.id !== 'string' ||
                !/^[A-Za-z0-9._-]{1,160}$/.test(item.id) || seen[item.id]) return;
            seen[item.id] = true;
            result.push({
                id: item.id,
                title: typeof item.title === 'string' && item.title.trim() ? item.title : item.id,
                version: typeof item.version === 'string' ? item.version : '',
                systemApp: item.systemApp === true,
                checkUpdateOnLaunch: typeof item.checkUpdateOnLaunch === 'boolean' ?
                    item.checkUpdateOnLaunch : null
            });
        });
        result.sort(function (a, b) {
            if (a.systemApp !== b.systemApp) return a.systemApp ? 1 : -1;
            return a.title.toLowerCase().localeCompare(b.title.toLowerCase());
        });
        return result;
    }

    function loadApps() {
        if (!ready) return;
        refreshBtn.disabled = true;
        inspectBtn.disabled = true;
        launchBtn.disabled = true;
        statusEl.textContent = 'Reading the installed-app inventory from webOS...';
        // Fixed command only; never interpolate an app ID or user input into a shell command.
        webOS.service.request(HOMEBREW_SERVICE, {
            method: 'exec',
            parameters: { command: INVENTORY_COMMAND },
            onSuccess: function (result) {
                refreshBtn.disabled = false;
                if (result.returnValue === false ||
                    (result.returnCode != null && Number(result.returnCode) !== 0) ||
                    (result.exitCode != null && Number(result.exitCode) !== 0)) {
                    statusEl.textContent = 'Inventory unavailable: ' + errorText(result);
                    return;
                }
                try {
                    if (typeof result.stdoutString !== 'string' ||
                        result.stdoutString.length > 2 * 1024 * 1024) throw new Error('No valid inventory output');
                    var payload = JSON.parse(result.stdoutString);
                    if (!payload || payload.returnValue !== true || !Array.isArray(payload.apps))
                        throw new Error(errorText(payload));
                    apps = normalizeApps(payload.apps);
                    selected = -1;
                    page = 0;
                    renderPage();
                    renderSelection();
                } catch (error) {
                    statusEl.textContent = 'Could not read installed apps: ' + error.message;
                }
            },
            onFailure: function (error) {
                refreshBtn.disabled = false;
                statusEl.textContent = 'Inventory request failed: ' + errorText(error);
            }
        });
    }

    function hasExactId(value, id, depth) {
        if (depth > 20) return false;
        if (typeof value === 'string') return value === id;
        if (!value || typeof value !== 'object') return false;
        var keys = Object.keys(value);
        for (var i = 0; i < keys.length; i++) {
            if (keys[i] === id || hasExactId(value[keys[i]], id, depth + 1)) return true;
        }
        return false;
    }

    function readKnownCache(method, id, done) {
        webOS.service.request(ROOT_SERVICE, {
            method: method,
            parameters: {},
            onSuccess: function (response) {
                if (response.returnValue !== true) {
                    done('Could not inspect (' + errorText(response) + ')');
                    return;
                }
                if (!response.content || !response.content.trim()) {
                    done('No matching ID (file empty or absent)');
                    return;
                }
                try {
                    var parsed = JSON.parse(response.content);
                    done(hasExactId(parsed, id, 0) ? 'App ID found' : 'App ID not found');
                } catch (error) {
                    done('Unknown cache format; cannot determine');
                }
            },
            onFailure: function (error) { done('Could not inspect (' + errorText(error) + ')'); }
        });
    }

    function inspectApp() {
        var app = selectedApp();
        if (!ready || !app) return;
        var id = app.id;
        inspectBtn.disabled = true;
        reportEl.textContent = 'Checking the installed app and both known cache files...';
        readKnownCache('readUpdateInfo', id, function (updateInfo) {
            readKnownCache('readUpdateDependencyInfo', id, function (dependency) {
                webOS.service.request(APP_MANAGER, {
                    method: 'getAppLoadStatus',
                    parameters: { appId: id },
                    onSuccess: function (status) { finish(status, updateInfo, dependency); },
                    onFailure: function (error) { finish({ returnValue: false, errorText: errorText(error) }, updateInfo, dependency); }
                });
            });
        });
        function finish(status, updateInfo, dependency) {
            inspectBtn.disabled = false;
            var installed = status.returnValue === true ?
                (status.exist === true ? 'Yes' : (status.exist === false ? 'No' : 'Not reported')) :
                'Could not query (' + errorText(status) + ')';
            reportEl.textContent =
                'App ID: ' + id + '\n' +
                'Installed (live application manager): ' + installed + '\n' +
                'updateInfo: ' + updateInfo + '\n' +
                'updateDependencyInfo: ' + dependency + '\n' +
                'checkUpdateOnLaunch manifest value: ' +
                    (app.checkUpdateOnLaunch === null ? 'not reported' : String(app.checkUpdateOnLaunch)) + '\n' +
                'Note: No match in these files does not rule out an app-specific or in-memory update gate.';
        }
    }

    function launchWithoutCheck() {
        var app = selectedApp();
        if (!ready || !app) return;
        var id = app.id;
        var when = new Date().toLocaleString();
        savedResult(when + ': Requested launch of ' + app.title + ' (' + id +
            ') with checkUpdateOnLaunch=false. Response pending.');
        launchBtn.disabled = true;
        // Opt-in action only. This never calls an install/update endpoint.
        webOS.service.request(APP_MANAGER, {
            method: 'launch',
            parameters: { id: id, checkUpdateOnLaunch: false },
            onSuccess: function (result) {
                launchBtn.disabled = false;
                if (result.returnValue === false) {
                    savedResult(when + ': Launch rejected: ' + errorText(result));
                } else {
                    savedResult(when + ': Launch request accepted for ' + id +
                        ' with checkUpdateOnLaunch=false. This does NOT prove the app opened.');
                }
            },
            onFailure: function (error) {
                launchBtn.disabled = false;
                savedResult(when + ': Launch request failed: ' + errorText(error));
            }
        });
    }

    refreshBtn.onclick = loadApps;
    previousBtn.onclick = function () {
        if (page > 0) { page--; renderPage(); }
    };
    nextBtn.onclick = function () {
        if ((page + 1) * PAGE_SIZE < apps.length) { page++; renderPage(); }
    };
    inspectBtn.onclick = inspectApp;
    launchBtn.onclick = launchWithoutCheck;
    homeEnableBtn.onclick = function () { updateHomePolicy('enableHomeLaunchOverride'); };
    homeRestoreBtn.onclick = function () { updateHomePolicy('restoreHomeLaunchOverride'); };

    function enable() {
        if (ready) return;
        ready = true;
        refreshBtn.disabled = false;
        loadApps();
    }
    if (!serviceReadyBtn.disabled) {
        enable();
    } else {
        var observer = new MutationObserver(function () {
            if (!serviceReadyBtn.disabled) {
                observer.disconnect();
                enable();
            }
        });
        observer.observe(serviceReadyBtn, { attributes: true, attributeFilter: ['disabled'] });
    }
})();