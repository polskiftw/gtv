const AD_HIDE_CLASS = 'gtv-ytaf-ad-skip-active';
const AD_HIDE_STYLE_ID = 'gtv-ytaf-ad-skip-style';
const RETRY_INTERVAL_MS = 50;
const RETRY_WINDOW_MS = 2500;
const HIDE_FAILSAFE_MS = 3000;
const POST_SKIP_HIDE_MS = 900;

let generation = 0;

const diagnostics = {
  adPlaybackEvents: 0,
  adPlaybackTrueEvents: 0,
  adPlaybackFalseEvents: 0,
  skipAttempts: 0,
  playerSeekSuccesses: 0,
  videoSeekSuccesses: 0,
  skipTimeouts: 0,
  lastResult: 'none',
  lastObservedAt: null
};

function safeSetTimeout(callback, delay) {
  const timer = setTimeout(callback, delay);
  if (timer && typeof timer.unref === 'function') timer.unref();
  return timer;
}

function ensureHideStyle() {
  if (typeof document === 'undefined') return;
  if (document.getElementById?.(AD_HIDE_STYLE_ID)) return;

  const style = document.createElement?.('style');
  if (!style) return;

  style.id = AD_HIDE_STYLE_ID;
  style.textContent = [
    `html.${AD_HIDE_CLASS} .html5-video-player`,
    `html.${AD_HIDE_CLASS} #movie_player`
  ].join(',') + '{visibility:hidden!important;opacity:0!important;}';

  const target = document.head || document.documentElement;
  target?.appendChild?.(style);
}

function setAdVisualSuppressed(suppressed) {
  if (typeof document === 'undefined') return;
  ensureHideStyle();
  document.documentElement?.classList?.toggle(AD_HIDE_CLASS, Boolean(suppressed));
}

function finitePositive(value) {
  return Number.isFinite(value) && value > 0 ? value : null;
}

function getPlayerDuration(player) {
  try {
    if (typeof player?.getProgressState === 'function') {
      const progress = player.getProgressState();
      const duration = finitePositive(Number(progress?.duration));
      if (duration !== null) return duration;
    }
  } catch (_error) {
    // Try the next available player surface.
  }

  try {
    if (typeof player?.getDuration === 'function') {
      const duration = finitePositive(Number(player.getDuration()));
      if (duration !== null) return duration;
    }
  } catch (_error) {
    // Fall back to the underlying HTMLVideoElement.
  }

  return null;
}

function findVideoElement(player) {
  try {
    const nested = player?.querySelector?.('video.html5-main-video, video');
    if (nested) return nested;
  } catch (_error) {
    // Fall through to the document-level lookup.
  }

  try {
    return document?.querySelector?.('video.html5-main-video, video') || null;
  } catch (_error) {
    return null;
  }
}

export function trySkipAdPlayer(player) {
  if (!player) return 'player-missing';

  const duration = getPlayerDuration(player);
  if (duration !== null && typeof player.seekTo === 'function') {
    try {
      // This mirrors the current uBlock server-side-ad fallback: the ad is a
      // separate playable item, so seeking to that item's duration ends it.
      player.seekTo(duration);
      return 'player-seek';
    } catch (_error) {
      // Fall back to the underlying video element below.
    }
  }

  const video = findVideoElement(player);
  if (video) {
    const videoDuration = finitePositive(Number(video.duration));
    if (videoDuration !== null) {
      try {
        video.currentTime = videoDuration;
        return 'video-seek';
      } catch (_error) {
        return 'video-seek-failed';
      }
    }
  }

  return duration === null ? 'duration-unavailable' : 'seek-api-missing';
}

function findPlayer() {
  if (typeof document === 'undefined') return null;

  try {
    return (
      document.querySelector?.('.html5-video-player') ||
      document.querySelector?.('#movie_player') ||
      null
    );
  } catch (_error) {
    return null;
  }
}

function attemptSkip(token, deadline) {
  if (token !== generation) return;

  diagnostics.skipAttempts += 1;
  const result = trySkipAdPlayer(findPlayer());
  diagnostics.lastResult = result;
  diagnostics.lastObservedAt = new Date().toISOString();

  if (result === 'player-seek' || result === 'video-seek') {
    if (result === 'player-seek') diagnostics.playerSeekSuccesses += 1;
    else diagnostics.videoSeekSuccesses += 1;

    console.info(`[adblock] Server-side ad skip succeeded via ${result}`);
    safeSetTimeout(() => {
      if (token === generation) setAdVisualSuppressed(false);
    }, POST_SKIP_HIDE_MS);
    return;
  }

  if (Date.now() < deadline) {
    safeSetTimeout(() => attemptSkip(token, deadline), RETRY_INTERVAL_MS);
    return;
  }

  diagnostics.skipTimeouts += 1;
  diagnostics.lastResult = `timeout:${result}`;
  console.info(`[adblock] Server-side ad skip timed out (${result})`);
  setAdVisualSuppressed(false);
}

/**
 * Observe the tiny response that YouTube emits when ad playback state changes.
 * Unlike revision 7, this never mutates isAdPlayback. A true value is used as a
 * high-confidence trigger to hide the player briefly and seek the current ad
 * item to its end.
 *
 * @param {unknown} root parsed response object
 * @returns {boolean} whether an exact top-level ad-playback state was observed
 */
export function handleAdPlaybackResponse(root) {
  if (
    typeof root !== 'object' ||
    root === null ||
    Array.isArray(root) ||
    typeof root.isAdPlayback !== 'boolean'
  ) {
    return false;
  }

  diagnostics.adPlaybackEvents += 1;
  diagnostics.lastObservedAt = new Date().toISOString();

  if (root.isAdPlayback === false) {
    diagnostics.adPlaybackFalseEvents += 1;
    diagnostics.lastResult = 'ad-playback-false';
    generation += 1;
    setAdVisualSuppressed(false);
    return true;
  }

  diagnostics.adPlaybackTrueEvents += 1;
  diagnostics.lastResult = 'scheduled';
  generation += 1;
  const token = generation;

  setAdVisualSuppressed(true);
  safeSetTimeout(
    () => {
      if (token === generation) setAdVisualSuppressed(false);
    },
    HIDE_FAILSAFE_MS
  );
  safeSetTimeout(() => attemptSkip(token, Date.now() + RETRY_WINDOW_MS), 0);
  return true;
}

export function getSsaiAdSkipDiagnosticsSnapshot() {
  return { ...diagnostics };
}
