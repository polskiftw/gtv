import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const modulePath = resolve(
  process.argv[2] || new URL('../patches/ssai-ad-skipper.js', import.meta.url).pathname
);
const source = await readFile(modulePath, 'utf8');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const {
  trySkipAdPlayer,
  handleAdPlaybackResponse,
  getSsaiAdSkipDiagnosticsSnapshot
} = await import(moduleUrl);

const seekCalls = [];
const seekPlayer = {
  getProgressState() {
    return { duration: 17, current: 1 };
  },
  seekTo(duration) {
    seekCalls.push(duration);
  },
  querySelector() {
    return null;
  }
};
assert.equal(trySkipAdPlayer(seekPlayer), 'player-seek');
assert.deepEqual(seekCalls, [17]);

const video = { duration: 9, currentTime: 0 };
const videoPlayer = {
  getProgressState() {
    return { duration: 9, current: 2 };
  },
  querySelector() {
    return video;
  }
};
assert.equal(trySkipAdPlayer(videoPlayer), 'video-seek');
assert.equal(video.currentTime, 9);

assert.equal(
  trySkipAdPlayer({ getProgressState: () => ({ duration: 0 }) }),
  'duration-unavailable'
);
assert.equal(trySkipAdPlayer(null), 'player-missing');

const toggles = [];
const appended = [];
globalThis.document = {
  head: {
    appendChild(node) {
      appended.push(node);
    }
  },
  documentElement: {
    classList: {
      toggle(name, enabled) {
        toggles.push([name, enabled]);
      }
    },
    appendChild(node) {
      appended.push(node);
    }
  },
  getElementById() {
    return null;
  },
  createElement(tag) {
    return { tagName: tag, id: '', textContent: '' };
  },
  querySelector(selector) {
    if (selector === '.html5-video-player') return seekPlayer;
    return null;
  }
};

assert.equal(handleAdPlaybackResponse({ anything: true }), false);
assert.equal(handleAdPlaybackResponse({ isAdPlayback: true }), true);
await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));

let snapshot = getSsaiAdSkipDiagnosticsSnapshot();
assert.equal(snapshot.adPlaybackEvents, 1);
assert.equal(snapshot.adPlaybackTrueEvents, 1);
assert.equal(snapshot.playerSeekSuccesses, 1);
assert.equal(snapshot.videoSeekSuccesses, 0);
assert.equal(snapshot.lastResult, 'player-seek');
assert.ok(snapshot.skipAttempts >= 1);
assert.ok(appended.length >= 1, 'ad-hide style should be installed');
assert.ok(
  toggles.some(([, enabled]) => enabled === true),
  'ad visual suppression should engage before the skip'
);

assert.equal(handleAdPlaybackResponse({ isAdPlayback: false }), true);
snapshot = getSsaiAdSkipDiagnosticsSnapshot();
assert.equal(snapshot.adPlaybackEvents, 2);
assert.equal(snapshot.adPlaybackFalseEvents, 1);
assert.equal(snapshot.lastResult, 'ad-playback-false');
assert.ok(
  toggles.some(([, enabled]) => enabled === false),
  'ad visual suppression should release when playback leaves the ad state'
);

delete globalThis.document;
console.log('ssai-ad-skipper: guarded player/video ad skipping passed');
