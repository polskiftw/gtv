function isPlainRecord(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function getOwnDataProperty(value, key) {
  if (!isPlainRecord(value)) return null;

  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
    return null;
  }

  return descriptor.value;
}

function cloneRecordWithProperty(source, key, replacement, forceEnumerable) {
  const clone = Object.create(Object.getPrototypeOf(source));
  const names = Object.getOwnPropertyNames(source);
  let replaced = false;

  names.forEach((name) => {
    const descriptor = Object.getOwnPropertyDescriptor(source, name);
    if (!descriptor) return;

    if (name === key) {
      Object.defineProperty(clone, name, {
        value: replacement,
        enumerable: forceEnumerable ? true : descriptor.enumerable,
        configurable: descriptor.configurable,
        writable:
          Object.prototype.hasOwnProperty.call(descriptor, 'writable')
            ? descriptor.writable
            : true
      });
      replaced = true;
      return;
    }

    Object.defineProperty(clone, name, descriptor);
  });

  if (!replaced) {
    Object.defineProperty(clone, key, {
      value: replacement,
      enumerable: true,
      configurable: true,
      writable: true
    });
  }

  return clone;
}

function addInlineNoAdFlag(value) {
  try {
    if (!isPlainRecord(value)) return value;

    const playbackContext = getOwnDataProperty(value, 'playbackContext');
    if (!isPlainRecord(playbackContext)) return value;

    const contentPlaybackContext = getOwnDataProperty(
      playbackContext,
      'contentPlaybackContext'
    );
    if (!isPlainRecord(contentPlaybackContext)) return value;

    const patchedContentPlaybackContext = cloneRecordWithProperty(
      contentPlaybackContext,
      'isInlinePlaybackNoAd',
      true,
      true
    );
    const patchedPlaybackContext = cloneRecordWithProperty(
      playbackContext,
      'contentPlaybackContext',
      patchedContentPlaybackContext,
      false
    );

    return cloneRecordWithProperty(
      value,
      'playbackContext',
      patchedPlaybackContext,
      false
    );
  } catch (_error) {
    // JSON.stringify accepts objects that are not safe to inspect or clone.
    // Preserve native behavior rather than letting the hook create a new failure.
    return value;
  }
}

const originalStringify = JSON.stringify;

function stringify(value, replacer, space) {
  const patchedValue = addInlineNoAdFlag(value);
  if (patchedValue !== value) {
    console.info('[JSON.stringify] Set isInlinePlaybackNoAd');
  }

  return originalStringify(patchedValue, replacer, space);
}

JSON.stringify = stringify;
