import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const [htmlPath, uiPath, appinfoPath] = process.argv.slice(2);
if (!htmlPath || !uiPath || !appinfoPath) {
    throw new Error('usage: test-app-launch-patch.mjs <patched-index.html> <app-launch-ui.js> <patched-appinfo.json>');
}
const html = fs.readFileSync(htmlPath, 'utf8');
const source = fs.readFileSync(uiPath, 'utf8');
const appinfo = JSON.parse(fs.readFileSync(appinfoPath, 'utf8'));

for (const id of ['refreshLaunchApps', 'previousLaunchPage', 'nextLaunchPage',
    'launchAppList', 'launchInventoryStatus', 'selectedLaunchApp', 'inspectLaunchApp',
    'launchWithoutUpdateCheck', 'launchDiagnosticResult', 'launchDiagnosticHistory',
    'enableHomeLaunchOverride', 'restoreHomeLaunchOverride', 'homeLaunchPolicyStatus']) {
    assert.ok(html.includes('id="' + id + '"'), 'missing launch diagnostic UI element: ' + id);
}
assert.ok(html.includes('<script src="app-launch-ui.js"></script>'));
assert.deepEqual(
    appinfo.requiredACG.filter(acg => ['application.launcher', 'application.query'].includes(acg)).sort(),
    ['application.launcher', 'application.query'],
    'public application manager calls need explicit ACGs'
);
assert.match(source, /checkUpdateOnLaunch:\s*false/, 'test must explicitly disable the launch-time update check');
assert.match(source, /method:\s*'getAppLoadStatus'/);
assert.match(source, /readKnownCache\('readUpdateInfo'/);
assert.match(source, /readKnownCache\('readUpdateDependencyInfo'/);
assert.match(source, /method:\s*'launch'/);
assert.doesNotMatch(source, /installApplication|installById|downloadApp|clearUpdateInfo|clearUpdateDependencyInfo|writeFileSync/);
assert.ok(source.indexOf('launchBtn.onclick = launchWithoutCheck') > source.indexOf('function launchWithoutCheck()'),
    'only a deliberate click should start a launch test');

function element(id) {
    let text = '';
    const el = { id, disabled: true, type: '', style: {}, children: [], onclick: null,
        appendChild(child) { this.children.push(child); }
    };
    Object.defineProperty(el, 'textContent', {
        get() { return text; },
        set(value) { text = String(value); this.children = []; }
    });
    return el;
}

const ids = ['refreshLaunchApps', 'previousLaunchPage', 'nextLaunchPage',
    'launchAppList', 'launchInventoryStatus', 'selectedLaunchApp', 'inspectLaunchApp',
    'launchWithoutUpdateCheck', 'launchDiagnosticResult', 'launchDiagnosticHistory',
    'enableHomeLaunchOverride', 'restoreHomeLaunchOverride', 'homeLaunchPolicyStatus', 'refreshUpdateInfo'];
const elements = Object.fromEntries(ids.map(id => [id, element(id)]));
elements.refreshUpdateInfo.disabled = false;
const requests = [];
const storage = new Map();
const tv = {
    service: {
        request(service, request) {
            requests.push({ service, method: request.method, parameters: request.parameters });
            let response;
            if (request.method === 'exec') {
                assert.equal(service, 'luna://org.webosbrew.hbchannel.service');
                assert.ok(request.parameters.command.includes('/listApps'));
                assert.ok(!request.parameters.command.includes('com.example.video'),
                    'inventory shell command must never incorporate an app ID');
                response = { returnValue: true, stdoutString: JSON.stringify({ returnValue: true, apps: [
                    { id: 'com.example.video', title: 'Video', version: '1.3', systemApp: false, checkUpdateOnLaunch: true },
                    { id: 'com.example.other', title: 'Another', systemApp: false },
                    { id: 'com.example.injected;touch /tmp/pwn', title: '<img src=x>' }
                ] }) };
            } else if (request.method === 'readHomeLaunchOverride') {
                response = { returnValue: true, supported: true, managed: !!storage.get('homeOverride'),
                    disabledOnDisk: !!storage.get('homeOverride') };
            } else if (request.method === 'enableHomeLaunchOverride') {
                storage.set('homeOverride', true);
                response = { returnValue: true, message: 'Override saved, reboot TV' };
            } else if (request.method === 'restoreHomeLaunchOverride') {
                storage.delete('homeOverride');
                response = { returnValue: true, message: 'Original policy restored' };
            } else if (request.method === 'readUpdateInfo') {
                response = { returnValue: true, content: '[{"id":"com.example.other"}]' };
            } else if (request.method === 'readUpdateDependencyInfo') {
                response = { returnValue: true, content: '{"com.example.video":{"reason":"pending"}}' };
            } else if (request.method === 'getAppLoadStatus') {
                response = { returnValue: true, exist: true };
            } else if (request.method === 'launch') {
                response = { returnValue: true };
            } else {
                throw new Error('unexpected service request: ' + service + ' ' + request.method);
            }
            request.onSuccess(response);
        }
    }
};
vm.runInNewContext(source, {
    webOS: tv,
    document: { getElementById(id) { return elements[id] || null; }, createElement(tag) { return element(tag); } },
    localStorage: { setItem(k, v) { storage.set(k, v); }, getItem(k) { return storage.get(k) || null; } },
    MutationObserver: class { observe() {} disconnect() {} },
    confirm: () => true,
    Date, JSON, Object, Number, String, Math, Array
});

assert.equal(requests.length, 1, 'opening the diagnostics must only read inventory');
assert.equal(requests[0].method, 'exec');
assert.equal(elements.launchAppList.children.length, 2, 'reject invalid app IDs rather than passing to launch');
assert.equal(elements.launchWithoutUpdateCheck.disabled, true, 'no launch unless an app is selected');

const choice = elements.launchAppList.children.find(item => item.textContent.includes('com.example.video'));
assert.ok(choice);
choice.onclick();
assert.ok(elements.launchAppList.children.includes(choice), 'remote focus must survive app selection');
assert.equal(elements.launchWithoutUpdateCheck.disabled, false);
assert.equal(elements.enableHomeLaunchOverride.disabled, false, 'app can be configured for original Home icon');
assert.equal(elements.restoreHomeLaunchOverride.disabled, true);
assert.match(elements.selectedLaunchApp.textContent, /checkUpdateOnLaunch: true/);
assert.equal(requests.filter(r => r.method === 'launch').length, 0);

elements.enableHomeLaunchOverride.onclick();
assert.equal(requests.filter(r => r.method === 'enableHomeLaunchOverride').length, 1);
assert.equal(requests.filter(r => r.method === 'launch').length, 0,
    'configuring native Home icon must not start an app');
assert.equal(elements.restoreHomeLaunchOverride.disabled, false);
assert.match(elements.homeLaunchPolicyStatus.textContent, /reboot TV/);
elements.restoreHomeLaunchOverride.onclick();
assert.equal(requests.filter(r => r.method === 'restoreHomeLaunchOverride').length, 1);
assert.equal(elements.enableHomeLaunchOverride.disabled, false);
assert.equal(elements.restoreHomeLaunchOverride.disabled, true);

elements.inspectLaunchApp.onclick();
assert.match(elements.launchDiagnosticResult.textContent, /Installed.*Yes/);
assert.match(elements.launchDiagnosticResult.textContent, /updateInfo: App ID not found/);
assert.match(elements.launchDiagnosticResult.textContent, /updateDependencyInfo: App ID found/);
assert.equal(requests.filter(r => r.method === 'launch').length, 0,
    'inspecting cached info must never launch an app');

elements.launchWithoutUpdateCheck.onclick();
const launches = requests.filter(r => r.method === 'launch');
assert.equal(launches.length, 1);
assert.equal(launches[0].service, 'luna://com.webos.applicationManager');
assert.equal(launches[0].parameters.id, 'com.example.video');
assert.equal(launches[0].parameters.checkUpdateOnLaunch, false);
assert.match(elements.launchDiagnosticHistory.textContent, /does NOT prove the app opened/);
assert.ok(storage.size > 0, 'persist result across leaving/re-entering the diagnostic app');

console.log('lg-app-update-blocker launch-gate diagnostic tests passed');