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

const MAX_SCAN_DEPTH = 48;
const MAX_WRAPPER_DEPTH = 12;

// DEV diagnostics profile response structure without changing unknown schemas.
const DEV_PROFILE_MIN_CHARS = 4000;
const DEV_PROFILE_MAX_DEPTH = 14;
const DEV_PROFILE_MAX_VISITED_NODES = 1600;
const DEV_PROFILE_MAX_ARRAY_ITEMS = 20;
const DEV_MAX_PATH_LENGTH = 220;
const DEV_RECENT_RESPONSE_LIMIT = 8;
const DEV_LARGEST_RESPONSE_LIMIT = 6;
const DEV_RENDERERS_PER_RESPONSE = 18;
const DEV_SIGNALS_PER_RESPONSE = 14;
const DEV_HINTS_PER_RESPONSE = 14;
const DEV_ARRAYS_PER_RESPONSE = 8;
const DEV_RENDERER_INVENTORY_LIMIT = 160;
const DEV_SIGNAL_INVENTORY_LIMIT = 120;
const DEV_SHAPE_INVENTORY_LIMIT = 24;
const DEV_AD_EVENT_LIMIT = 12;
const DEV_ENTITY_EVENT_LIMIT = 20;
const DEV_TIMELINE_LIMIT = 32;
const DEV_EVENT_NEIGHBOR_COUNT = 4;
const DEV_EXACT_SCAN_MAX_DEPTH = 16;
const DEV_EXACT_SCAN_MAX_VISITED_NODES = 900;

const DEV_RENDERER_KEY_PATTERN = /(Renderer|ViewModel)$/;
const DEV_PROFILE_TEXT_PATTERN =
  /(Renderer"|ViewModel"|continuationContents"|onResponseReceived|browseId"|pageType"|masthead|promo|adSlot|sponsor|isAdPlayback|qrCodeEntity)/i;

const DEV_SIGNAL_TOKENS = new Set([
  'ad',
  'ads',
  'advert',
  'advertisement',
  'advertising',
  'promo',
  'promoted',
  'promotion',
  'sponsor',
  'sponsored',
  'masthead',
  'brand',
  'banner',
  'sparkle',
  'sparkles',
  'hero',
  'showcase',
  'spotlight',
  'campaign',
  'commercial',
  'companion',
  'creative',
  'offer'
]);

const DEV_STRUCTURED_ROOT_KEYS = new Set([
  'contents',
  'continuationContents',
  'onResponseReceivedActions',
  'onResponseReceivedEndpoints',
  'actions',
  'responseContext',
  'frameworkUpdates',
  'playerResponse',
  'sidebar'
]);

// Values from this allowlist are safe enough to show on the TV diagnostics.
// Do not add tracking params, continuation tokens, URLs, auth data, or arbitrary
// payload strings here.
const DEV_HINT_KEYS = new Set([
  'browseId',
  'pageType',
  'targetId',
  'surface',
  'style',
  'layout',
  'placement',
  'adType',
  'format',
  'variant',
  'clientName',
  'clientVersion',
  'isAd',
  'isAdPlayback',
  'title',
  'name',
  'label'
]);
const DEV_SENSITIVE_HINT_KEY_PATTERN =
  /(tracking|token|continuation|signature|visitor|auth|cookie|url|params)/i;

const devDiagnostics = {
  parsedResponses: 0,
  profiledResponses: 0,
  homeResponses: 0,
  knownMarkerResponses: 0,
  removedFeedRenderers: 0,
  sequence: 0,
  lastObservedAt: null,
  largestObservedChars: 0,
  homeLeadingShapes: [],
  recentResponses: [],
  largestResponses: [],
  rendererInventory: new Map(),
  signalInventory: new Map(),
  responseShapeCounts: new Map(),
  timeline: [],
  adPlaybackEvents: [],
  entityEvents: [],
  lastPlayerResponse: null
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

function splitKeyTokens(key) {
  return String(key)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function isDevSignalKey(key) {
  const tokens = splitKeyTokens(key);
  return tokens.some((token) => DEV_SIGNAL_TOKENS.has(token));
}

function cloneSummary(summary) {
  if (!summary) return null;
  return {
    sequence: summary.sequence,
    observedAt: summary.observedAt,
    sourceChars: summary.sourceChars,
    topKeys: [...summary.topKeys]
  };
}

function cloneProfile(profile) {
  return {
    sequence: profile.sequence,
    observedAt: profile.observedAt,
    sourceChars: profile.sourceChars,
    topKeys: [...profile.topKeys],
    shapeSignature: profile.shapeSignature,
    renderers: profile.renderers.map((entry) => ({ ...entry })),
    signals: profile.signals.map((entry) => ({
      ...entry,
      nearbyKeys: [...entry.nearbyKeys],
      details: [...entry.details]
    })),
    hints: profile.hints.map((entry) => ({ ...entry })),
    arrays: profile.arrays.map((entry) => ({ ...entry })),
    visitedNodes: profile.visitedNodes,
    scanTruncated: profile.scanTruncated
  };
}

function valueKind(value) {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

function sanitizeScalarHint(key, value) {
  if (!DEV_HINT_KEYS.has(key) || DEV_SENSITIVE_HINT_KEY_PATTERN.test(key)) {
    return null;
  }

  if (typeof value === 'boolean' || typeof value === 'number') {
    return String(value);
  }

  if (typeof value !== 'string') return null;

  const compact = value.replace(/\s+/g, ' ').trim();
  if (!compact) return null;
  return compact.length <= 90 ? compact : `${compact.slice(0, 87)}…`;
}

function collectLocalSignalDetails(value) {
  if (!isObjectRecord(value)) return [];

  const details = [];
  const keys = Object.keys(value);
  for (let i = 0; i < keys.length && details.length < 4; i += 1) {
    const key = keys[i];
    const scalar = sanitizeScalarHint(key, value[key]);
    if (scalar !== null) details.push(`${key}=${scalar}`);
  }
  return details;
}

function updateInventory(map, limit, key, path, sequence, extra = {}) {
  const existing = map.get(key);
  if (existing) {
    existing.count += 1;
    existing.lastPath = path;
    existing.lastSequence = sequence;
    Object.assign(existing, extra);
    return;
  }

  if (map.size >= limit) return;
  map.set(key, {
    key,
    count: 1,
    lastPath: path,
    lastSequence: sequence,
    ...extra
  });
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
      if (DEV_RENDERER_KEY_PATTERN.test(key) && !seen.has(key)) {
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

function shouldProfileResponse(root, serializedText) {
  if (!isObject(root)) return false;

  const sourceChars = typeof serializedText === 'string' ? serializedText.length : 0;
  if (sourceChars >= DEV_PROFILE_MIN_CHARS) return true;

  if (isObjectRecord(root)) {
    const topKeys = Object.keys(root);
    if (topKeys.some((key) => DEV_STRUCTURED_ROOT_KEYS.has(key))) return true;
  }

  return (
    typeof serializedText === 'string' &&
    DEV_PROFILE_TEXT_PATTERN.test(serializedText)
  );
}

function updateShapeInventory(profile) {
  const key = profile.shapeSignature || '(no top-level keys)';
  const existing = devDiagnostics.responseShapeCounts.get(key);
  if (existing) {
    existing.count += 1;
    existing.lastSequence = profile.sequence;
    return;
  }

  if (devDiagnostics.responseShapeCounts.size >= DEV_SHAPE_INVENTORY_LIMIT) {
    return;
  }

  devDiagnostics.responseShapeCounts.set(key, {
    signature: key,
    count: 1,
    lastSequence: profile.sequence
  });
}

function storeProfile(profile) {
  devDiagnostics.profiledResponses += 1;
  devDiagnostics.recentResponses.push(profile);
  if (devDiagnostics.recentResponses.length > DEV_RECENT_RESPONSE_LIMIT) {
    devDiagnostics.recentResponses.shift();
  }

  devDiagnostics.largestResponses.push(profile);
  devDiagnostics.largestResponses.sort((a, b) => {
    if (b.sourceChars !== a.sourceChars) return b.sourceChars - a.sourceChars;
    return b.sequence - a.sequence;
  });
  if (devDiagnostics.largestResponses.length > DEV_LARGEST_RESPONSE_LIMIT) {
    devDiagnostics.largestResponses.length = DEV_LARGEST_RESPONSE_LIMIT;
  }

  updateShapeInventory(profile);
}

function profileResponse(root, serializedText, sequence, observedAt) {
  const sourceChars = typeof serializedText === 'string' ? serializedText.length : 0;
  devDiagnostics.largestObservedChars = Math.max(
    devDiagnostics.largestObservedChars,
    sourceChars
  );

  const topKeys = Array.isArray(root)
    ? [`[array length ${root.length}]`]
    : Object.keys(root).slice(0, 14);
  const profile = {
    sequence,
    observedAt,
    sourceChars,
    topKeys,
    shapeSignature: topKeys.slice(0, 7).join(', '),
    renderers: [],
    signals: [],
    hints: [],
    arrays: [],
    visitedNodes: 0,
    scanTruncated: false
  };

  const seenRenderers = new Set();
  const seenSignals = new Set();
  const seenHints = new Set();
  const seenArrays = new Set();
  const stack = [{ value: root, path: '$', depth: 0 }];

  while (stack.length > 0 && profile.visitedNodes < DEV_PROFILE_MAX_VISITED_NODES) {
    const current = stack.pop();
    const node = current.value;
    if (!isObject(node) || current.depth > DEV_PROFILE_MAX_DEPTH) continue;

    profile.visitedNodes += 1;

    if (Array.isArray(node)) {
      if (
        node.length > 1 &&
        profile.arrays.length < DEV_ARRAYS_PER_RESPONSE &&
        !seenArrays.has(current.path)
      ) {
        seenArrays.add(current.path);
        profile.arrays.push({ path: current.path, length: node.length });
      }

      const max = Math.min(node.length, DEV_PROFILE_MAX_ARRAY_ITEMS);
      for (let i = max - 1; i >= 0; i -= 1) {
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
      const child = node[key];
      const path = formatPath(current.path, key);

      if (DEV_RENDERER_KEY_PATTERN.test(key)) {
        updateInventory(
          devDiagnostics.rendererInventory,
          DEV_RENDERER_INVENTORY_LIMIT,
          key,
          path,
          sequence
        );
        if (
          profile.renderers.length < DEV_RENDERERS_PER_RESPONSE &&
          !seenRenderers.has(key)
        ) {
          seenRenderers.add(key);
          profile.renderers.push({ key, path });
        }
      }

      if (isDevSignalKey(key)) {
        const details = collectLocalSignalDetails(child);
        updateInventory(
          devDiagnostics.signalInventory,
          DEV_SIGNAL_INVENTORY_LIMIT,
          key,
          path,
          sequence,
          { valueKind: valueKind(child), details }
        );

        const signalIdentity = `${key}\n${path}`;
        if (
          profile.signals.length < DEV_SIGNALS_PER_RESPONSE &&
          !seenSignals.has(signalIdentity)
        ) {
          seenSignals.add(signalIdentity);
          profile.signals.push({
            key,
            path,
            valueKind: valueKind(child),
            nearbyKeys: keys.filter((candidate) => candidate !== key).slice(0, 7),
            details
          });
        }
      }

      if (profile.hints.length < DEV_HINTS_PER_RESPONSE) {
        const scalar = sanitizeScalarHint(key, child);
        const hintIdentity = `${key}\n${scalar}`;
        if (scalar !== null && !seenHints.has(hintIdentity)) {
          seenHints.add(hintIdentity);
          profile.hints.push({ key, value: scalar, path });
        }
      }

      if (isObject(child) && current.depth < DEV_PROFILE_MAX_DEPTH) {
        stack.push({ value: child, path, depth: current.depth + 1 });
      }
    }
  }

  profile.scanTruncated = stack.length > 0;
  storeProfile(profile);
}

function responseSummary(root, serializedText, sequence, observedAt) {
  return {
    sequence,
    observedAt,
    sourceChars: typeof serializedText === 'string' ? serializedText.length : 0,
    topKeys: Array.isArray(root)
      ? [`[array length ${root.length}]`]
      : isObjectRecord(root)
        ? Object.keys(root).slice(0, 12)
        : []
  };
}

function isPlayerResponse(root) {
  if (!isObjectRecord(root)) return false;
  return Boolean(
    root.playabilityStatus &&
      root.streamingData &&
      (root.playerConfig || root.videoDetails || root.playbackTracking)
  );
}

function appendFollowingSummary(summary) {
  devDiagnostics.adPlaybackEvents.forEach((event) => {
    if (
      event.sequence < summary.sequence &&
      event.after.length < DEV_EVENT_NEIGHBOR_COUNT
    ) {
      event.after.push(cloneSummary(summary));
    }
  });
}

function findExactAdPlaybackBooleans(root) {
  const results = [];
  if (!isObject(root)) return results;

  const stack = [{ value: root, path: '$', depth: 0 }];
  let visited = 0;

  while (
    stack.length > 0 &&
    visited < DEV_EXACT_SCAN_MAX_VISITED_NODES &&
    results.length < 8
  ) {
    const current = stack.pop();
    const node = current.value;
    if (!isObject(node) || current.depth > DEV_EXACT_SCAN_MAX_DEPTH) continue;
    visited += 1;

    if (Array.isArray(node)) {
      const max = Math.min(node.length, DEV_PROFILE_MAX_ARRAY_ITEMS);
      for (let i = max - 1; i >= 0; i -= 1) {
        if (isObject(node[i])) {
          stack.push({
            value: node[i],
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
      const child = node[key];
      const path = formatPath(current.path, key);
      if (key === 'isAdPlayback' && typeof child === 'boolean') {
        results.push({ path, value: child });
      }
      if (isObject(child) && current.depth < DEV_EXACT_SCAN_MAX_DEPTH) {
        stack.push({ value: child, path, depth: current.depth + 1 });
      }
    }
  }

  return results;
}

function collectEntityPayloadEvents(root) {
  const results = [];
  if (!isObject(root)) return results;

  const stack = [{ value: root, path: '$', depth: 0 }];
  let visited = 0;

  while (
    stack.length > 0 &&
    visited < DEV_EXACT_SCAN_MAX_VISITED_NODES &&
    results.length < 12
  ) {
    const current = stack.pop();
    const node = current.value;
    if (!isObject(node) || current.depth > DEV_EXACT_SCAN_MAX_DEPTH) continue;
    visited += 1;

    if (Array.isArray(node)) {
      const max = Math.min(node.length, DEV_PROFILE_MAX_ARRAY_ITEMS);
      for (let i = max - 1; i >= 0; i -= 1) {
        if (isObject(node[i])) {
          stack.push({
            value: node[i],
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
      const child = node[key];
      const path = formatPath(current.path, key);

      if (key === 'payload' && isObjectRecord(child)) {
        const payloadKeys = Object.keys(child);
        for (let j = 0; j < payloadKeys.length && results.length < 12; j += 1) {
          const payloadKey = payloadKeys[j];
          const payloadValue = child[payloadKey];
          if (/Entity$/.test(payloadKey) && isObject(payloadValue)) {
            results.push({
              key: payloadKey,
              path: formatPath(path, payloadKey),
              valueKind: valueKind(payloadValue),
              details: collectLocalSignalDetails(payloadValue)
            });
          }
        }
      }

      if (isObject(child) && current.depth < DEV_EXACT_SCAN_MAX_DEPTH) {
        stack.push({ value: child, path, depth: current.depth + 1 });
      }
    }
  }

  return results;
}

function recordTargetedEvents(root, summary) {
  const adPlaybackOccurrences = findExactAdPlaybackBooleans(root);
  adPlaybackOccurrences.forEach((occurrence) => {
    devDiagnostics.adPlaybackEvents.push({
      sequence: summary.sequence,
      observedAt: summary.observedAt,
      sourceChars: summary.sourceChars,
      path: occurrence.path,
      value: occurrence.value,
      topKeys: [...summary.topKeys],
      before: devDiagnostics.timeline
        .slice(-DEV_EVENT_NEIGHBOR_COUNT)
        .map(cloneSummary),
      after: [],
      nearestPlayerResponse: cloneSummary(devDiagnostics.lastPlayerResponse)
    });
  });
  if (devDiagnostics.adPlaybackEvents.length > DEV_AD_EVENT_LIMIT) {
    devDiagnostics.adPlaybackEvents.splice(
      0,
      devDiagnostics.adPlaybackEvents.length - DEV_AD_EVENT_LIMIT
    );
  }

  const entities = collectEntityPayloadEvents(root);
  entities.forEach((entity) => {
    const latestAdEvent =
      devDiagnostics.adPlaybackEvents.length > 0
        ? devDiagnostics.adPlaybackEvents[devDiagnostics.adPlaybackEvents.length - 1]
        : null;
    devDiagnostics.entityEvents.push({
      sequence: summary.sequence,
      observedAt: summary.observedAt,
      sourceChars: summary.sourceChars,
      key: entity.key,
      path: entity.path,
      valueKind: entity.valueKind,
      details: [...entity.details],
      topKeys: [...summary.topKeys],
      latestAdPlayback: latestAdEvent
        ? {
            sequence: latestAdEvent.sequence,
            value: latestAdEvent.value
          }
        : null
    });
  });
  if (devDiagnostics.entityEvents.length > DEV_ENTITY_EVENT_LIMIT) {
    devDiagnostics.entityEvents.splice(
      0,
      devDiagnostics.entityEvents.length - DEV_ENTITY_EVENT_LIMIT
    );
  }
}

function observeDevDiagnostics(root, serializedText) {
  devDiagnostics.parsedResponses += 1;
  devDiagnostics.sequence += 1;
  const sequence = devDiagnostics.sequence;
  const observedAt = new Date().toISOString();
  devDiagnostics.lastObservedAt = observedAt;

  const summary = responseSummary(root, serializedText, sequence, observedAt);
  devDiagnostics.largestObservedChars = Math.max(
    devDiagnostics.largestObservedChars,
    summary.sourceChars
  );

  appendFollowingSummary(summary);

  if (
    typeof serializedText === 'string' &&
    hasSponsoredFeedMarker(serializedText)
  ) {
    devDiagnostics.knownMarkerResponses += 1;
  }

  updateHomeLeadingShapes(root);

  if (shouldProfileResponse(root, serializedText)) {
    profileResponse(root, serializedText, sequence, observedAt);
  }

  recordTargetedEvents(root, summary);

  if (isPlayerResponse(root)) {
    devDiagnostics.lastPlayerResponse = cloneSummary(summary);
  }

  devDiagnostics.timeline.push(cloneSummary(summary));
  if (devDiagnostics.timeline.length > DEV_TIMELINE_LIMIT) {
    devDiagnostics.timeline.shift();
  }
}

function cloneInventory(map, limit) {
  return Array.from(map.values())
    .sort((a, b) => b.lastSequence - a.lastSequence || b.count - a.count)
    .slice(0, limit)
    .map((entry) => ({
      ...entry,
      details: Array.isArray(entry.details) ? [...entry.details] : undefined
    }));
}

export function getFeedAdDiagnosticsSnapshot() {
  return {
    parsedResponses: devDiagnostics.parsedResponses,
    profiledResponses: devDiagnostics.profiledResponses,
    homeResponses: devDiagnostics.homeResponses,
    knownMarkerResponses: devDiagnostics.knownMarkerResponses,
    removedFeedRenderers: devDiagnostics.removedFeedRenderers,
    lastObservedAt: devDiagnostics.lastObservedAt,
    largestObservedChars: devDiagnostics.largestObservedChars,
    homeLeadingShapes: devDiagnostics.homeLeadingShapes.map((entry) => ({
      index: entry.index,
      renderers: [...entry.renderers]
    })),
    recentResponses: devDiagnostics.recentResponses.map(cloneProfile),
    largestResponses: devDiagnostics.largestResponses.map(cloneProfile),
    rendererInventory: cloneInventory(devDiagnostics.rendererInventory, 48),
    signalInventory: cloneInventory(devDiagnostics.signalInventory, 40),
    responseShapeCounts: Array.from(devDiagnostics.responseShapeCounts.values())
      .sort((a, b) => b.count - a.count || b.lastSequence - a.lastSequence)
      .slice(0, 16)
      .map((entry) => ({ ...entry })),
    adPlaybackEvents: devDiagnostics.adPlaybackEvents.map((event) => ({
      ...event,
      topKeys: [...event.topKeys],
      before: event.before.map(cloneSummary),
      after: event.after.map(cloneSummary),
      nearestPlayerResponse: cloneSummary(event.nearestPlayerResponse)
    })),
    entityEvents: devDiagnostics.entityEvents.map((event) => ({
      ...event,
      details: [...event.details],
      topKeys: [...event.topKeys],
      latestAdPlayback: event.latestAdPlayback
        ? { ...event.latestAdPlayback }
        : null
    })),
    lastPlayerResponse: cloneSummary(devDiagnostics.lastPlayerResponse)
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
 * Unknown ad-looking schemas are only observed by DEV diagnostics; they are not
 * removed unless they match the known renderer allowlist above.
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
