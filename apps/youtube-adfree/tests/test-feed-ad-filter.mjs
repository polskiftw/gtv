import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const modulePath = resolve(
  process.argv[2] || new URL('../patches/feed-ad-filter.js', import.meta.url).pathname
);
const source = await readFile(modulePath, 'utf8');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const { hasSponsoredFeedMarker, removeSponsoredFeedAds } = await import(moduleUrl);

assert.equal(hasSponsoredFeedMarker('{"tvMastheadRenderer":{}}'), true);
assert.equal(hasSponsoredFeedMarker('{"name":"tvMastheadRenderer"}'), true);
assert.equal(hasSponsoredFeedMarker('{"normalRenderer":{}}'), false);
assert.equal(hasSponsoredFeedMarker(null), false);

const home = {
  contents: {
    tvBrowseRenderer: {
      content: {
        tvSurfaceContentRenderer: {
          content: {
            sectionListRenderer: {
              contents: [
                { tvMastheadRenderer: { autoplay: true } },
                { shelfRenderer: { title: 'Keep me' } }
              ]
            }
          }
        }
      }
    }
  }
};
assert.equal(removeSponsoredFeedAds(home, JSON.stringify(home)), 1);
assert.deepEqual(
  home.contents.tvBrowseRenderer.content.tvSurfaceContentRenderer.content.sectionListRenderer.contents,
  [{ shelfRenderer: { title: 'Keep me' } }]
);

const startupWrapped = {
  startup: {
    bootstrap: {
      mastheadData: {
        videoMastheadAdV3Renderer: { mutedAutoplay: true }
      },
      keep: true
    }
  }
};
assert.equal(removeSponsoredFeedAds(startupWrapped, JSON.stringify(startupWrapped)), 1);
assert.equal(
  Object.prototype.hasOwnProperty.call(
    startupWrapped.startup.bootstrap.mastheadData,
    'videoMastheadAdV3Renderer'
  ),
  false
);
assert.equal(startupWrapped.startup.bootstrap.keep, true);

const wrappedItem = {
  contents: [
    {
      richItemRenderer: {
        content: { videoMastheadAdRenderer: { campaign: 'movie' } }
      }
    },
    { richItemRenderer: { content: { tileRenderer: { videoId: 'normal' } } } }
  ]
};
assert.equal(removeSponsoredFeedAds(wrappedItem, JSON.stringify(wrappedItem)), 1);
assert.equal(wrappedItem.contents.length, 1);
assert.equal(
  wrappedItem.contents[0].richItemRenderer.content.tileRenderer.videoId,
  'normal'
);

// Crossing a child collection must not make the whole shelf look like an ad.
const shelf = {
  contents: [
    {
      shelfRenderer: {
        title: 'Recommendations',
        content: {
          horizontalListRenderer: {
            items: [
              { adSlotRenderer: { slot: 1 } },
              { tileRenderer: { videoId: 'safe' } }
            ]
          }
        }
      }
    }
  ]
};
assert.equal(removeSponsoredFeedAds(shelf, JSON.stringify(shelf)), 1);
assert.equal(shelf.contents.length, 1);
assert.deepEqual(
  shelf.contents[0].shelfRenderer.content.horizontalListRenderer.items,
  [{ tileRenderer: { videoId: 'safe' } }]
);

const continuation = {
  continuationContents: {
    horizontalListContinuation: {
      items: [
        { promotedSparklesWebRenderer: { ad: true } },
        { tileRenderer: { videoId: 'continued' } }
      ]
    }
  }
};
assert.equal(removeSponsoredFeedAds(continuation, JSON.stringify(continuation)), 1);
assert.equal(
  continuation.continuationContents.horizontalListContinuation.items.length,
  1
);

const actions = {
  onResponseReceivedActions: [
    {
      appendContinuationItemsAction: {
        continuationItems: [
          { compactPromotedVideoRenderer: { ad: true } },
          { tileRenderer: { videoId: 'action-safe' } }
        ]
      }
    }
  ]
};
assert.equal(removeSponsoredFeedAds(actions, JSON.stringify(actions)), 1);
assert.equal(
  actions.onResponseReceivedActions[0].appendContinuationItemsAction
    .continuationItems.length,
  1
);

const variants = {
  contents: [
    { videoMastheadAdRendererBetaPreview: {} },
    { bannerPromoRenderer: {} },
    { brandVideoShelfRenderer: {} },
    { inFeedAdLayoutRenderer: {} },
    { tileRenderer: { videoId: 'normal' } }
  ]
};
assert.equal(removeSponsoredFeedAds(variants, JSON.stringify(variants)), 4);
assert.deepEqual(variants.contents, [{ tileRenderer: { videoId: 'normal' } }]);

const normal = {
  contents: [
    { shelfRenderer: { content: { horizontalListRenderer: { items: [] } } } },
    { tileRenderer: { videoId: 'abc' } }
  ],
  metadata: { label: 'Sponsored is just text here' }
};
const normalBefore = structuredClone(normal);
assert.equal(removeSponsoredFeedAds(normal, JSON.stringify(normal)), 0);
assert.deepEqual(normal, normalBefore);

// The serialized marker gate prevents an unnecessary traversal when the source
// text has no known ad renderer name.
const gated = {
  contents: [{ tvMastheadRenderer: { wouldBeRemoved: true } }]
};
assert.equal(removeSponsoredFeedAds(gated, '{"contents":[]}'), 0);
assert.equal(gated.contents.length, 1);

assert.equal(removeSponsoredFeedAds(null), 0);
assert.equal(removeSponsoredFeedAds('not an object'), 0);
assert.equal(removeSponsoredFeedAds({}), 0);

console.log('feed-ad-filter: all schema, startup, and regression tests passed');
