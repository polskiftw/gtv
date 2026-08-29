import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const sourcePath = process.argv[2];
const diagnosticsSourcePath = process.argv[3];
if (!sourcePath || !diagnosticsSourcePath) {
  throw new Error('usage: test-json-stringify-hook.mjs <hook-source> <request-diagnostics-source>');
}

const originalStringify = JSON.stringify;
const originalInfo = console.info;
const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'gtv-json-hook-'));

try {
  console.info = () => {};
  await mkdir(path.join(tempRoot, 'hooks'), { recursive: true });
  const stagedHook = path.join(tempRoot, 'hooks', 'json-stringify.ts');
  const stagedDiagnostics = path.join(tempRoot, 'playback-request-diagnostics.js');
  await copyFile(path.resolve(sourcePath), stagedHook);
  await copyFile(path.resolve(diagnosticsSourcePath), stagedDiagnostics);

  const sourceUrl = pathToFileURL(stagedHook);
  sourceUrl.searchParams.set('testRun', `${Date.now()}`);
  await import(sourceUrl.href);
  const diagnosticsModule = await import(pathToFileURL(stagedDiagnostics).href);

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
  assert.equal(serialized.playbackContext.contentPlaybackContext.signatureTimestamp, 123);
  assert.equal(serialized.playbackContext.contentPlaybackContext.isInlinePlaybackNoAd, true);
  assert.equal(
    Object.prototype.hasOwnProperty.call(contentPlaybackContext, 'isInlinePlaybackNoAd'),
    false,
    'hook must not mutate caller-owned playback context'
  );

  let requestSnapshot = diagnosticsModule.getPlaybackRequestDiagnosticsSnapshot();
  assert.equal(requestSnapshot.playbackCandidates, 1);
  assert.equal(requestSnapshot.patchesApplied, 1);
  assert.equal(requestSnapshot.serializedConfirmed, 1);
  assert.equal(requestSnapshot.recentRequests[0].flagBefore, 'missing');
  assert.equal(requestSnapshot.recentRequests[0].flagAfter, 'true');
  assert.equal(requestSnapshot.recentRequests[0].serializedConfirmed, true);
  assert.ok(requestSnapshot.recentRequests[0].rootKeys.includes('playbackContext'));
  assert.ok(requestSnapshot.recentRequests[0].contentKeys.includes('signatureTimestamp'));
  assert.equal(JSON.stringify(requestSnapshot).includes('123'), false, 'diagnostics must not retain scalar request values');

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
    JSON.parse(functionReplacerOutput).playbackContext.contentPlaybackContext.signatureTimestamp,
    456
  );

  const stripsFlagOutput = JSON.stringify(payload, (key, value) =>
    key === 'isInlinePlaybackNoAd' ? undefined : value
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      JSON.parse(stripsFlagOutput).playbackContext.contentPlaybackContext,
      'isInlinePlaybackNoAd'
    ),
    false
  );
  requestSnapshot = diagnosticsModule.getPlaybackRequestDiagnosticsSnapshot();
  assert.equal(requestSnapshot.recentRequests.at(-1).serializedConfirmed, false);

  const nullPrototypeContext = Object.create(null);
  nullPrototypeContext.foo = 'bar';
  const nullPrototypePayload = {
    playbackContext: { contentPlaybackContext: nullPrototypeContext }
  };
  assert.equal(
    JSON.parse(JSON.stringify(nullPrototypePayload)).playbackContext.contentPlaybackContext.isInlinePlaybackNoAd,
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

  requestSnapshot = diagnosticsModule.getPlaybackRequestDiagnosticsSnapshot();
  assert.ok(requestSnapshot.playbackCandidates >= 6);
  assert.ok(requestSnapshot.patchesApplied >= 5);
  assert.ok(requestSnapshot.serializedConfirmed >= 4);

  console.log('json-stringify-hook: compatibility and playback-request diagnostics regressions passed');
} finally {
  JSON.stringify = originalStringify;
  console.info = originalInfo;
  await rm(tempRoot, { recursive: true, force: true });
}
