import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const modulePath = resolve(
  process.argv[2] || new URL('../patches/playback-overlay-filter.js', import.meta.url).pathname
);
const source = await readFile(modulePath, 'utf8');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const { removeSponsoredPlaybackOverlays } = await import(moduleUrl);

const direct = {
  playerOverlays: {
    playerOverlayRenderer: {
      timelyActionRenderers: [
        { timelyActionRenderer: { actionButton: { buttonRenderer: { text: 'Shop' } } } }
      ],
      endScreen: { keep: true }
    }
  },
  keep: true
};
assert.equal(removeSponsoredPlaybackOverlays(direct), 1);
assert.equal(
  Object.prototype.hasOwnProperty.call(
    direct.playerOverlays.playerOverlayRenderer,
    'timelyActionRenderers'
  ),
  false
);
assert.equal(direct.playerOverlays.playerOverlayRenderer.endScreen.keep, true);
assert.equal(direct.keep, true);

const wrapped = {
  playerResponse: {
    playerOverlays: {
      playerOverlayRenderer: {
        timelyActionRenderers: [{ timelyActionRenderer: { qrCode: 'payload' } }],
        sibling: 42
      }
    }
  }
};
assert.equal(removeSponsoredPlaybackOverlays(wrapped), 1);
assert.equal(
  Object.prototype.hasOwnProperty.call(
    wrapped.playerResponse.playerOverlays.playerOverlayRenderer,
    'timelyActionRenderers'
  ),
  false
);
assert.equal(wrapped.playerResponse.playerOverlays.playerOverlayRenderer.sibling, 42);

const both = {
  playerOverlays: { playerOverlayRenderer: { timelyActionRenderers: [] } },
  playerResponse: {
    playerOverlays: { playerOverlayRenderer: { timelyActionRenderers: [] } }
  }
};
assert.equal(removeSponsoredPlaybackOverlays(both), 2);

// Do not recursively delete similarly named data outside the known player
// response paths. This keeps the filter narrow and avoids collateral damage.
const unrelated = {
  nested: {
    playerOverlayRenderer: {
      timelyActionRenderers: ['not a known player-response path']
    }
  }
};
assert.equal(removeSponsoredPlaybackOverlays(unrelated), 0);
assert.deepEqual(unrelated.nested.playerOverlayRenderer.timelyActionRenderers, [
  'not a known player-response path'
]);

assert.equal(removeSponsoredPlaybackOverlays(null), 0);
assert.equal(removeSponsoredPlaybackOverlays('not-an-object'), 0);
assert.equal(removeSponsoredPlaybackOverlays({}), 0);

console.log('playback-overlay-filter: all schema and regression tests passed');
