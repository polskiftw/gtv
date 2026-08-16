/* global __YTAF_VERSION__ */
import { getFeedAdDiagnosticsSnapshot } from './feed-ad-filter';

const BLUE_CODES = new Set([406, 167, 191]);
const SCROLL_STEP = 160;

function isBlueKey(evt) {
  return BLUE_CODES.has(evt.charCode) || BLUE_CODES.has(evt.keyCode);
}

function formatClock(iso) {
  if (!iso) return 'none yet';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString();
}

function createDiagnosticsPanel() {
  const overlay = document.createElement('div');
  overlay.id = 'gtv-dev-diagnostics';
  overlay.setAttribute('aria-label', 'GTV development diagnostics');
  overlay.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:2147483647',
    'display:none',
    'background:#050505',
    'color:#f5f5f5',
    'font-family:Arial,Helvetica,sans-serif',
    'font-size:28px',
    'line-height:1.35',
    'box-sizing:border-box',
    'padding:48px 64px'
  ].join(';');

  const title = document.createElement('div');
  title.textContent = 'GTV DEV DIAGNOSTICS';
  title.style.cssText =
    'font-size:36px;font-weight:700;margin:0 0 8px 0;letter-spacing:0.03em';

  const help = document.createElement('div');
  help.textContent = 'BLUE or BACK closes  •  ↑/↓ scroll';
  help.style.cssText =
    'font-size:22px;opacity:0.8;margin:0 0 24px 0;padding-bottom:16px;border-bottom:2px solid #555';

  const report = document.createElement('pre');
  report.style.cssText = [
    'white-space:pre-wrap',
    'overflow-wrap:anywhere',
    'word-break:break-word',
    'font:inherit',
    'margin:0',
    'height:calc(100vh - 180px)',
    'overflow-y:auto',
    'overscroll-behavior:contain',
    'padding-right:16px',
    'box-sizing:border-box'
  ].join(';');

  overlay.appendChild(title);
  overlay.appendChild(help);
  overlay.appendChild(report);
  document.body.appendChild(overlay);

  return { overlay, report };
}

const panel = createDiagnosticsPanel();
let visible = false;

function formatSnapshot(snapshot) {
  const lines = [
    `build: v${__YTAF_VERSION__}`,
    `responses scanned: ${snapshot.parsedResponses}`,
    `home responses seen: ${snapshot.homeResponses}`,
    `responses with known ad markers: ${snapshot.knownMarkerResponses}`,
    `feed renderers removed: ${snapshot.removedFeedRenderers}`,
    `last response observed: ${formatClock(snapshot.lastObservedAt)}`,
    '',
    'LATEST HOME LEADING SHAPES'
  ];

  if (snapshot.homeLeadingShapes.length === 0) {
    lines.push('none captured yet');
  } else {
    for (const item of snapshot.homeLeadingShapes) {
      lines.push(`${item.index}. ${item.renderers.join(' > ')}`);
    }
  }

  lines.push('', 'SUSPICIOUS / UNKNOWN KEYS');

  if (snapshot.suspiciousCandidates.length === 0) {
    lines.push('none captured yet');
  } else {
    snapshot.suspiciousCandidates.forEach((candidate, index) => {
      lines.push(`${index + 1}. ${candidate.key}  [seen ${candidate.count}]`);
      lines.push(`   type: ${candidate.valueKind}`);
      lines.push(`   path: ${candidate.path}`);
      lines.push(
        `   nearby: ${
          candidate.nearbyKeys.length
            ? candidate.nearbyKeys.join(', ')
            : '(no sibling keys)'
        }`
      );
    });
  }

  lines.push(
    '',
    'NOTE',
    'Only schema/key names and paths are recorded. Payload values are not shown.'
  );

  return lines.join('\n');
}

function setVisible(nextVisible) {
  if (nextVisible === visible) return;

  visible = nextVisible;
  panel.overlay.style.display = visible ? 'block' : 'none';

  if (visible) {
    panel.report.textContent = formatSnapshot(getFeedAdDiagnosticsSnapshot());
    panel.report.scrollTop = 0;
  }
}

function handleKey(evt) {
  if (isBlueKey(evt)) {
    evt.preventDefault();
    evt.stopPropagation();
    evt.stopImmediatePropagation();

    if (evt.type === 'keydown') {
      setVisible(!visible);
    }
    return false;
  }

  if (!visible) return true;

  if (evt.keyCode === 27) {
    evt.preventDefault();
    evt.stopPropagation();
    evt.stopImmediatePropagation();
    if (evt.type === 'keydown') setVisible(false);
    return false;
  }

  if (evt.keyCode === 38 || evt.keyCode === 40) {
    evt.preventDefault();
    evt.stopPropagation();
    evt.stopImmediatePropagation();

    if (evt.type === 'keydown') {
      panel.report.scrollTop += evt.keyCode === 38 ? -SCROLL_STEP : SCROLL_STEP;
    }
    return false;
  }

  evt.preventDefault();
  evt.stopPropagation();
  return false;
}

document.addEventListener('keydown', handleKey, true);
document.addEventListener('keypress', handleKey, true);
document.addEventListener('keyup', handleKey, true);
