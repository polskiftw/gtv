import { recordPlaybackRequestSerialization } from '../playback-request-diagnostics.js';

type JsonRecord = Record<string, unknown>;
type FunctionReplacer = (this: unknown, key: string, value: unknown) => unknown;
type WhitelistReplacer = (string | number)[] | null;

const INLINE_PLAYBACK_NO_AD_KEY = 'isInlinePlaybackNoAd';
const SERIALIZED_INLINE_NO_AD = '"isInlinePlaybackNoAd":true';

function isObjectRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPlainRecord(value: unknown): value is JsonRecord {
  if (!isObjectRecord(value)) return false;

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function getOwnDataProperty(value: unknown, key: string): unknown {
  if (!isObjectRecord(value)) return null;

  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
    return null;
  }

  return descriptor.value;
}

function ownFlagState(value: unknown, key: string): string {
  if (!isObjectRecord(value)) return 'missing';
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor) return 'missing';
  if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) return 'accessor';
  if (descriptor.value === true) return 'true';
  if (descriptor.value === false) return 'false';
  return 'other';
}

function inspectPlaybackRequest(value: unknown) {
  if (!isPlainRecord(value)) return null;
  const playbackContext = getOwnDataProperty(value, 'playbackContext');
  if (!isPlainRecord(playbackContext)) return null;
  const contentPlaybackContext = getOwnDataProperty(
    playbackContext,
    'contentPlaybackContext'
  );
  if (!isPlainRecord(contentPlaybackContext)) return null;

  return {
    rootKeys: Object.keys(value).slice(0, 12),
    contentKeys: Object.keys(contentPlaybackContext).slice(0, 12),
    flagBefore: ownFlagState(contentPlaybackContext, INLINE_PLAYBACK_NO_AD_KEY)
  };
}

function cloneRecordWithProperty(
  source: JsonRecord,
  key: string,
  replacement: unknown,
  forceEnumerable: boolean
): JsonRecord {
  const clone = Object.create(Object.getPrototypeOf(source)) as JsonRecord;
  const names = Object.getOwnPropertyNames(source);
  let replaced = false;

  names.forEach((name) => {
    const descriptor = Object.getOwnPropertyDescriptor(source, name);
    if (!descriptor) return;

    if (name === key) {
      Object.defineProperty(clone, name, {
        value: replacement,
        enumerable: forceEnumerable ? true : Boolean(descriptor.enumerable),
        configurable: Boolean(descriptor.configurable),
        writable: Object.prototype.hasOwnProperty.call(descriptor, 'writable')
          ? Boolean(descriptor.writable)
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

// Preserve upstream's request-side isInlinePlaybackNoAd behavior without its
// broad structuredClone of every non-primitive JSON.stringify input. The
// actual QR/Shop response filtering lives in playback-overlay-filter.js.
function ensureInlinePlaybackNoAd(value: unknown): unknown {
  try {
    const playbackContext = getOwnDataProperty(value, 'playbackContext');
    if (!isPlainRecord(playbackContext) || !isPlainRecord(value)) return value;

    const contentPlaybackContext = getOwnDataProperty(
      playbackContext,
      'contentPlaybackContext'
    );
    if (!isPlainRecord(contentPlaybackContext)) return value;

    if (getOwnDataProperty(contentPlaybackContext, INLINE_PLAYBACK_NO_AD_KEY) === true) {
      return value;
    }

    const patchedContentPlaybackContext = cloneRecordWithProperty(
      contentPlaybackContext,
      INLINE_PLAYBACK_NO_AD_KEY,
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

function flagStateAfterPatch(value: unknown): string {
  const playbackContext = getOwnDataProperty(value, 'playbackContext');
  const contentPlaybackContext = getOwnDataProperty(
    playbackContext,
    'contentPlaybackContext'
  );
  return ownFlagState(contentPlaybackContext, INLINE_PLAYBACK_NO_AD_KEY);
}

const originalStringify = JSON.stringify;

function stringify(
  value: unknown,
  replacer?: FunctionReplacer | WhitelistReplacer,
  space?: string | number
): string {
  const requestInspection = inspectPlaybackRequest(value);
  const patchedValue = ensureInlinePlaybackNoAd(value);
  if (patchedValue !== value) {
    console.info('[JSON.stringify] Applied inline playback no-ad flag');
  }

  const serialized = originalStringify(patchedValue, replacer as never, space);

  if (requestInspection) {
    recordPlaybackRequestSerialization({
      ...requestInspection,
      patchApplied: patchedValue !== value,
      flagAfter: flagStateAfterPatch(patchedValue),
      serializedConfirmed:
        typeof serialized === 'string' && serialized.includes(SERIALIZED_INLINE_NO_AD),
      serializedChars: typeof serialized === 'string' ? serialized.length : 0
    });
  }

  return serialized;
}

JSON.stringify = stringify;
