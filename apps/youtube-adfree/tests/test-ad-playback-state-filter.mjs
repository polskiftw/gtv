import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

if (process.argv.length < 3) {
  throw new Error('usage: test-ad-playback-state-filter.mjs <ad-playback-state-filter.js>');
}

const moduleUrl = pathToFileURL(resolve(process.argv[2])).href;
const { neutralizeStandaloneAdPlayback } = await import(moduleUrl);

const capturedShape = {
  responseContext: { serviceTrackingParams: [] },
  trackingParams: 'redacted',
  isAdPlayback: true
};
assert.equal(neutralizeStandaloneAdPlayback(capturedShape), true);
assert.equal(capturedShape.isAdPlayback, false);
assert.deepEqual(Object.keys(capturedShape), [
  'responseContext',
  'trackingParams',
  'isAdPlayback'
]);

const alreadyFalse = {
  responseContext: {},
  trackingParams: 'redacted',
  isAdPlayback: false
};
assert.equal(neutralizeStandaloneAdPlayback(alreadyFalse), false);
assert.equal(alreadyFalse.isAdPlayback, false);

const normalPlayerResponse = {
  responseContext: {},
  playabilityStatus: {},
  streamingData: {},
  playbackTracking: {},
  videoDetails: {},
  playerConfig: {},
  trackingParams: 'redacted',
  isAdPlayback: true
};
assert.equal(neutralizeStandaloneAdPlayback(normalPlayerResponse), false);
assert.equal(normalPlayerResponse.isAdPlayback, true);

const nestedOnly = {
  responseContext: {},
  trackingParams: 'redacted',
  payload: { isAdPlayback: true }
};
assert.equal(neutralizeStandaloneAdPlayback(nestedOnly), false);
assert.equal(nestedOnly.payload.isAdPlayback, true);

const missingEnvelopeMember = {
  responseContext: {},
  isAdPlayback: true
};
assert.equal(neutralizeStandaloneAdPlayback(missingEnvelopeMember), false);
assert.equal(missingEnvelopeMember.isAdPlayback, true);

console.log('ad-playback-state-filter: narrow captured-shape neutralization passed');
