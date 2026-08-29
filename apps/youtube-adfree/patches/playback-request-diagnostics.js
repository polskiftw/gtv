const RECENT_PLAYBACK_REQUEST_LIMIT = 12;

const playbackRequestDiagnostics = {
  serializations: 0,
  playbackCandidates: 0,
  patchesApplied: 0,
  serializedConfirmed: 0,
  lastObservedAt: null,
  recentRequests: []
};

function safeState(value) {
  if (value === 'missing' || value === 'true' || value === 'false' || value === 'accessor') {
    return value;
  }
  return 'other';
}

export function recordPlaybackRequestSerialization(details) {
  playbackRequestDiagnostics.serializations += 1;
  playbackRequestDiagnostics.playbackCandidates += 1;
  if (details.patchApplied) playbackRequestDiagnostics.patchesApplied += 1;
  if (details.serializedConfirmed) playbackRequestDiagnostics.serializedConfirmed += 1;

  const observedAt = new Date().toISOString();
  playbackRequestDiagnostics.lastObservedAt = observedAt;
  playbackRequestDiagnostics.recentRequests.push({
    sequence: playbackRequestDiagnostics.playbackCandidates,
    observedAt,
    rootKeys: Array.isArray(details.rootKeys) ? details.rootKeys.slice(0, 12) : [],
    contentKeys: Array.isArray(details.contentKeys) ? details.contentKeys.slice(0, 12) : [],
    flagBefore: safeState(details.flagBefore),
    patchApplied: Boolean(details.patchApplied),
    flagAfter: safeState(details.flagAfter),
    serializedConfirmed: Boolean(details.serializedConfirmed),
    serializedChars: Number.isFinite(details.serializedChars) ? details.serializedChars : 0
  });

  if (playbackRequestDiagnostics.recentRequests.length > RECENT_PLAYBACK_REQUEST_LIMIT) {
    playbackRequestDiagnostics.recentRequests.shift();
  }
}

export function getPlaybackRequestDiagnosticsSnapshot() {
  return {
    serializations: playbackRequestDiagnostics.serializations,
    playbackCandidates: playbackRequestDiagnostics.playbackCandidates,
    patchesApplied: playbackRequestDiagnostics.patchesApplied,
    serializedConfirmed: playbackRequestDiagnostics.serializedConfirmed,
    lastObservedAt: playbackRequestDiagnostics.lastObservedAt,
    recentRequests: playbackRequestDiagnostics.recentRequests.map((entry) => ({
      ...entry,
      rootKeys: [...entry.rootKeys],
      contentKeys: [...entry.contentKeys]
    }))
  };
}
