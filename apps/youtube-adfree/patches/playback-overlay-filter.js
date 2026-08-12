function isRecord(value) {
  return typeof value === 'object' && value !== null;
}

function removeFromPlayerResponse(playerResponse) {
  if (!isRecord(playerResponse)) return 0;

  const overlay = playerResponse?.playerOverlays?.playerOverlayRenderer;
  if (!isRecord(overlay)) return 0;
  if (!Object.prototype.hasOwnProperty.call(overlay, 'timelyActionRenderers')) return 0;

  delete overlay.timelyActionRenderers;
  return 1;
}

// YouTube TV delivers sponsored QR-code and Shop prompts through the timed
// action collection on the player overlay. Keep this intentionally narrow:
// inspect only the canonical player response and its known playerResponse
// wrapper instead of recursively deleting similarly named data elsewhere.
export function removeSponsoredPlaybackOverlays(response) {
  if (!isRecord(response)) return 0;

  let removed = removeFromPlayerResponse(response);
  if (response.playerResponse !== response) {
    removed += removeFromPlayerResponse(response.playerResponse);
  }
  return removed;
}
