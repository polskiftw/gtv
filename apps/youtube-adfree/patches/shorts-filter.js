// YouTube TV Shorts signatures observed in current webOS/TV Innertube responses.
export const SHORTS_SIGNATURES = Object.freeze({
  shelfType: 'TVHTML5_SHELF_RENDERER_TYPE_SHORTS',
  tileStyle: 'TILE_STYLE_YTLR_SHORTS',
  contentType: 'TILE_CONTENT_TYPE_SHORTS'
});

function isObject(value) {
  return value !== null && typeof value === 'object';
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

  const stack = [root];
  let removed = 0;

  while (stack.length > 0) {
    const node = stack.pop();

    if (Array.isArray(node)) {
      let writeIndex = 0;
      for (let readIndex = 0; readIndex < node.length; readIndex += 1) {
        const value = node[readIndex];
        if (isShortsEntry(value)) {
          removed += 1;
          continue;
        }

        node[writeIndex] = value;
        writeIndex += 1;
        if (isObject(value)) stack.push(value);
      }
      node.length = writeIndex;
      continue;
    }

    const keys = Object.keys(node);
    for (let index = 0; index < keys.length; index += 1) {
      const value = node[keys[index]];
      if (isObject(value)) stack.push(value);
    }
  }

  return removed;
}
