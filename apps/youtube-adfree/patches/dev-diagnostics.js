/* global __YTAF_VERSION__ */
import { getFeedAdDiagnosticsSnapshot } from './feed-ad-filter';

const BLUE_CODES = new Set([406, 167, 191]);
const WEBOS_BACK_CODES = new Set([461, 27]);
const PAGE_SCROLL_FRACTION = 0.78;
const MIN_SCROLL_STEP = 480;

function eventCode(evt) {
  return evt.keyCode || evt.which || evt.charCode || 0;
}

function isBlueKey(evt) {
  return BLUE_CODES.has(eventCode(evt));
}

function isBackKey(evt) {
  const code = eventCode(evt);
  return (
    WEBOS_BACK_CODES.has(code) ||
    evt.key === 'Escape' ||
    evt.key === 'BrowserBack'
  );
}

function scrollDirection(evt) {
  const code = eventCode(evt);
  if (code === 38 || evt.key === 'ArrowUp') return -1;
  if (code === 40 || evt.key === 'ArrowDown') return 1;
  return 0;
}

function formatClock(iso) {
  if (!iso) return 'none yet';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString();
}

function formatChars(value) {
  if (!Number.isFinite(value)) return 'unknown size';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M chars`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k chars`;
  return `${value} chars`;
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
    'font-size:24px',
    'line-height:1.28',
    'box-sizing:border-box',
    'padding:38px 54px'
  ].join(';');

  const title = document.createElement('div');
  title.textContent = 'GTV DEV DIAGNOSTICS v2.1';
  title.style.cssText =
    'font-size:34px;font-weight:700;margin:0 0 6px 0;letter-spacing:0.03em';

  const help = document.createElement('div');
  help.textContent = 'BLUE or BACK closes  •  ↑/↓ page scroll  •  photograph top-to-bottom';
  help.style.cssText =
    'font-size:20px;opacity:0.82;margin:0 0 18px 0;padding-bottom:14px;border-bottom:2px solid #555';

  const report = document.createElement('pre');
  report.tabIndex = -1;
  report.style.cssText = [
    'white-space:pre-wrap',
    'overflow-wrap:anywhere',
    'word-break:break-word',
    'font:inherit',
    'margin:0',
    'height:calc(100vh - 150px)',
    'overflow-y:auto',
    'overscroll-behavior:contain',
    'padding-right:16px',
    'box-sizing:border-box',
    'outline:none'
  ].join(';');

  overlay.appendChild(title);
  overlay.appendChild(help);
  overlay.appendChild(report);
  document.body.appendChild(overlay);

  return { overlay, report };
}

const panel = createDiagnosticsPanel();
let visible = false;

function appendResponseProfile(lines, profile, index) {
  lines.push(
    `${index}. R${profile.sequence}  ${formatChars(profile.sourceChars)}  ${formatClock(profile.observedAt)}`
  );
  lines.push(`   top: ${profile.topKeys.length ? profile.topKeys.join(', ') : '(none)'}`);

  if (profile.hints.length) {
    lines.push('   scalar hints:');
    profile.hints.forEach((hint) => {
      lines.push(`     ${hint.key}=${hint.value}`);
      lines.push(`       ${hint.path}`);
    });
  }

  if (profile.renderers.length) {
    lines.push('   renderer/view-model paths:');
    profile.renderers.forEach((entry) => {
      lines.push(`     ${entry.key}`);
      lines.push(`       ${entry.path}`);
    });
  } else {
    lines.push('   renderer/view-model paths: none in bounded scan');
  }

  if (profile.signals.length) {
    lines.push('   ad/masthead/promo-ish signals:');
    profile.signals.forEach((entry) => {
      lines.push(`     ${entry.key}  (${entry.valueKind})`);
      lines.push(`       ${entry.path}`);
      if (entry.details.length) {
        lines.push(`       details: ${entry.details.join(', ')}`);
      }
      if (entry.nearbyKeys.length) {
        lines.push(`       nearby: ${entry.nearbyKeys.join(', ')}`);
      }
    });
  }

  if (profile.arrays.length) {
    lines.push('   notable arrays:');
    profile.arrays.forEach((entry) => {
      lines.push(`     [${entry.length}] ${entry.path}`);
    });
  }

  lines.push(
    `   bounded scan: ${profile.visitedNodes}${profile.scanTruncated ? '+' : ''} nodes${
      profile.scanTruncated ? ' (truncated)' : ''
    }`,
    ''
  );
}

function formatSnapshot(snapshot) {
  const lines = [
    `build: v${__YTAF_VERSION__}`,
    `snapshot opened: ${formatClock(new Date().toISOString())}`,
    `responses scanned: ${snapshot.parsedResponses}`,
    `responses profiled: ${snapshot.profiledResponses}`,
    `largest response observed: ${formatChars(snapshot.largestObservedChars)}`,
    `legacy Home-path matches: ${snapshot.homeResponses}`,
    `responses with known ad markers: ${snapshot.knownMarkerResponses}`,
    `known feed renderers removed: ${snapshot.removedFeedRenderers}`,
    `last response observed: ${formatClock(snapshot.lastObservedAt)}`,
    '',
    '=== 1. RECENT STRUCTURED RESPONSES ===',
    'Newest bounded response-shape profiles. R numbers correlate with later sections.',
    ''
  ];

  if (snapshot.recentResponses.length === 0) {
    lines.push('none captured yet', '');
  } else {
    snapshot.recentResponses
      .slice()
      .reverse()
      .forEach((profile, index) => appendResponseProfile(lines, profile, index + 1));
  }

  lines.push('=== 2. LARGEST PROFILED RESPONSES ===');
  if (snapshot.largestResponses.length === 0) {
    lines.push('none captured yet');
  } else {
    snapshot.largestResponses.forEach((profile, index) => {
      lines.push(
        `${index + 1}. R${profile.sequence}  ${formatChars(profile.sourceChars)}  ${formatClock(
          profile.observedAt
        )}`
      );
      lines.push(`   top: ${profile.topKeys.length ? profile.topKeys.join(', ') : '(none)'}`);
      if (profile.hints.length) {
        lines.push(
          `   hints: ${profile.hints
            .slice(0, 6)
            .map((hint) => `${hint.key}=${hint.value}`)
            .join(' | ')}`
        );
      }
    });
  }

  lines.push('', '=== 3. RESPONSE SHAPE COUNTS ===');
  if (snapshot.responseShapeCounts.length === 0) {
    lines.push('none captured yet');
  } else {
    snapshot.responseShapeCounts.forEach((entry, index) => {
      lines.push(
        `${index + 1}. [${entry.count}x, last R${entry.lastSequence}] ${entry.signature}`
      );
    });
  }

  lines.push('', '=== 4. RECENT RENDERER / VIEW-MODEL INVENTORY ===');
  if (snapshot.rendererInventory.length === 0) {
    lines.push('none captured yet');
  } else {
    snapshot.rendererInventory.forEach((entry, index) => {
      lines.push(`${index + 1}. ${entry.key}  [seen ${entry.count}, last R${entry.lastSequence}]`);
      lines.push(`   ${entry.lastPath}`);
    });
  }

  lines.push('', '=== 5. AD / MASTHEAD / PROMO SIGNAL INVENTORY ===');
  if (snapshot.signalInventory.length === 0) {
    lines.push('none captured yet');
  } else {
    snapshot.signalInventory.forEach((entry, index) => {
      lines.push(
        `${index + 1}. ${entry.key}  [seen ${entry.count}, last R${entry.lastSequence}]  (${entry.valueKind})`
      );
      lines.push(`   ${entry.lastPath}`);
      if (entry.details?.length) lines.push(`   details: ${entry.details.join(', ')}`);
    });
  }

  lines.push('', '=== 6. LEGACY HOME LEADING SHAPES ===');
  if (snapshot.homeLeadingShapes.length === 0) {
    lines.push('none captured — this is useful if the current Home schema moved');
  } else {
    snapshot.homeLeadingShapes.forEach((item) => {
      lines.push(`${item.index}. ${item.renderers.join(' > ')}`);
    });
  }

  lines.push(
    '',
    '=== NOTE ===',
    'This DEV build records response structure, key names, object paths, array lengths, and a small allowlist of scalar schema hints.',
    'Tracking params, continuation tokens, visitor/auth data, cookies, URLs, signatures, and arbitrary payload strings are not retained.',
    'The diagnostics observer does not block an unknown schema merely because it looks suspicious.'
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
    panel.report.focus();
  }
}

function consume(evt) {
  evt.preventDefault();
  evt.stopPropagation();
  evt.stopImmediatePropagation();
}

function handleKey(evt) {
  if (isBlueKey(evt)) {
    consume(evt);
    if (evt.type === 'keydown') setVisible(!visible);
    return false;
  }

  if (!visible) return true;

  if (isBackKey(evt)) {
    consume(evt);
    if (evt.type === 'keydown') setVisible(false);
    return false;
  }

  const direction = scrollDirection(evt);
  if (direction !== 0) {
    consume(evt);

    if (evt.type === 'keydown') {
      const maxScroll = Math.max(0, panel.report.scrollHeight - panel.report.clientHeight);
      const step = Math.max(
        MIN_SCROLL_STEP,
        Math.floor(panel.report.clientHeight * PAGE_SCROLL_FRACTION)
      );
      panel.report.scrollTop = Math.max(
        0,
        Math.min(maxScroll, panel.report.scrollTop + direction * step)
      );
    }
    return false;
  }

  consume(evt);
  return false;
}

// YouTube installs its own remote-navigation handlers at window scope. Listen at
// window capture too, and install this DEV listener before the app bootstrap, so
// D-pad events cannot be swallowed before the diagnostics overlay sees them.
window.addEventListener('keydown', handleKey, true);
window.addEventListener('keypress', handleKey, true);
window.addEventListener('keyup', handleKey, true);
