import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const modulePath = resolve(process.argv[2] || new URL('../patches/shorts-filter.js', import.meta.url).pathname);
const source = await readFile(modulePath, 'utf8');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const { isShortsEntry, removeShortsEverywhere, getShortsDiagnosticsSnapshot } = await import(moduleUrl);

const normalTile = (id) => ({
  tileRenderer: {
    videoId: id,
    style: 'TILE_STYLE_YTLR_DEFAULT',
    onSelectCommand: { watchEndpoint: { videoId: id } }
  }
});
const shortEndpoint = (id) => ({
  tileRenderer: { videoId: id, onSelectCommand: { reelWatchEndpoint: { videoId: id } } }
});
const shortStyle = (id) => ({ tileRenderer: { videoId: id, style: 'TILE_STYLE_YTLR_SHORTS' } });
const shortContentType = (id) => ({
  tileRenderer: { videoId: id, contentType: 'TILE_CONTENT_TYPE_SHORTS' }
});
const shortShelf = () => ({
  shelfRenderer: {
    tvhtml5ShelfRendererType: 'TVHTML5_SHELF_RENDERER_TYPE_SHORTS',
    content: { horizontalListRenderer: { items: [shortStyle('inside-short-shelf')] } }
  }
});

assert.equal(isShortsEntry(shortEndpoint('endpoint')), true);
assert.equal(isShortsEntry(shortStyle('style')), true);
assert.equal(isShortsEntry(shortContentType('content-type')), true);
assert.equal(isShortsEntry({ reelItemRenderer: { videoId: 'reel-renderer' } }), true);
assert.equal(isShortsEntry({ contentType: 'TILE_CONTENT_TYPE_SHORTS' }), true);
assert.equal(isShortsEntry({ onSelectCommand: { reelWatchEndpoint: { videoId: 'direct-endpoint' } } }), true);
assert.equal(isShortsEntry(shortShelf()), true);
assert.equal(isShortsEntry(normalTile('normal')), false);

const response = {
  home: {
    contents: {
      tvBrowseRenderer: {
        content: {
          tvSurfaceContentRenderer: {
            content: {
              sectionListRenderer: {
                contents: [
                  shortShelf(),
                  {
                    shelfRenderer: {
                      tvhtml5ShelfRendererType: 'TVHTML5_SHELF_RENDERER_TYPE_STANDARD',
                      content: {
                        horizontalListRenderer: {
                          items: [normalTile('home-normal'), shortStyle('home-short')]
                        }
                      }
                    }
                  }
                ]
              }
            }
          }
        }
      }
    }
  },
  search: {
    contents: {
      sectionListRenderer: {
        contents: [normalTile('search-normal'), shortContentType('search-short')]
      }
    }
  },
  subscriptionsA: {
    gridRenderer: { items: [normalTile('sub-normal-a'), shortEndpoint('sub-short-a')] }
  },
  subscriptionsB: {
    gridRenderer: { items: [shortEndpoint('sub-short-b'), normalTile('sub-normal-b')] }
  },
  continuationContents: {
    sectionListContinuation: {
      contents: [normalTile('cont-section-normal'), { reelItemRenderer: { videoId: 'cont-section-short' } }]
    },
    gridContinuation: { items: [shortStyle('cont-grid-short'), normalTile('cont-grid-normal')] },
    horizontalListContinuation: {
      items: [normalTile('cont-horizontal-normal'), { contentType: 'TILE_CONTENT_TYPE_SHORTS' }]
    },
    tvSurfaceContentContinuation: {
      content: {
        sectionListRenderer: { contents: [normalTile('cont-tv-normal'), shortShelf()] }
      }
    }
  },
  entries: [normalTile('sequence-normal'), { reelItemRenderer: { videoId: 'sequence-short' } }],
  onResponseReceivedActions: [
    {
      appendContinuationItemsAction: {
        continuationItems: [normalTile('append-normal'), shortEndpoint('append-short')]
      }
    },
    {
      reloadContinuationItemsCommand: {
        continuationItems: [shortContentType('reload-short'), normalTile('reload-normal')]
      }
    }
  ],
  unrelated: [
    { metadata: { reelWatchEndpoint: { videoId: 'reference-only' } }, keep: true },
    'primitive'
  ]
};

const removed = removeShortsEverywhere(response);
assert.equal(removed, 12);

function collectVideoIds(value, out = []) {
  if (!value || typeof value !== 'object') return out;
  if (value.tileRenderer?.videoId) out.push(value.tileRenderer.videoId);
  if (Array.isArray(value)) {
    for (const item of value) collectVideoIds(item, out);
  } else {
    for (const child of Object.values(value)) collectVideoIds(child, out);
  }
  return out;
}

assert.deepEqual(
  collectVideoIds(response).sort(),
  [
    'append-normal',
    'cont-grid-normal',
    'cont-horizontal-normal',
    'cont-section-normal',
    'cont-tv-normal',
    'home-normal',
    'reload-normal',
    'search-normal',
    'sequence-normal',
    'sub-normal-a',
    'sub-normal-b'
  ].sort()
);
assert.equal(response.unrelated[0].keep, true);
assert.equal(response.unrelated[0].metadata.reelWatchEndpoint.videoId, 'reference-only');
assert.equal(response.unrelated[1], 'primitive');

let diagnostics = getShortsDiagnosticsSnapshot();
assert.equal(diagnostics.responsesScanned, 1);
assert.equal(diagnostics.removedKnown, 12);
assert.ok(diagnostics.suspiciousSurvivors >= 1);
assert.ok(
  diagnostics.recentSurvivors.some((entry) =>
    entry.clues.some((clue) => clue === 'key:reelWatchEndpoint')
  ),
  'nested reel metadata that intentionally survives should be visible to diagnostics'
);

const futureSchema = {
  items: [
    {
      lockupViewModel: {
        contentType: 'YOUTUBE_SHORTS_LOCKUP_2026',
        command: { shortsNavigationEndpoint: {} },
        trackingParams: 'secret-shorts-tracking-must-not-be-retained'
      }
    },
    normalTile('future-normal')
  ]
};
assert.equal(removeShortsEverywhere(futureSchema), 0);
diagnostics = getShortsDiagnosticsSnapshot();
assert.equal(diagnostics.responsesScanned, 2);
assert.ok(
  diagnostics.recentSurvivors.some((entry) =>
    entry.clues.includes('contentType=YOUTUBE_SHORTS_LOCKUP_2026') &&
    entry.clues.includes('key:shortsNavigationEndpoint')
  ),
  'unknown Shorts-like schemas must be surfaced without being deleted blindly'
);
assert.equal(
  JSON.stringify(diagnostics).includes('secret-shorts-tracking-must-not-be-retained'),
  false,
  'diagnostics must not retain arbitrary tracking values'
);
assert.ok(
  diagnostics.signalInventory.some((entry) => entry.clue === 'key:shortsNavigationEndpoint')
);

assert.equal(removeShortsEverywhere(null), 0);
assert.equal(removeShortsEverywhere('not-json-object'), 0);
const normalOnly = { items: [normalTile('normal-only')] };
assert.equal(removeShortsEverywhere(normalOnly), 0);
assert.equal(normalOnly.items.length, 1);

console.log('shorts-filter: removal and survivor diagnostics regressions passed');
