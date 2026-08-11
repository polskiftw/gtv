import assert from 'node:assert/strict';
import fs from 'node:fs';

const sourcePath = process.argv[2];
if (!sourcePath) {
  throw new Error('usage: test-json-stringify-hook.mjs <hook-source>');
}

const source = fs.readFileSync(sourcePath, 'utf8');
const originalStringify = JSON.stringify;
const originalInfo = console.info;

try {
  console.info = () => {};
  await import(
    `data:text/javascript;base64,${Buffer.from(source).toString('base64')}#${Date.now()}`
  );

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

  const circular = {};
  circular.self = circular;
  assert.throws(() => originalStringify(circular), TypeError);
  assert.throws(() => JSON.stringify(circular), TypeError);

  console.log('json-stringify-hook: all compatibility and regression tests passed');
} finally {
  JSON.stringify = originalStringify;
  console.info = originalInfo;
}
