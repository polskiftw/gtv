import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';

const [servicePath, htmlPath] = process.argv.slice(2);
if (!servicePath || !htmlPath) throw new Error('usage: test-home-launch-patch.mjs <patched-service.js> <patched-index.html>');
const serviceSource = fs.readFileSync(servicePath, 'utf8');
const html = fs.readFileSync(htmlPath, 'utf8');
const start = serviceSource.indexOf('const HOME_LAUNCH_STORE_ROOT');
const end = serviceSource.indexOf('const SSH_KEYS_PATH', start);
assert.ok(start >= 0 && end > start, 'home launch service must be included in patched webOS service');
for (const name of ['readHomeLaunchOverride', 'enableHomeLaunchOverride', 'restoreHomeLaunchOverride']) {
    assert.match(serviceSource.slice(start, end), new RegExp("service.register\\('" + name + "'"), 'missing service method');
}
for (const id of ['homeLaunchPolicyStatus', 'enableHomeLaunchOverride', 'restoreHomeLaunchOverride']) {
    assert.ok(html.includes('id="' + id + '"'), 'missing original Home icon UI control ' + id);
}
assert.doesNotMatch(serviceSource.slice(start, end), /child_process|luna-send|reboot|killall|execSync|spawnSync|mount --bind/,
    'manifest change must never restart system services or run external commands');

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'gtv-home-launch-'));
const appRoot = path.join(work, 'apps');
const backupRoot = path.join(work, 'backups');
fs.mkdirSync(appRoot, { recursive: true });
const originalId = 'com.example.video';
const installedDir = path.join(appRoot, originalId);
const manifestPath = path.join(installedDir, 'appinfo.json');
fs.mkdirSync(installedDir);
const initial = { id: originalId, version: '1.2.3', type: 'web', title: 'Video', main: 'index.html' };
fs.writeFileSync(manifestPath, JSON.stringify(initial) + '\n');

let fragment = serviceSource.slice(start, end);
fragment = fragment.replace(
    "const HOME_LAUNCH_STORE_ROOT = '/media/cryptofs/apps/usr/palm/applications';",
    'const HOME_LAUNCH_STORE_ROOT = ' + JSON.stringify(appRoot) + ';'
).replace(
    "const HOME_LAUNCH_RECORD_DIR = '/var/lib/webosbrew/appupdateblocker/home-launch';",
    'const HOME_LAUNCH_RECORD_DIR = ' + JSON.stringify(backupRoot) + ';'
);
const handlers = {};
vm.runInNewContext(fragment, {
    fs, path, process,
    ensureDirectoryExistence(file) { fs.mkdirSync(path.dirname(file), { recursive: true }); },
    service: { register(name, handler) { handlers[name] = handler; } }
});
function call(method, id) {
    let value;
    assert.equal(typeof handlers[method], 'function', 'missing handler ' + method);
    handlers[method]({
        payload: { id },
        respond(response) { assert.equal(value, undefined, 'service must respond once'); value = response; }
    });
    assert.notEqual(value, undefined);
    return value;
}
function readApp(id = originalId) {
    return JSON.parse(fs.readFileSync(path.join(appRoot, id, 'appinfo.json'), 'utf8'));
}
try {
    let state = call('readHomeLaunchOverride', originalId);
    assert.equal(state.returnValue, true);
    assert.equal(state.supported, true);
    assert.equal(state.managed, false);
    assert.equal(state.disabledOnDisk, false);
    assert.deepEqual(readApp(), initial, 'read must not change the application');

    let result = call('enableHomeLaunchOverride', originalId);
    assert.equal(result.returnValue, true);
    assert.equal(readApp().checkUpdateOnLaunch, false);
    assert.deepEqual(Object.keys(readApp()).sort(), Object.keys({ ...initial, checkUpdateOnLaunch: false }).sort(),
        'patch should only add one app manifest property');
    const recordFile = path.join(backupRoot, originalId + '.json');
    const record = JSON.parse(fs.readFileSync(recordFile, 'utf8'));
    assert.equal(record.originalPresent, false, 'missing flag must be remembered as missing');
    assert.equal(record.id, originalId);
    assert.equal(call('readHomeLaunchOverride', originalId).managed, true);

    // A second enable must not overwrite the stored original launch policy.
    assert.equal(call('enableHomeLaunchOverride', originalId).returnValue, true);
    assert.deepEqual(JSON.parse(fs.readFileSync(recordFile, 'utf8')), record);

    // Restore just the flag, preserving other app metadata changed since the first patch.
    const afterInstall = readApp();
    afterInstall.version = '1.2.4';
    afterInstall.newVendorMetadata = 'preserve';
    fs.writeFileSync(manifestPath, JSON.stringify(afterInstall) + '\n');
    result = call('restoreHomeLaunchOverride', originalId);
    assert.equal(result.returnValue, true);
    assert.equal(Object.hasOwn(readApp(), 'checkUpdateOnLaunch'), false);
    assert.equal(readApp().version, '1.2.4');
    assert.equal(readApp().newVendorMetadata, 'preserve');
    assert.equal(fs.existsSync(recordFile), false, 'restore must remove managed record');

    const oldInfo = { ...initial, checkUpdateOnLaunch: true };
    fs.writeFileSync(manifestPath, JSON.stringify(oldInfo) + '\n');
    assert.equal(call('enableHomeLaunchOverride', originalId).returnValue, true);
    assert.equal(JSON.parse(fs.readFileSync(recordFile, 'utf8')).originalValue, true);
    assert.equal(call('restoreHomeLaunchOverride', originalId).returnValue, true);
    assert.equal(readApp().checkUpdateOnLaunch, true, 'restore should preserve explicit original true');

    const secondId = 'com.example.second';
    fs.mkdirSync(path.join(appRoot, secondId));
    fs.writeFileSync(path.join(appRoot, secondId, 'appinfo.json'),
        JSON.stringify({ id: secondId, checkUpdateOnLaunch: false }));
    assert.equal(call('enableHomeLaunchOverride', secondId).returnValue, true);
    assert.equal(call('restoreHomeLaunchOverride', secondId).returnValue, true);
    assert.equal(readApp(secondId).checkUpdateOnLaunch, false,
        'an already-false explicit property must stay false after restore');

    for (const id of ['../something', '.', '..', 'com/foo', 'com.example;rm', 'com.webos.app.home']) {
        assert.equal(call('enableHomeLaunchOverride', id).returnValue, false, 'must reject unsafe or protected app ID ' + id);
    }
    assert.equal(call('enableHomeLaunchOverride', 'com.example.uninstalled').returnValue, false);
    const incorrect = 'com.example.mismatch';
    fs.mkdirSync(path.join(appRoot, incorrect));
    fs.writeFileSync(path.join(appRoot, incorrect, 'appinfo.json'), JSON.stringify({ id: originalId }));
    assert.equal(call('enableHomeLaunchOverride', incorrect).returnValue, false);
    assert.equal(fs.existsSync(path.join(backupRoot, incorrect + '.json')), false);

    const linkId = 'com.example.link';
    fs.symlinkSync(installedDir, path.join(appRoot, linkId));
    assert.equal(call('enableHomeLaunchOverride', linkId).returnValue, false, 'must reject aliases/symlink directories');

    const malformed = 'com.example.badjson';
    fs.mkdirSync(path.join(appRoot, malformed));
    fs.writeFileSync(path.join(appRoot, malformed, 'appinfo.json'), '{broken');
    assert.equal(call('enableHomeLaunchOverride', malformed).returnValue, false);
    assert.equal(fs.readFileSync(path.join(appRoot, malformed, 'appinfo.json'), 'utf8'), '{broken');

    // Never delete or reinstall the app, even when restoring policy.
    assert.equal(fs.existsSync(manifestPath), true);
    console.log('lg-app-update-blocker original Home icon launch-policy regression checks passed');
} finally {
    fs.rmSync(work, { recursive: true, force: true });
}
