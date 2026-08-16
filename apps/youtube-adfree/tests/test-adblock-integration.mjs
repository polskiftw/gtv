import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

if (process.argv.length < 4) {
  throw new Error(
    'usage: test-adblock-integration.mjs <patched-adblock.js> <patched-userScript.ts>'
  );
}

const adblockPath = resolve(process.argv[2]);
const userScriptPath = resolve(process.argv[3]);
const [adblock, userScript] = await Promise.all([
  readFile(adblockPath, 'utf8'),
  readFile(userScriptPath, 'utf8')
]);

assert.equal(
  (adblock.match(/removeSponsoredFeedAds/g) || []).length,
  2,
  'patched adblock should import and call removeSponsoredFeedAds exactly once'
);
assert.match(
  adblock,
  /removeSponsoredFeedAds\(r, arguments\[0\]\)/,
  'feed filtering should receive the original JSON text for marker gating'
);
assert.equal(
  adblock.includes('function removeAdSlotRenderer'),
  false,
  'legacy page-specific ad-slot helper should be replaced by the hardened filter'
);
assert.equal(
  adblock.includes('(elm) => !elm.tvMastheadRenderer'),
  false,
  'legacy single-path masthead filter should be replaced'
);
assert.match(
  adblock,
  /removeSponsoredPlaybackOverlays\(r\)/,
  'existing playback overlay filtering must remain installed'
);

const earlyAdblock = userScript.indexOf("import './adblock.js';");
const devDiagnostics = userScript.indexOf("import './dev-diagnostics.js';");
const appApi = userScript.indexOf("import './app_api/index';");
const upstreamUi = userScript.indexOf("import './ui.js';");
assert.notEqual(earlyAdblock, -1, 'userScript must import adblock');
assert.notEqual(devDiagnostics, -1, 'DEV userScript must import diagnostics');
assert.notEqual(appApi, -1, 'userScript must import app_api');
assert.notEqual(upstreamUi, -1, 'userScript must import upstream ui');
assert.ok(
  earlyAdblock < devDiagnostics,
  'DEV diagnostics must initialize after the adblock/feed diagnostics module'
);
assert.ok(
  devDiagnostics < appApi && devDiagnostics < upstreamUi,
  'DEV diagnostics must register its capture-phase blue-key handler before upstream UI'
);
assert.ok(
  earlyAdblock < appApi,
  'adblock must initialize before app_api so fresh-launch responses cannot beat the JSON.parse hook'
);
assert.equal(
  (userScript.match(/import '\.\/adblock\.js';/g) || []).length,
  1,
  'userScript must import adblock exactly once'
);
assert.equal(
  (userScript.match(/import '\.\/dev-diagnostics\.js';/g) || []).length,
  1,
  'userScript must import DEV diagnostics exactly once'
);

console.log('adblock-integration: DEV patch wiring and startup ordering passed');
