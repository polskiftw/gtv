import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

if (process.argv.length < 4) throw new Error('usage: test-dev-diagnostics.mjs <feed-ad-filter.js> <dev-diagnostics.js>');
const feedFilterPath = resolve(process.argv[2]);
const devUiPath = resolve(process.argv[3]);
const feedModule = await import(pathToFileURL(feedFilterPath).href);

const unknownHomeShape = {
  responseContext: { serviceTrackingParams: [] },
  contents: { newBrowseSurfaceRenderer: { browseId: 'FEwhat_to_watch', pageType: 'HOME', sections: [
    { heroMasthead2026Renderer: { style: 'FULL_BLEED', title: 'Example campaign', trackingParams: 'payload-value-must-not-leak', autoplay: {} } },
    { shelfRenderer: { content: {} } }
  ] } }
};
assert.equal(feedModule.removeSponsoredFeedAds(unknownHomeShape, JSON.stringify(unknownHomeShape)), 0);

let snapshot = feedModule.getFeedAdDiagnosticsSnapshot();
assert.equal(snapshot.homeResponses, 0);
assert.equal(snapshot.profiledResponses, 1);
assert.ok(snapshot.recentResponses[0].renderers.some((entry) => entry.key === 'heroMasthead2026Renderer'));
assert.ok(snapshot.recentResponses[0].signals.some((entry) => entry.key === 'heroMasthead2026Renderer'));
assert.ok(snapshot.recentResponses[0].hints.some((entry) => entry.key === 'browseId' && entry.value === 'FEwhat_to_watch'));
assert.equal(JSON.stringify(snapshot).includes('payload-value-must-not-leak'), false);

const player = {
  responseContext: {}, playabilityStatus: {}, streamingData: {}, playbackTracking: {},
  videoDetails: {}, playerConfig: {}, adBreakHeartbeatParams: 'do-not-retain'
};
feedModule.removeSponsoredFeedAds(player, JSON.stringify(player));
for (let i = 0; i < 3; i += 1) {
  const noise = { responseContext: {}, actionStatePair: { n: i } };
  feedModule.removeSponsoredFeedAds(noise, JSON.stringify(noise));
}
const adState = { responseContext: {}, trackingParams: 'secret', isAdPlayback: true };
feedModule.removeSponsoredFeedAds(adState, JSON.stringify(adState));
const after = { responseContext: {}, feedbackResponses: [] };
feedModule.removeSponsoredFeedAds(after, JSON.stringify(after));

snapshot = feedModule.getFeedAdDiagnosticsSnapshot();
assert.equal(snapshot.adPlaybackEvents.length, 1);
const adEvent = snapshot.adPlaybackEvents[0];
assert.equal(adEvent.value, true);
assert.equal(adEvent.path, '$.isAdPlayback');
assert.ok(adEvent.topKeys.includes('isAdPlayback'));
assert.ok(adEvent.nearestPlayerResponse);
assert.ok(adEvent.nearestPlayerResponse.topKeys.includes('streamingData'));
assert.equal(adEvent.before.length, 4);
assert.equal(adEvent.after.length, 1);
assert.equal(JSON.stringify(adEvent).includes('secret'), false);
assert.ok(snapshot.recentResponses.some((profile) => profile.hints.some((hint) => hint.key === 'isAdPlayback' && hint.value === 'true')));

const qrUpdate = {
  responseContext: {},
  feedbackResponses: [],
  frameworkUpdates: { entityBatchUpdate: { mutations: [ { payload: {
    qrCodeEntity: { style: 'QR_CODE_RENDERER_STYLE_ATA_SIDESHEET', label: 'safe-label', trackingParams: 'must-not-leak' }
  } } ] } }
};
feedModule.removeSponsoredFeedAds(qrUpdate, JSON.stringify(qrUpdate));
snapshot = feedModule.getFeedAdDiagnosticsSnapshot();
assert.equal(snapshot.entityEvents.length, 1);
assert.equal(snapshot.entityEvents[0].key, 'qrCodeEntity');
assert.ok(snapshot.entityEvents[0].path.endsWith('.payload.qrCodeEntity'));
assert.ok(snapshot.entityEvents[0].details.includes('style=QR_CODE_RENDERER_STYLE_ATA_SIDESHEET'));
assert.equal(snapshot.entityEvents[0].latestAdPlayback.value, true);
assert.equal(JSON.stringify(snapshot.entityEvents[0]).includes('must-not-leak'), false);

const falsePositiveShape = {
  responseContext: {},
  payload: {},
  dynamicReadaheadConfig: {},
  readAheadGrowthRateMs: 2,
  adaptiveFormats: []
};
feedModule.removeSponsoredFeedAds(falsePositiveShape, JSON.stringify(falsePositiveShape));
snapshot = feedModule.getFeedAdDiagnosticsSnapshot();
for (const falseKey of ['payload', 'dynamicReadaheadConfig', 'readAheadGrowthRateMs', 'adaptiveFormats']) {
  assert.equal(snapshot.signalInventory.some((entry) => entry.key === falseKey), false, `${falseKey} must not be an ad signal`);
}
assert.ok(snapshot.signalInventory.some((entry) => entry.key === 'isAdPlayback'));

const known = { contents: [{ videoMastheadAdV3Renderer: { trackingParams: 'x' } }] };
assert.equal(feedModule.removeSponsoredFeedAds(known, JSON.stringify(known)), 1);
snapshot = feedModule.getFeedAdDiagnosticsSnapshot();
assert.equal(snapshot.removedFeedRenderers, 1);
assert.equal(snapshot.knownMarkerResponses, 1);

const devUi = await readFile(devUiPath, 'utf8');
assert.match(devUi, /GTV DEV DIAGNOSTICS v4/);
assert.match(devUi, /AD PLAYBACK EVENTS/);
assert.match(devUi, /ENTITY PAYLOAD EVENTS/);
assert.match(devUi, /isAdPlayback=\$\{event\.value\}/);
assert.match(devUi, /latest ad-playback event/);
assert.match(devUi, /PAGE_ROW_BUDGET/);
assert.match(devUi, /BLUE = next page/);
assert.match(devUi, /BACK = close/);
assert.match(devUi, /stopImmediatePropagation/);
assert.match(devUi, /window\.addEventListener\('keydown', handleKey, true\)/);
assert.doesNotMatch(devUi, /ArrowUp|ArrowDown|scrollTop|PAGE_SCROLL_FRACTION/);
assert.doesNotMatch(devUi, /console\.(log|debug|info)\(/);

console.log('dev-diagnostics: targeted ad-playback/entity capture and paging contract passed');
