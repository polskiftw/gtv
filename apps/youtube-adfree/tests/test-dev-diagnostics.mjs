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

// Deliberately use a Home-ish schema that does NOT match the old hard-coded
// tvBrowseRenderer -> tvSurfaceContentRenderer -> sectionListRenderer path.
const unknownHomeShape = {
  responseContext: {
    serviceTrackingParams: []
  },
  contents: {
    newBrowseSurfaceRenderer: {
      browseId: 'FEwhat_to_watch',
      pageType: 'HOME',
      sections: [
        {
          heroMasthead2026Renderer: {
            style: 'FULL_BLEED',
            title: 'Example campaign',
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
};

const unknownSerialized = JSON.stringify(unknownHomeShape);
assert.equal(
  feedModule.removeSponsoredFeedAds(unknownHomeShape, unknownSerialized),
  0,
  'an unknown masthead-like schema must not be removed merely because DEV diagnostics observed it'
);

let snapshot = feedModule.getFeedAdDiagnosticsSnapshot();
assert.equal(
  snapshot.homeResponses,
  0,
  'the synthetic response must prove profiling no longer depends on the legacy Home path'
);
assert.equal(snapshot.profiledResponses, 1);
assert.equal(snapshot.recentResponses.length, 1);
assert.ok(snapshot.recentResponses[0].topKeys.includes('contents'));
assert.ok(
  snapshot.recentResponses[0].renderers.some(
    (entry) => entry.key === 'heroMasthead2026Renderer'
  ),
  'response profile should retain unknown renderer names and paths'
);
assert.ok(
  snapshot.recentResponses[0].signals.some(
    (entry) => entry.key === 'heroMasthead2026Renderer'
  ),
  'masthead-like renderer should also appear in per-response signal capture'
);
assert.ok(
  snapshot.recentResponses[0].hints.some(
    (entry) => entry.key === 'browseId' && entry.value === 'FEwhat_to_watch'
  ),
  'safe scalar hints should identify the response surface'
);
assert.ok(
  snapshot.rendererInventory.some((entry) => entry.key === 'heroMasthead2026Renderer'),
  'session renderer inventory should retain the unknown renderer'
);
assert.ok(
  snapshot.signalInventory.some((entry) => entry.key === 'heroMasthead2026Renderer'),
  'session signal inventory should retain masthead-like keys'
);
assert.ok(snapshot.responseShapeCounts.length >= 1);
assert.equal(
  JSON.stringify(snapshot).includes('payload-value-must-not-leak'),
  false,
  'DEV diagnostics must never retain tracking payload values'
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
assert.equal(snapshot.profiledResponses, 2);
assert.ok(snapshot.largestResponses.length >= 1);

const devUi = await readFile(devUiPath, 'utf8');
assert.match(devUi, /new Set\(\[406,\s*167,\s*191\]\)/);
assert.match(devUi, /getFeedAdDiagnosticsSnapshot/);
assert.match(devUi, /stopImmediatePropagation/);
assert.match(devUi, /RECENT STRUCTURED RESPONSES/);
assert.match(devUi, /LARGEST PROFILED RESPONSES/);
assert.match(devUi, /RESPONSE SHAPE COUNTS/);
assert.match(devUi, /RENDERER \/ VIEW-MODEL INVENTORY/);
assert.match(devUi, /AD \/ MASTHEAD \/ PROMO SIGNAL INVENTORY/);
assert.match(devUi, /LEGACY HOME LEADING SHAPES/);
assert.match(devUi, /overflow-y:auto/);
assert.doesNotMatch(
  devUi,
  /console\.(log|debug|info)\(/,
  'the on-TV diagnostics UI should not be a console mirror'
);

console.log('dev-diagnostics: expanded schema profiling and blue-key UI contract passed');
