import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const [servicePath, htmlPath, uiPath] = process.argv.slice(2);
if (!servicePath || !htmlPath || !uiPath) {
    throw new Error('usage: test-app-dependency-patch.mjs <patched-service.js> <patched-index.html> <app-dependency-ui.js>');
}

const source = fs.readFileSync(servicePath, 'utf8');
const html = fs.readFileSync(htmlPath, 'utf8');
const ui = fs.readFileSync(uiPath, 'utf8');
const start = source.indexOf('const UPDATE_DEPENDENCY_INFO_PATH');
const end = source.indexOf('const SSH_KEYS_PATH', start);
assert.ok(start >= 0 && end > start, 'secondary cache service must be included');
const fragment = source.slice(start, end);
assert.ok(source.includes("service.register('readUpdateInfo'"), 'original readUpdateInfo must remain');
assert.ok(source.includes("service.register('clearUpdateInfo'"), 'original clearUpdateInfo must remain');
assert.ok(fragment.includes('fs.lstatSync'), 'reject symlinks and non-regular files');
for (const id of ['updateDependencyStatus', 'refreshUpdateDependencyInfo', 'clearUpdateDependencyInfo', 'updateDependencyContent']) {
    assert.ok(html.includes('id="' + id + '"'), 'missing dependency UI element: ' + id);
}
assert.ok(html.includes('<script src="app-dependency-ui.js"></script>'));
assert.ok(ui.includes("method: 'readUpdateDependencyInfo'"));
assert.ok(ui.includes("method: 'clearUpdateDependencyInfo'"));
assert.ok(ui.includes('confirm('), 'clearing must require confirmation');
assert.ok(ui.includes('contentEl.textContent'), 'cached content must not be used as HTML');
assert.ok(ui.indexOf('clearBtn.onclick') < ui.indexOf("method: 'clearUpdateDependencyInfo'"),
          'only the clear button must invoke the write endpoint');

const dependencyPath = '/mnt/lg/cmn_data/var/palm/data/com.webos.appInstallService/updateDependencyInfo';
function harness(content, options = {}) {
    const state = { content, exists: options.exists !== false, kind: options.kind || 'regular', writes: [], failWrite: !!options.failWrite };
    const handlers = {};
    const fakeFs = {
        existsSync(p) { assert.equal(p, dependencyPath); return state.exists; },
        lstatSync(p) {
            assert.equal(p, dependencyPath);
            return { isFile: () => state.kind === 'regular' };
        },
        readFileSync(p, encoding) {
            assert.equal(p, dependencyPath);
            assert.equal(encoding, 'utf8');
            return state.content;
        },
        writeFileSync(p, data, encoding) {
            assert.equal(p, dependencyPath, 'must never change the original updateInfo file');
            assert.equal(encoding, 'utf8');
            if (state.failWrite) throw new Error('simulated permission failure');
            state.writes.push(data);
            state.content = data;
        }
    };
    vm.runInNewContext(fragment, { fs: fakeFs, service: { register(name, fn) { handlers[name] = fn; } } });
    function call(name) {
        let result = null;
        assert.equal(typeof handlers[name], 'function');
        handlers[name]({ respond(value) { assert.equal(result, null); result = value; } });
        assert.ok(result, 'service must respond');
        return result;
    }
    return { state, call };
}

let tv = harness('[{"id":"test.app"}]');
assert.equal(tv.call('readUpdateDependencyInfo').content, '[{"id":"test.app"}]');
assert.equal(tv.state.writes.length, 0, 'refresh must not clear anything');
assert.equal(tv.call('clearUpdateDependencyInfo').returnValue, true);
assert.equal(tv.state.content, '[]');
assert.equal(tv.call('readUpdateDependencyInfo').content, '[]');
assert.equal(tv.call('clearUpdateDependencyInfo').returnValue, true);
assert.equal(tv.state.writes.length, 1, 'already empty state must not be rewritten');

tv = harness('{"test.app":{"blocked":true}}');
assert.equal(tv.call('clearUpdateDependencyInfo').returnValue, true);
assert.equal(tv.state.content, '{}', 'object-shaped caches must retain their JSON root type');

tv = harness('not-json');
assert.equal(tv.call('readUpdateDependencyInfo').content, 'not-json', 'inspection must still work for unexpected formats');
assert.equal(tv.call('clearUpdateDependencyInfo').returnValue, false);
assert.equal(tv.state.writes.length, 0);

tv = harness('"unexpected"');
assert.equal(tv.call('clearUpdateDependencyInfo').returnValue, false);
assert.equal(tv.state.writes.length, 0);

tv = harness('', { exists: false });
assert.equal(tv.call('readUpdateDependencyInfo').exists, false);
assert.equal(tv.call('clearUpdateDependencyInfo').returnValue, true);
assert.equal(tv.state.writes.length, 0);

tv = harness('[]', { kind: 'symlink' });
assert.equal(tv.call('readUpdateDependencyInfo').returnValue, false);
assert.equal(tv.call('clearUpdateDependencyInfo').returnValue, false);
assert.equal(tv.state.writes.length, 0);

tv = harness('[{"id":"test.app"}]', { failWrite: true });
assert.equal(tv.call('clearUpdateDependencyInfo').returnValue, false);
assert.equal(tv.state.content, '[{"id":"test.app"}]');

console.log('lg-app-update-blocker secondary app dependency cache regression checks passed');
