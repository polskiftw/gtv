// YouTube TV Shorts signatures observed in current webOS/TV Innertube responses.
export const SHORTS_SIGNATURES = Object.freeze({
  shelfType: 'TVHTML5_SHELF_RENDERER_TYPE_SHORTS',
  tileStyle: 'TILE_STYLE_YTLR_SHORTS',
  contentType: 'TILE_CONTENT_TYPE_SHORTS'
});

const SHORTS_DIAGNOSTIC_RECENT_LIMIT = 12;
const SHORTS_DIAGNOSTIC_INVENTORY_LIMIT = 48;
const SHORTS_DIAGNOSTIC_SCAN_DEPTH = 4;
const SHORTS_DIAGNOSTIC_SCAN_NODES = 96;
const SHORTS_DIAGNOSTIC_CLUES_PER_ITEM = 8;
const SHORTS_SIGNAL_PATTERN = /(short|reel)/i;
const SHORTS_SAFE_SCALAR_KEYS = new Set([
  'style',
  'contentType',
  'tvhtml5ShelfRendererType',
  'type',
  'targetId',
  'browseId'
]);

const shortsDiagnostics = {
  responsesScanned: 0,
  removedKnown: 0,
  suspiciousSurvivors: 0,
  lastObservedAt: null,
  recentSurvivors: [],
  signalInventory: new Map()
};

function isObject(value) {
  return value !== null && typeof value === 'object';
}

function objectPath(parent, key) {
  return parent === '$' ? `$.${key}` : `${parent}.${key}`;
}

function arrayPath(parent, index) {
  return `${parent}[${index}]`;
}

function addShortsSignal(clues, clue) {
  if (clues.length >= SHORTS_DIAGNOSTIC_CLUES_PER_ITEM || clues.includes(clue)) return;
  clues.push(clue);
}

function recordInventory(clue, path) {
  const existing = shortsDiagnostics.signalInventory.get(clue);
  if (existing) {
    existing.count += 1;
    existing.lastPath = path;
    return;
  }
  if (shortsDiagnostics.signalInventory.size >= SHORTS_DIAGNOSTIC_INVENTORY_LIMIT) return;
  shortsDiagnostics.signalInventory.set(clue, { clue, count: 1, lastPath: path });
}

// Scan only object wrappers inside a surviving array entry. Nested arrays are
// intentionally left to the main traversal so a Shorts-looking child does not
// make a normal containing shelf disappear. Values retained here are limited to
// schema-ish allowlisted fields; arbitrary titles, URLs, tokens and tracking data
// are never stored by diagnostics.
function collectSurvivorClues(item) {
  if (!isObject(item) || Array.isArray(item)) return [];

  const clues = [];
  const stack = [{ value: item, depth: 0 }];
  let visited = 0;

  while (stack.length > 0 && visited < SHORTS_DIAGNOSTIC_SCAN_NODES) {
    const current = stack.pop();
    if (!isObject(current.value) || Array.isArray(current.value)) continue;
    visited += 1;

    const keys = Object.keys(current.value);
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      const child = current.value[key];

      if (SHORTS_SIGNAL_PATTERN.test(key)) {
        addShortsSignal(clues, `key:${key}`);
      }

      if (
        SHORTS_SAFE_SCALAR_KEYS.has(key) &&
        typeof child === 'string' &&
        SHORTS_SIGNAL_PATTERN.test(child)
      ) {
        const compact = child.replace(/\s+/g, ' ').trim();
        addShortsSignal(clues, `${key}=${compact.slice(0, 96)}`);
      }

      if (
        isObject(child) &&
        !Array.isArray(child) &&
        current.depth < SHORTS_DIAGNOSTIC_SCAN_DEPTH
      ) {
        stack.push({ value: child, depth: current.depth + 1 });
      }
    }
  }

  return clues;
}

function recordSuspiciousSurvivor(item, path) {
  const clues = collectSurvivorClues(item);
  if (clues.length === 0) return;

  shortsDiagnostics.suspiciousSurvivors += 1;
  const entry = {
    path,
    topKeys: Object.keys(item).slice(0, 10),
    clues
  };
  shortsDiagnostics.recentSurvivors.push(entry);
  if (shortsDiagnostics.recentSurvivors.length > SHORTS_DIAGNOSTIC_RECENT_LIMIT) {
    shortsDiagnostics.recentSurvivors.shift();
  }
  clues.forEach((clue) => recordInventory(clue, path));
}

// Classify only the array entry itself (and its direct renderer). This is
// intentionally conservative: a nested metadata reference to a reel endpoint
// must not cause a normal containing item to disappear.
export function isShortsEntry(item) {
  if (!isObject(item)) return false;

  const shelf = item.shelfRenderer;
  if (shelf?.tvhtml5ShelfRendererType === SHORTS_SIGNATURES.shelfType) {
    return true;
  }

  const tile = item.tileRenderer;
  if (
    isObject(tile) &&
    (tile.style === SHORTS_SIGNATURES.tileStyle ||
      tile.contentType === SHORTS_SIGNATURES.contentType ||
      tile.onSelectCommand?.reelWatchEndpoint != null)
  ) {
    return true;
  }

  return Boolean(
    item.reelItemRenderer ||
      item.contentType === SHORTS_SIGNATURES.contentType ||
      item.onSelectCommand?.reelWatchEndpoint != null
  );
}

// JSON.parse produces an acyclic object graph, so an iterative walk is enough
// and avoids recursion-depth failures on unusually deep YouTube responses.
// Every array is compacted in place; surviving objects are then traversed so
// nested shelves/grids/continuations are covered without hard-coding one page.
export function removeShortsEverywhere(root) {
  if (!isObject(root)) return 0;

  shortsDiagnostics.responsesScanned += 1;
  shortsDiagnostics.lastObservedAt = new Date().toISOString();

  const stack = [{ value: root, path: '$' }];
  let removed = 0;

  while (stack.length > 0) {
    const current = stack.pop();
    const node = current.value;

    if (Array.isArray(node)) {
      let writeIndex = 0;
      for (let readIndex = 0; readIndex < node.length; readIndex += 1) {
        const value = node[readIndex];
        const path = arrayPath(current.path, readIndex);
        if (isShortsEntry(value)) {
          removed += 1;
          continue;
        }

        recordSuspiciousSurvivor(value, path);
        node[writeIndex] = value;
        writeIndex += 1;
        if (isObject(value)) stack.push({ value, path });
      }
      node.length = writeIndex;
      continue;
    }

    const keys = Object.keys(node);
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      const value = node[key];
      if (isObject(value)) {
        stack.push({ value, path: objectPath(current.path, key) });
      }
    }
  }

  shortsDiagnostics.removedKnown += removed;
  return removed;
}

export function getShortsDiagnosticsSnapshot() {
  return {
    responsesScanned: shortsDiagnostics.responsesScanned,
    removedKnown: shortsDiagnostics.removedKnown,
    suspiciousSurvivors: shortsDiagnostics.suspiciousSurvivors,
    lastObservedAt: shortsDiagnostics.lastObservedAt,
    recentSurvivors: shortsDiagnostics.recentSurvivors.map((entry) => ({
      path: entry.path,
      topKeys: [...entry.topKeys],
      clues: [...entry.clues]
    })),
    signalInventory: Array.from(shortsDiagnostics.signalInventory.values())
      .sort((a, b) => b.count - a.count || a.clue.localeCompare(b.clue))
      .slice(0, 24)
      .map((entry) => ({ ...entry }))
  };
}
