import assert from 'node:assert/strict';
import fs from 'node:fs';

const [servicePath, htmlPath, uiPath] = process.argv.slice(2);
if (!servicePath || !htmlPath || !uiPath) {
  throw new Error('usage: test-firmware-cache-patch.mjs <patched-service.js> <patched-index.html> <firmware-cache-ui.js>');
}

const service = fs.readFileSync(servicePath, 'utf8');
const html = fs.readFileSync(htmlPath, 'utf8');
const ui = fs.readFileSync(uiPath, 'utf8');

const cacheStart = service.indexOf("const SYSTEM_UPDATE_CACHE_DIR");
const cacheEnd = service.indexOf("const SSH_KEYS_PATH");
assert.ok(cacheStart >= 0 && cacheEnd > cacheStart);
const cacheService = service.slice(cacheStart, cacheEnd);

assert.match(cacheService, /const SYSTEM_UPDATE_CACHE_DIR = '\/mnt\/lg\/cmn_data\/swupdate';/);
assert.match(cacheService, /service\.register\('readSystemUpdateCache'/);
assert.match(cacheService, /service\.register\('clearSystemUpdateCache'/);
assert.match(cacheService, /fs\.readdirSync\(SYSTEM_UPDATE_CACHE_DIR\)/);
assert.match(cacheService, /fs\.lstatSync\(fullPath\)/);
assert.match(cacheService, /stat\.isFile\(\) \|\| stat\.isSymbolicLink\(\)/);
assert.match(cacheService, /fs\.unlinkSync\(fullPath\)/);
assert.doesNotMatch(cacheService, /fs\.rmSync|fs\.rmdirSync|recursive\s*:\s*true/);

const readStart = cacheService.indexOf("service.register('readSystemUpdateCache'");
const clearStart = cacheService.indexOf("service.register('clearSystemUpdateCache'");
assert.ok(readStart >= 0 && clearStart > readStart);
assert.equal(
  cacheService.slice(readStart, clearStart).includes('unlinkSync'),
  false,
  'status checks must never delete firmware cache files'
);

assert.match(html, /id="firmwareCacheStatus"/);
assert.match(html, /id="refreshFirmwareCache"/);
assert.match(html, /id="clearFirmwareCache"/);
assert.match(html, /id="firmwareCacheContent"/);
assert.match(html, /<script src="firmware-cache-ui\.js"><\/script>/);

assert.match(ui, /method: "readSystemUpdateCache"/);
assert.match(ui, /method: "clearSystemUpdateCache"/);
assert.match(ui, /confirm\(prompt\)/);
assert.match(ui, /deletableCount/);
assert.ok(
  ui.indexOf('clearBtn.onclick') < ui.indexOf('method: "clearSystemUpdateCache"'),
  'cache deletion must only be requested from the explicit delete-button handler'
);

console.log('lg-app-update-blocker firmware cache patch regression checks passed');
