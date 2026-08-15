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

function isObject(value) {
  return typeof value === 'object' && value !== null;
}

function isObjectRecord(value) {
  return isObject(value) && !Array.isArray(value);
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

  return removed;
}
