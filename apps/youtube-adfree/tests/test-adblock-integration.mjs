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
assert.equal(
  (adblock.match(/handleAdPlaybackResponse/g) || []).length,
  2,
  'patched adblock should import and call the server-side ad skipper exactly once'
);
assert.match(
  adblock,
  /handleAdPlaybackResponse\(r\)/,
  'exact ad-playback state responses should trigger player-level skipping'
);
assert.match(
  adblock,
  /from '\.\/ssai-ad-skipper'/,
  'server-side ad skipper must be wired through the early adblock hook'
);
assert.doesNotMatch(
  adblock,
  /neutralizeStandaloneAdPlayback|ad-playback-state-filter/,
  'failed standalone ad-playback boolean mutation must remain retired'
);

const earlyAdblock = userScript.indexOf("import './adblock.js';");
const earlyShorts = userScript.indexOf("import './shorts.js';");
const devDiagnostics = userScript.indexOf("import './dev-diagnostics.js';");
const appApi = userScript.indexOf("import './app_api/index';");
const upstreamUi = userScript.indexOf("import './ui.js';");
assert.notEqual(earlyAdblock, -1, 'userScript must import adblock');
assert.notEqual(earlyShorts, -1, 'userScript must import Shorts filtering');
assert.notEqual(devDiagnostics, -1, 'DEV userScript must import diagnostics');
assert.notEqual(appApi, -1, 'userScript must import app_api');
assert.notEqual(upstreamUi, -1, 'userScript must import upstream ui');
assert.ok(
  earlyAdblock < earlyShorts && earlyShorts < devDiagnostics,
  'response filters must initialize before DEV diagnostics in deterministic order'
);
assert.ok(
  earlyAdblock < appApi && earlyShorts < appApi,
  'adblock and Shorts JSON.parse hooks must both initialize before app_api'
);
assert.ok(
  devDiagnostics < appApi && devDiagnostics < upstreamUi,
  'DEV diagnostics must register its capture-phase blue-key handler before upstream UI'
);
assert.equal(
  (userScript.match(/import '\.\/adblock\.js';/g) || []).length,
  1,
  'userScript must import adblock exactly once'
);
assert.equal(
  (userScript.match(/import '\.\/shorts\.js';/g) || []).length,
  1,
  'userScript must import Shorts filtering exactly once'
);
assert.equal(
  (userScript.match(/import '\.\/dev-diagnostics\.js';/g) || []).length,
  1,
  'userScript must import DEV diagnostics exactly once'
);

console.log('adblock-integration: early filtering, SSAI skipping, and retired boolean mutation passed');
