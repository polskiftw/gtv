const SPONSORED_FEED_RENDERER_KEYS = [
  'adSlotRenderer',
  'tvMastheadRenderer',
  'videoMastheadAdV3Renderer',
  'videoMastheadAdRenderer',
  'videoMastheadAdRendererBetaPreview',
  'bannerPromoRenderer',
  'inFeedAdLayoutRenderer',
  'displayAdRenderer',
  'searchPyvRenderer',
  'promotedVideoRenderer',
  'promotedSparklesWebRenderer',
  'promotedSparklesTextSearchRenderer',
  'compactPromotedItemRenderer',
  'compactPromotedVideoRenderer',
  'gridPromotedVideoRenderer',
  'carouselAdRenderer',
  'sponsoredVideoRenderer',
  'brandVideoShelfRenderer',
  'brandVideoSingletonRenderer',
  'brandcastVideoRenderer'
];

const SPONSORED_FEED_RENDERER_KEY_SET = new Set(SPONSORED_FEED_RENDERER_KEYS);
const SPONSORED_FEED_MARKERS = SPONSORED_FEED_RENDERER_KEYS.map(
  (key) => `"${key}"`
);

// Deep enough to cover known Innertube response envelopes while keeping a hard
// ceiling if YouTube returns an unexpectedly deep object graph.
const MAX_SCAN_DEPTH = 48;

// An array item may be wrapped in several renderer/content objects before the
// actual ad renderer. Do not cross a nested array here: that array is a content
// collection and should have its ad children filtered individually instead of
// causing the whole parent shelf/section to be removed.
const MAX_WRAPPER_DEPTH = 12;

// DEV diagnostics deliberately collect only schema/key names and object paths,
// never payload values. This keeps the on-TV report small and easy to transcribe.
const DEV_MAX_CANDIDATES = 10;
const DEV_MAX_VISITED_NODES = 2500;
const DEV_MAX_PATH_LENGTH = 180;
const DEV_SUSPICIOUS_KEY_PATTERN =
  /(ad|advert|promo|sponsor|masthead|brand|banner|sparkle)/i;
const DEV_EXPECTED_KEYS = new Set([
  ...SPONSORED_FEED_RENDERER_KEYS,
  'adPlacements',
  'adSlots',
  'playerAds',
  'adClientParams',
  'isAd'
]);

const devDiagnostics = {
  parsedResponses: 0,
  homeResponses: 0,
  knownMarkerResponses: 0,
  removedFeedRenderers: 0,
  suspiciousCandidates: new Map(),
  homeLeadingShapes: [],
  lastObservedAt: null
};

function isObject(value) {
  return typeof value === 'object' && value !== null;
}

function isObjectRecord(value) {
  return isObject(value) && !Array.isArray(value);
}

function formatPath(parentPath, key) {
  const next = key.startsWith('[') ? `${parentPath}${key}` : `${parentPath}.${key}`;
  if (next.length <= DEV_MAX_PATH_LENGTH) return next;
  return `…${next.slice(-(DEV_MAX_PATH_LENGTH - 1))}`;
}

function collectRendererKeys(value, maxDepth = 4) {
  if (!isObjectRecord(value)) return [];

  const found = [];
  const seen = new Set();
  const stack = [{ value, depth: 0 }];

  while (stack.length > 0 && found.length < 4) {
    const current = stack.pop();
    const keys = Object.keys(current.value);

    for (let i = 0; i < keys.length && found.length < 4; i += 1) {
      const key = keys[i];
      if (/Renderer$/.test(key) && !seen.has(key)) {
        seen.add(key);
        found.push(key);
      }
    }

    if (current.depth >= maxDepth) continue;

    for (let i = keys.length - 1; i >= 0; i -= 1) {
      const child = current.value[keys[i]];
      if (isObjectRecord(child)) {
        stack.push({ value: child, depth: current.depth + 1 });
      }
    }
  }

  return found;
}

function updateHomeLeadingShapes(root) {
  const contents =
    root?.contents?.tvBrowseRenderer?.content?.tvSurfaceContentRenderer?.content
      ?.sectionListRenderer?.contents;

  if (!Array.isArray(contents)) return;

  devDiagnostics.homeResponses += 1;
  devDiagnostics.homeLeadingShapes = contents.slice(0, 4).map((item, index) => {
    const renderers = collectRendererKeys(item);
    return {
      index: index + 1,
      renderers: renderers.length > 0 ? renderers : ['(no renderer key found)']
    };
  });
}

function observeDevDiagnostics(root, serializedText) {
  devDiagnostics.parsedResponses += 1;
  devDiagnostics.lastObservedAt = new Date().toISOString();

  if (
    typeof serializedText === 'string' &&
    hasSponsoredFeedMarker(serializedText)
  ) {
    devDiagnostics.knownMarkerResponses += 1;
  }

  updateHomeLeadingShapes(root);

  if (
    typeof serializedText === 'string' &&
    !DEV_SUSPICIOUS_KEY_PATTERN.test(serializedText)
  ) {
    return;
  }

  const stack = [{ value: root, path: '$', depth: 0 }];
  let visited = 0;

  while (stack.length > 0 && visited < DEV_MAX_VISITED_NODES) {
    const current = stack.pop();
    const node = current.value;
    if (!isObject(node) || current.depth > MAX_SCAN_DEPTH) continue;

    visited += 1;

    if (Array.isArray(node)) {
      for (let i = Math.min(node.length, 24) - 1; i >= 0; i -= 1) {
        const child = node[i];
        if (isObject(child)) {
          stack.push({
            value: child,
            path: formatPath(current.path, `[${i}]`),
            depth: current.depth + 1
          });
        }
      }
      continue;
    }

    const keys = Object.keys(node);
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];

      if (
        key.length <= 100 &&
        DEV_SUSPICIOUS_KEY_PATTERN.test(key) &&
        !DEV_EXPECTED_KEYS.has(key)
      ) {
        const path = formatPath(current.path, key);
        const existing = devDiagnostics.suspiciousCandidates.get(key);
        const nearbyKeys = keys.filter((candidate) => candidate !== key).slice(0, 6);
        const value = node[key];
        const valueKind = Array.isArray(value) ? 'array' : typeof value;

        if (existing) {
          existing.count += 1;
          existing.path = path;
          existing.nearbyKeys = nearbyKeys;
          existing.valueKind = valueKind;
        } else if (
          devDiagnostics.suspiciousCandidates.size < DEV_MAX_CANDIDATES
        ) {
          devDiagnostics.suspiciousCandidates.set(key, {
            key,
            count: 1,
            path,
            nearbyKeys,
            valueKind
          });
        }
      }

      const child = node[key];
      if (isObject(child) && current.depth < MAX_SCAN_DEPTH) {
        stack.push({
          value: child,
          path: formatPath(current.path, key),
          depth: current.depth + 1
        });
      }
    }
  }
}

export function getFeedAdDiagnosticsSnapshot() {
  return {
    parsedResponses: devDiagnostics.parsedResponses,
    homeResponses: devDiagnostics.homeResponses,
    knownMarkerResponses: devDiagnostics.knownMarkerResponses,
    removedFeedRenderers: devDiagnostics.removedFeedRenderers,
    lastObservedAt: devDiagnostics.lastObservedAt,
    homeLeadingShapes: devDiagnostics.homeLeadingShapes.map((entry) => ({
      index: entry.index,
      renderers: [...entry.renderers]
    })),
    suspiciousCandidates: Array.from(
      devDiagnostics.suspiciousCandidates.values(),
      (entry) => ({
        key: entry.key,
        count: entry.count,
        path: entry.path,
        nearbyKeys: [...entry.nearbyKeys],
        valueKind: entry.valueKind
      })
    )
  };
}

export function hasSponsoredFeedMarker(serializedText) {
  if (typeof serializedText !== 'string' || serializedText.length === 0) {
    return false;
  }

  for (let i = 0; i < SPONSORED_FEED_MARKERS.length; i += 1) {
    if (serializedText.indexOf(SPONSORED_FEED_MARKERS[i]) !== -1) {
      return true;
    }
  }
  return false;
}

function containsSponsoredRendererBeforeCollection(value) {
  if (!isObjectRecord(value)) return false;

  const stack = [{ value, depth: 0 }];
  while (stack.length > 0) {
    const current = stack.pop();
    const node = current.value;
    const keys = Object.keys(node);

    for (let i = 0; i < keys.length; i += 1) {
      if (SPONSORED_FEED_RENDERER_KEY_SET.has(keys[i])) {
        return true;
      }
    }

    if (current.depth >= MAX_WRAPPER_DEPTH) continue;

    for (let i = 0; i < keys.length; i += 1) {
      const child = node[keys[i]];
      if (isObjectRecord(child)) {
        stack.push({ value: child, depth: current.depth + 1 });
      }
    }
  }

  return false;
}

/**
 * Remove sponsored feed renderers from a parsed YouTube/Innertube response.
 *
 * The optional serializedText argument is a fast-path guard for JSON.parse
 * hooks: if no known renderer marker exists in the source text, the parsed
 * object is returned untouched without walking it.
 *
 * @param {unknown} root
 * @param {unknown} serializedText
 * @returns {number} number of renderer objects/items removed
 */
export function removeSponsoredFeedAds(root, serializedText) {
  if (!isObject(root)) return 0;

  observeDevDiagnostics(root, serializedText);

  if (
    typeof serializedText === 'string' &&
    !hasSponsoredFeedMarker(serializedText)
  ) {
    return 0;
  }

  let removed = 0;
  const stack = [{ value: root, depth: 0 }];

  while (stack.length > 0) {
    const current = stack.pop();
    const node = current.value;
    if (!isObject(node) || current.depth > MAX_SCAN_DEPTH) continue;

    if (Array.isArray(node)) {
      let writeIndex = 0;
      for (let readIndex = 0; readIndex < node.length; readIndex += 1) {
        const item = node[readIndex];

        if (
          isObjectRecord(item) &&
          containsSponsoredRendererBeforeCollection(item)
        ) {
          removed += 1;
          continue;
        }

        node[writeIndex] = item;
        writeIndex += 1;

        if (isObject(item) && current.depth < MAX_SCAN_DEPTH) {
          stack.push({ value: item, depth: current.depth + 1 });
        }
      }
      node.length = writeIndex;
      continue;
    }

    const keys = Object.keys(node);
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      if (SPONSORED_FEED_RENDERER_KEY_SET.has(key)) {
        delete node[key];
        removed += 1;
        continue;
      }

      const child = node[key];
      if (isObject(child) && current.depth < MAX_SCAN_DEPTH) {
        stack.push({ value: child, depth: current.depth + 1 });
      }
    }
  }

  devDiagnostics.removedFeedRenderers += removed;
  return removed;
}
