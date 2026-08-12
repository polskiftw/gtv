import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const core = require("../src/core.js");

test("the channel grid and fixed source mapping are exact", () => {
  assert.deepEqual(core.CHANNELS.map((channel) => channel.id), ["abc", "cbs", "nbc", "roar"]);
  assert.equal(core.findChannel("abc").url, "https://video.abc57.com/live/wbnd/live2/live2.m3u8");
  assert.equal(core.findChannel("cbs").url, "https://d368mt9otn5oix.cloudfront.net/out/v1/a195f1f4df3e46d6a6a2cd33795896b1/index.m3u8");
  assert.doesNotMatch(core.findChannel("cbs").url, /dai\.google\.com/);
  assert.equal(core.findChannel("nbc").url, "https://zeam.com/api/services/StreamInfo?stationId=12772");
  assert.equal(core.findChannel("roar").url, "https://fast-channels.sinclairstoryline.com/TBD/index.m3u8");
});

test("directional navigation is clamped to a predictable 2x2 grid", () => {
  const K = core.KEYS;
  assert.equal(core.moveFocus(0, K.RIGHT), 1);
  assert.equal(core.moveFocus(0, K.DOWN), 2);
  assert.equal(core.moveFocus(1, K.LEFT), 0);
  assert.equal(core.moveFocus(1, K.DOWN), 3);
  assert.equal(core.moveFocus(2, K.UP), 0);
  assert.equal(core.moveFocus(2, K.RIGHT), 3);
  assert.equal(core.moveFocus(3, K.UP), 1);
  assert.equal(core.moveFocus(3, K.LEFT), 2);
  assert.equal(core.moveFocus(0, K.LEFT), 0);
  assert.equal(core.moveFocus(3, K.DOWN), 3);
});

test("direct HLS sources resolve without network indirection", async () => {
  const direct = core.findChannel("abc");
  const resolved = await core.resolveChannel(direct, () => {
    throw new Error("fetch must not be used for a direct source");
  });
  assert.equal(resolved, direct.url);
});

test("WNDU resolves a fresh public HLS URL", async () => {
  const calls = [];
  const resolved = await core.resolveChannel(core.findChannel("nbc"), async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      async json() {
        return { streamUrl: "https://example.invalid/live/master.m3u8?access_token=short-lived" };
      },
    };
  });
  assert.match(resolved, /^https:\/\/.*\.m3u8\?/);
  assert.deepEqual(calls, [{
    url: "https://zeam.com/api/services/StreamInfo?stationId=12772",
    options: { cache: "no-store" },
  }]);
});

test("WNDU rejects malformed resolver responses", async () => {
  await assert.rejects(
    core.resolveChannel(core.findChannel("nbc"), async () => ({
      ok: true,
      async json() {
        return { streamUrl: "https://example.invalid/not-hls.mp4" };
      },
    })),
    /did not contain an HLS stream/
  );
});
