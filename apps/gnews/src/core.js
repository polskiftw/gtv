(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.GNewsCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var KEYS = Object.freeze({
    ENTER: 13,
    LEFT: 37,
    UP: 38,
    RIGHT: 39,
    DOWN: 40,
    BACK: 461,
  });

  var CHANNELS = Object.freeze([
    Object.freeze({
      id: "abc",
      type: "hls",
      url: "https://video.abc57.com/live/wbnd/live2/live2.m3u8",
    }),
    Object.freeze({
      id: "cbs",
      type: "hls",
      url: "https://d368mt9otn5oix.cloudfront.net/out/v1/a195f1f4df3e46d6a6a2cd33795896b1/index.m3u8",
    }),
    Object.freeze({
      id: "nbc",
      type: "resolver",
      url: "https://zeam.com/api/services/StreamInfo?stationId=12772",
    }),
    Object.freeze({
      id: "roar",
      type: "hls",
      url: "https://fast-channels.sinclairstoryline.com/TBD/index.m3u8",
    }),
  ]);

  function moveFocus(index, keyCode) {
    var row = Math.floor(index / 2);
    var column = index % 2;
    if (keyCode === KEYS.LEFT) column = Math.max(0, column - 1);
    if (keyCode === KEYS.RIGHT) column = Math.min(1, column + 1);
    if (keyCode === KEYS.UP) row = Math.max(0, row - 1);
    if (keyCode === KEYS.DOWN) row = Math.min(1, row + 1);
    return row * 2 + column;
  }

  function findChannel(id) {
    for (var index = 0; index < CHANNELS.length; index += 1) {
      if (CHANNELS[index].id === id) return CHANNELS[index];
    }
    return null;
  }

  function fetchWithTimeout(fetchImpl, url, timeoutMs, timers) {
    return new Promise(function (resolve, reject) {
      var settled = false;
      var timer = timers.setTimeout(function () {
        if (settled) return;
        settled = true;
        reject(new Error("Source resolution timed out"));
      }, timeoutMs);

      fetchImpl(url, { cache: "no-store" }).then(
        function (response) {
          if (settled) return;
          if (!response || !response.ok) {
            settled = true;
            timers.clearTimeout(timer);
            reject(new Error("Source resolution failed"));
            return;
          }
          response.json().then(resolveJson, rejectJson);
        },
        rejectFetch
      );

      function resolveJson(data) {
        if (settled) return;
        settled = true;
        timers.clearTimeout(timer);
        resolve(data);
      }

      function rejectJson() {
        if (settled) return;
        settled = true;
        timers.clearTimeout(timer);
        reject(new Error("Source response was invalid"));
      }

      function rejectFetch() {
        if (settled) return;
        settled = true;
        timers.clearTimeout(timer);
        reject(new Error("Source resolution failed"));
      }
    });
  }

  function resolveChannel(channel, fetchImpl, options) {
    if (!channel) return Promise.reject(new Error("Unknown channel"));
    if (channel.type === "hls") return Promise.resolve(channel.url);
    if (channel.type !== "resolver") return Promise.reject(new Error("Unsupported source type"));

    var settings = options || {};
    var timers = settings.timers || {
      setTimeout: setTimeout,
      clearTimeout: clearTimeout,
    };
    var timeoutMs = settings.timeoutMs || 10000;
    return fetchWithTimeout(fetchImpl, channel.url, timeoutMs, timers).then(function (data) {
      var streamUrl = data && data.streamUrl;
      if (typeof streamUrl !== "string" || !/^https:\/\/.+\.m3u8(?:\?|$)/i.test(streamUrl)) {
        throw new Error("Source response did not contain an HLS stream");
      }
      return streamUrl;
    });
  }

  return Object.freeze({
    KEYS: KEYS,
    CHANNELS: CHANNELS,
    moveFocus: moveFocus,
    findChannel: findChannel,
    resolveChannel: resolveChannel,
  });
});
