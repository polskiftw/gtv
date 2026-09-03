import assert from 'node:assert/strict';
import fs from 'node:fs';

const sourcePath = process.argv[2];
if (!sourcePath) {
  throw new Error('usage: test-persistence-patch.mjs <patched-service.js>');
}

const source = fs.readFileSync(sourcePath, 'utf8');

assert.match(source, /# GTV APPUPDATEBLOCKER PERSISTENCE v2/);
assert.match(source, /PERSISTENT_DOMAINS_PATH/);
assert.match(source, /writeFileAtomically\(PERSISTENT_SCRIPT_PATH, autostartScript, '755'\)/);
assert.match(source, /writeFileAtomically\(PERSISTENT_DOMAINS_PATH, domainsContent, '644'\)/);
assert.match(source, /exists: state\.current/);
assert.match(source, /installed: state\.installed/);
assert.match(source, /current: state\.current/);
assert.match(source, /installPersistenceFiles\(\)/);
assert.match(source, /allBlocked:/);
assert.match(source, /hostLineContainsDomain/);

assert.doesNotMatch(
  source,
  /luna-send -n 1 .*addUpdateDomains/,
  'boot persistence must not depend on the app Luna service being ready'
);
assert.doesNotMatch(
  source,
  /\/var\/lib\/webosbrew\/init\.d\/appupdateblocker &/,
  'boot hook must not recursively launch itself'
);
assert.doesNotMatch(
  source,
  /rm -f \/var\/lib\/webosbrew\/init\.d\/appupdateblocker/,
  'transient boot failures must never self-delete the persistence hook'
);
assert.doesNotMatch(
  source,
  /Persistent script already exists/,
  'install must upgrade stale hooks instead of refusing to replace them'
);
assert.doesNotMatch(
  source,
  /line\.includes\('lgtvsdp\.com'\)/,
  'removal must use the packaged domain list rather than a hard-coded suffix'
);

console.log('lg-app-update-blocker persistence patch regression checks passed');
