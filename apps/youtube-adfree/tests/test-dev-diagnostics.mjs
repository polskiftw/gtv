import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

if (process.argv.length < 4) {
  throw new Error(
    'usage: test-dev-diagnostics.mjs <feed-ad-filter.js> <dev-diagnostics.js>'
  );
}

const feedFilterPath = resolve(process.argv[2]);
const devUiPath = resolve(process.argv[3]);
const feedModule = await import(pathToFileURL(feedFilterPath).href);

const root = {
  contents: {
    tvBrowseRenderer: {
      content: {
        tvSurfaceContentRenderer: {
          content: {
            sectionListRenderer: {
              contents: [
                {
                  heroMasthead2026Renderer: {
                    trackingParams: 'payload-value-must-not-leak',
                    autoplay: {}
                  }
                },
                {
                  shelfRenderer: {
                    content: {}
                  }
                }
              ]
            }
          }
        }
      }
    }
  }
};

const serialized = JSON.stringify(root);
assert.equal(
  feedModule.removeSponsoredFeedAds(root, serialized),
  0,
  'an unknown masthead-like schema must not be removed merely because DEV diagnostics observed it'
);

let snapshot = feedModule.getFeedAdDiagnosticsSnapshot();
assert.equal(snapshot.homeResponses, 1);
assert.equal(snapshot.homeLeadingShapes[0].renderers[0], 'heroMasthead2026Renderer');
assert.equal(snapshot.suspiciousCandidates[0].key, 'heroMasthead2026Renderer');
assert.match(snapshot.suspiciousCandidates[0].path, /heroMasthead2026Renderer$/);
assert.equal(
  JSON.stringify(snapshot).includes('payload-value-must-not-leak'),
  false,
  'DEV diagnostics must never retain payload values'
);

const known = {
  contents: [{ videoMastheadAdV3Renderer: { trackingParams: 'x' } }]
};
assert.equal(
  feedModule.removeSponsoredFeedAds(known, JSON.stringify(known)),
  1,
  'known sponsored renderers must still be filtered in the DEV build'
);
snapshot = feedModule.getFeedAdDiagnosticsSnapshot();
assert.equal(snapshot.removedFeedRenderers, 1);
assert.equal(snapshot.knownMarkerResponses, 1);

const devUi = await readFile(devUiPath, 'utf8');
assert.match(devUi, /new Set\(\[406,\s*167,\s*191\]\)/);
assert.match(devUi, /getFeedAdDiagnosticsSnapshot/);
assert.match(devUi, /stopImmediatePropagation/);
assert.match(devUi, /LATEST HOME LEADING SHAPES/);
assert.match(devUi, /SUSPICIOUS \/ UNKNOWN KEYS/);
assert.match(devUi, /overflow-y:auto/);
assert.doesNotMatch(
  devUi,
  /console\.(log|debug|info)\(/,
  'the on-TV diagnostics UI should not be a console mirror'
);

console.log('dev-diagnostics: compact snapshot collection and blue-key UI contract passed');
