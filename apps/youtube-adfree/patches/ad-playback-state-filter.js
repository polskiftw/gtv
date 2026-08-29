const STANDALONE_AD_PLAYBACK_KEYS = new Set([
  'responseContext',
  'trackingParams',
  'isAdPlayback'
]);

function isObjectRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Neutralize the compact YouTube TV ad-playback state response observed on
 * hardware while keeping the response envelope intact.
 *
 * Real captures were exactly:
 *   responseContext + trackingParams + isAdPlayback=true
 *
 * Stay deliberately narrow: do not touch nested isAdPlayback fields, normal
 * player responses, or objects carrying any additional top-level state.
 *
 * @param {unknown} root
 * @returns {boolean} true when a matching response was changed
 */
export function neutralizeStandaloneAdPlayback(root) {
  if (!isObjectRecord(root) || root.isAdPlayback !== true) return false;

  const keys = Object.keys(root);
  if (keys.length !== STANDALONE_AD_PLAYBACK_KEYS.size) return false;
  for (let i = 0; i < keys.length; i += 1) {
    if (!STANDALONE_AD_PLAYBACK_KEYS.has(keys[i])) return false;
  }

  root.isAdPlayback = false;
  return true;
}
