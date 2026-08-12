import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const sourcePath = process.argv[2];
if (!sourcePath) {
  throw new Error('usage: test-json-stringify-hook.mjs <hook-source>');
}

const originalStringify = JSON.stringify;
const originalInfo = console.info;

try {
  console.info = () => {};
  const sourceUrl = pathToFileURL(path.resolve(sourcePath));
  sourceUrl.searchParams.set('testRun', `${Date.now()}`);
  await import(sourceUrl.href);

  const unrelated = { a: 1, f() {} };
  assert.equal(originalStringify(unrelated), '{"a":1}');
  assert.equal(JSON.stringify(unrelated), '{"a":1}');

  let getterReads = 0;
  const withGetter = {
    get a() {
      getterReads += 1;
      return 1;
    }
  };
  assert.equal(JSON.stringify(withGetter), '{"a":1}');
  assert.equal(getterReads, 1, 'hook must not inspect unrelated getters');

  const contentPlaybackContext = Object.freeze({ signatureTimestamp: 123 });
  const playbackContext = Object.freeze({ contentPlaybackContext });
  const payload = Object.freeze({
    playbackContext,
    other: { f() {} }
  });

  const serialized = JSON.parse(JSON.stringify(payload));
  assert.equal(
    serialized.playbackContext.contentPlaybackContext.signatureTimestamp,
    123
  );
  assert.equal(
    serialized.playbackContext.contentPlaybackContext.isInlinePlaybackNoAd,
    true
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      contentPlaybackContext,
      'isInlinePlaybackNoAd'
    ),
    false,
    'hook must not mutate caller-owned playback context'
  );

  const explicitlyEnabled = Object.freeze({
    playbackContext: Object.freeze({
      contentPlaybackContext: Object.freeze({
        signatureTimestamp: 321,
        isInlinePlaybackNoAd: true
      })
    })
  });
  assert.equal(
    JSON.stringify(explicitlyEnabled),
    originalStringify(explicitlyEnabled),
    'already-marked playback requests should serialize without cloning'
  );

  const explicitlyDisabledContext = Object.freeze({
    signatureTimestamp: 654,
    isInlinePlaybackNoAd: false
  });
  const explicitlyDisabled = Object.freeze({
    playbackContext: Object.freeze({ contentPlaybackContext: explicitlyDisabledContext })
  });
  const patched = JSON.parse(JSON.stringify(explicitlyDisabled));
  assert.equal(
    patched.playbackContext.contentPlaybackContext.isInlinePlaybackNoAd,
    true,
    'playback requests must preserve upstream isInlinePlaybackNoAd behavior'
  );
  assert.equal(
    explicitlyDisabledContext.isInlinePlaybackNoAd,
    false,
    'hook must not mutate caller-owned playback context'
  );

  const whitelistOutput = JSON.stringify(payload, [
    'playbackContext',
    'contentPlaybackContext',
    'signatureTimestamp',
    'isInlinePlaybackNoAd'
  ]);
  assert.deepEqual(JSON.parse(whitelistOutput), {
    playbackContext: {
      contentPlaybackContext: {
        signatureTimestamp: 123,
        isInlinePlaybackNoAd: true
      }
    }
  });

  const functionReplacerOutput = JSON.stringify(payload, (key, value) =>
    key === 'signatureTimestamp' ? 456 : value
  );
  assert.equal(
    JSON.parse(functionReplacerOutput).playbackContext.contentPlaybackContext
      .signatureTimestamp,
    456
  );

  const nullPrototypeContext = Object.create(null);
  nullPrototypeContext.foo = 'bar';
  const nullPrototypePayload = {
    playbackContext: { contentPlaybackContext: nullPrototypeContext }
  };
  assert.equal(
    JSON.parse(JSON.stringify(nullPrototypePayload)).playbackContext
      .contentPlaybackContext.isInlinePlaybackNoAd,
    true
  );

  const date = new Date('2026-08-11T00:00:00Z');
  date.playbackContext = {
    contentPlaybackContext: { signatureTimestamp: 1 }
  };
  assert.equal(JSON.stringify(date), originalStringify(date));

  const circular = {};
  circular.self = circular;
  assert.throws(() => originalStringify(circular), TypeError);
  assert.throws(() => JSON.stringify(circular), TypeError);

  console.log('json-stringify-hook: all compatibility and regression tests passed');
} finally {
  JSON.stringify = originalStringify;
  console.info = originalInfo;
}
