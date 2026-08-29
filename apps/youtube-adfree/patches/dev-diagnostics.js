/* global __YTAF_VERSION__ */
import { getFeedAdDiagnosticsSnapshot } from './feed-ad-filter';
import { getShortsDiagnosticsSnapshot } from './shorts-filter';
import { getPlaybackRequestDiagnosticsSnapshot } from './playback-request-diagnostics';

const BLUE_CODES = new Set([406, 167, 191]);
const WEBOS_BACK_CODES = new Set([461, 27]);
const PAGE_ROW_BUDGET = 29;
const ESTIMATED_CHARS_PER_ROW = 92;

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

function formatSummary(summary) {
  if (!summary) return 'none captured';
  const top = summary.topKeys?.length ? summary.topKeys.join(', ') : '(none)';
  return `R${summary.sequence} ${formatChars(summary.sourceChars)} ${formatClock(summary.observedAt)} — ${top}`;
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
  title.textContent = 'GTV DEV DIAGNOSTICS v6';
  title.style.cssText =
    'font-size:34px;font-weight:700;margin:0 0 6px 0;letter-spacing:0.03em';

  const help = document.createElement('div');
  help.style.cssText =
    'font-size:20px;opacity:0.82;margin:0 0 12px 0;padding-bottom:12px;border-bottom:2px solid #555';

  const pageLabel = document.createElement('div');
  pageLabel.style.cssText =
    'font-size:21px;font-weight:700;margin:0 0 12px 0;letter-spacing:0.04em';

  const report = document.createElement('pre');
  report.style.cssText = [
    'white-space:pre-wrap',
    'overflow-wrap:anywhere',
    'word-break:break-word',
    'font:inherit',
    'margin:0',
    'height:calc(100vh - 178px)',
    'overflow:hidden',
    'padding-right:16px',
    'box-sizing:border-box'
  ].join(';');

  overlay.appendChild(title);
  overlay.appendChild(help);
  overlay.appendChild(pageLabel);
  overlay.appendChild(report);
  document.body.appendChild(overlay);

  return { overlay, help, pageLabel, report };
}

const panel = createDiagnosticsPanel();
let visible = false;
let pages = [];
let currentPage = 0;

function block(lines) {
  return Array.isArray(lines) ? lines : [lines];
}

function responseProfileBlock(profile, index) {
  const lines = [
    `${index}. R${profile.sequence}  ${formatChars(profile.sourceChars)}  ${formatClock(profile.observedAt)}`,
    `   top: ${profile.topKeys.length ? profile.topKeys.join(', ') : '(none)'}`
  ];

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
      if (entry.details.length) lines.push(`       details: ${entry.details.join(', ')}`);
      if (entry.nearbyKeys.length) lines.push(`       nearby: ${entry.nearbyKeys.join(', ')}`);
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
  return lines;
}

function playbackRequestBlock(entry, index) {
  return [
    `${index}. P${entry.sequence}  ${formatClock(entry.observedAt)}  ${formatChars(entry.serializedChars)}`,
    `   flag before: ${entry.flagBefore}`,
    `   copy-on-write patch applied: ${entry.patchApplied}`,
    `   flag after: ${entry.flagAfter}`,
    `   final serialized body confirms true: ${entry.serializedConfirmed}`,
    `   root keys: ${entry.rootKeys.length ? entry.rootKeys.join(', ') : '(none)'}`,
    `   contentPlaybackContext keys: ${entry.contentKeys.length ? entry.contentKeys.join(', ') : '(none)'}`,
    ''
  ];
}

function adPlaybackEventBlock(event, index) {
  const lines = [
    `${index}. R${event.sequence}  isAdPlayback=${event.value}  ${formatClock(event.observedAt)}`,
    `   ${event.path}`,
    `   top: ${event.topKeys.length ? event.topKeys.join(', ') : '(none)'}`,
    `   nearest player: ${formatSummary(event.nearestPlayerResponse)}`
  ];

  if (event.before.length) {
    lines.push('   immediately before:');
    event.before.forEach((summary) => lines.push(`     ${formatSummary(summary)}`));
  }

  if (event.after.length) {
    lines.push('   immediately after:');
    event.after.forEach((summary) => lines.push(`     ${formatSummary(summary)}`));
  }

  lines.push('');
  return lines;
}

function entityEventBlock(event, index) {
  const lines = [
    `${index}. R${event.sequence}  ${event.key}  ${formatClock(event.observedAt)}`,
    `   ${event.path}`,
    `   top: ${event.topKeys.length ? event.topKeys.join(', ') : '(none)'}`
  ];

  if (event.details.length) {
    lines.push(`   safe details: ${event.details.join(', ')}`);
  }

  if (event.latestAdPlayback) {
    lines.push(
      `   latest ad-playback event: R${event.latestAdPlayback.sequence} isAdPlayback=${event.latestAdPlayback.value}`
    );
  }

  lines.push('');
  return lines;
}

function buildReportBlocks(snapshot, shortsSnapshot, requestSnapshot) {
  const blocks = [];

  blocks.push(
    block([
      `build: v${__YTAF_VERSION__}`,
      `snapshot opened: ${formatClock(new Date().toISOString())}`,
      `responses scanned: ${snapshot.parsedResponses}`,
      `responses profiled: ${snapshot.profiledResponses}`,
      `largest response observed: ${formatChars(snapshot.largestObservedChars)}`,
      `legacy Home-path matches: ${snapshot.homeResponses}`,
      `responses with known ad markers: ${snapshot.knownMarkerResponses}`,
      `known feed renderers removed: ${snapshot.removedFeedRenderers}`,
      `ad-playback events captured: ${snapshot.adPlaybackEvents.length}`,
      `playback request candidates: ${requestSnapshot.playbackCandidates}`,
      `no-ad patches applied: ${requestSnapshot.patchesApplied}`,
      `serialized no-ad=true confirmed: ${requestSnapshot.serializedConfirmed}`,
      `Shorts responses filtered: ${shortsSnapshot.responsesScanned}`,
      `known Shorts removed: ${shortsSnapshot.removedKnown}`,
      `Shorts-like survivors observed: ${shortsSnapshot.suspiciousSurvivors}`,
      `last response observed: ${formatClock(snapshot.lastObservedAt)}`,
      ''
    ])
  );

  blocks.push(
    block([
      '=== 1. PLAYBACK REQUEST DIAGNOSTICS ===',
      'Safe structure around outbound playbackContext serialization. No video IDs, URLs, tokens, tracking values, or request bodies are retained.',
      ''
    ])
  );
  if (requestSnapshot.recentRequests.length === 0) {
    blocks.push(block(['none captured yet', '']));
  } else {
    requestSnapshot.recentRequests
      .slice()
      .reverse()
      .forEach((entry, index) => blocks.push(playbackRequestBlock(entry, index + 1)));
  }

  blocks.push(
    block([
      '=== 2. AD PLAYBACK EVENTS ===',
      'Exact isAdPlayback booleans, their response shape, and nearby response context. These are observed only; DEV no longer mutates them.',
      ''
    ])
  );

  if (snapshot.adPlaybackEvents.length === 0) {
    blocks.push(block(['none captured yet', '']));
  } else {
    snapshot.adPlaybackEvents
      .slice()
      .reverse()
      .forEach((event, index) => blocks.push(adPlaybackEventBlock(event, index + 1)));
  }

  blocks.push(
    block([
      '=== 3. ENTITY PAYLOAD EVENTS ===',
      'Named *Entity objects found directly inside framework/update payloads.',
      ''
    ])
  );
  if (snapshot.entityEvents.length === 0) {
    blocks.push(block(['none captured yet', '']));
  } else {
    snapshot.entityEvents
      .slice()
      .reverse()
      .forEach((event, index) => blocks.push(entityEventBlock(event, index + 1)));
  }

  blocks.push(
    block([
      '=== 4. SHORTS SURVIVOR DIAGNOSTICS ===',
      'Shorts/reel schema clues found inside array entries that the known classifier intentionally kept.',
      `filter runs: ${shortsSnapshot.responsesScanned}  •  known removed: ${shortsSnapshot.removedKnown}  •  suspicious survivors: ${shortsSnapshot.suspiciousSurvivors}`,
      ''
    ])
  );
  if (shortsSnapshot.recentSurvivors.length === 0) {
    blocks.push(block(['none captured yet', '']));
  } else {
    shortsSnapshot.recentSurvivors
      .slice()
      .reverse()
      .forEach((entry, index) => {
        blocks.push(
          block([
            `${index + 1}. ${entry.path}`,
            `   top: ${entry.topKeys.length ? entry.topKeys.join(', ') : '(none)'}`,
            `   clues: ${entry.clues.join(' | ')}`,
            ''
          ])
        );
      });
  }

  blocks.push(block(['--- SHORTS SIGNAL INVENTORY ---']));
  if (shortsSnapshot.signalInventory.length === 0) {
    blocks.push(block(['none captured yet', '']));
  } else {
    shortsSnapshot.signalInventory.forEach((entry, index) => {
      blocks.push(
        block([
          `${index + 1}. ${entry.clue}  [seen ${entry.count}]`,
          `   ${entry.lastPath}`
        ])
      );
    });
    blocks.push(block(['']));
  }

  blocks.push(
    block([
      '=== 5. RECENT STRUCTURED RESPONSES ===',
      'Newest bounded response-shape profiles. R numbers correlate with later sections.',
      ''
    ])
  );

  if (snapshot.recentResponses.length === 0) {
    blocks.push(block(['none captured yet', '']));
  } else {
    snapshot.recentResponses
      .slice()
      .reverse()
      .forEach((profile, index) => blocks.push(responseProfileBlock(profile, index + 1)));
  }

  blocks.push(block(['=== 6. LARGEST PROFILED RESPONSES ===']));
  if (snapshot.largestResponses.length === 0) {
    blocks.push(block(['none captured yet', '']));
  } else {
    snapshot.largestResponses.forEach((profile, index) => {
      const lines = [
        `${index + 1}. R${profile.sequence}  ${formatChars(profile.sourceChars)}  ${formatClock(profile.observedAt)}`,
        `   top: ${profile.topKeys.length ? profile.topKeys.join(', ') : '(none)'}`
      ];
      if (profile.hints.length) {
        lines.push(
          `   hints: ${profile.hints
            .slice(0, 8)
            .map((hint) => `${hint.key}=${hint.value}`)
            .join(' | ')}`
        );
      }
      lines.push('');
      blocks.push(lines);
    });
  }

  blocks.push(block(['=== 7. RESPONSE SHAPE COUNTS ===']));
  if (snapshot.responseShapeCounts.length === 0) {
    blocks.push(block(['none captured yet', '']));
  } else {
    snapshot.responseShapeCounts.forEach((entry, index) => {
      blocks.push(
        block([
          `${index + 1}. [${entry.count}x, last R${entry.lastSequence}] ${entry.signature}`
        ])
      );
    });
    blocks.push(block(['']));
  }

  blocks.push(block(['=== 8. RECENT RENDERER / VIEW-MODEL INVENTORY ===']));
  if (snapshot.rendererInventory.length === 0) {
    blocks.push(block(['none captured yet', '']));
  } else {
    snapshot.rendererInventory.forEach((entry, index) => {
      blocks.push(
        block([
          `${index + 1}. ${entry.key}  [seen ${entry.count}, last R${entry.lastSequence}]`,
          `   ${entry.lastPath}`
        ])
      );
    });
    blocks.push(block(['']));
  }

  blocks.push(block(['=== 9. AD / MASTHEAD / PROMO SIGNAL INVENTORY ===']));
  if (snapshot.signalInventory.length === 0) {
    blocks.push(block(['none captured yet', '']));
  } else {
    snapshot.signalInventory.forEach((entry, index) => {
      const lines = [
        `${index + 1}. ${entry.key}  [seen ${entry.count}, last R${entry.lastSequence}]  (${entry.valueKind})`,
        `   ${entry.lastPath}`
      ];
      if (entry.details?.length) lines.push(`   details: ${entry.details.join(', ')}`);
      blocks.push(lines);
    });
    blocks.push(block(['']));
  }

  blocks.push(block(['=== 10. LEGACY HOME LEADING SHAPES ===']));
  if (snapshot.homeLeadingShapes.length === 0) {
    blocks.push(block(['none captured — useful if the current Home schema moved', '']));
  } else {
    snapshot.homeLeadingShapes.forEach((item) => {
      blocks.push(block([`${item.index}. ${item.renderers.join(' > ')}`]));
    });
    blocks.push(block(['']));
  }

  blocks.push(
    block([
      '=== NOTE ===',
      'DEV v6 retires the failed standalone isAdPlayback mutation and adds outbound playback-request flag diagnostics.',
      'Shorts filtering remains controlled by the existing Remove Shorts setting; direct reel-navigation forms are now recognized while unknown forms remain report-only.',
      'Tracking params, continuation tokens, visitor/auth data, cookies, URLs, signatures, titles, video IDs, and arbitrary payload strings are not retained.'
    ])
  );

  return blocks;
}

function estimatedRows(lines) {
  let rows = 0;
  lines.forEach((line) => {
    rows += Math.max(1, Math.ceil(String(line).length / ESTIMATED_CHARS_PER_ROW));
  });
  return rows;
}

function paginateBlocks(blocks) {
  const result = [];
  let currentLines = [];
  let currentRows = 0;

  blocks.forEach((lines) => {
    const rows = estimatedRows(lines);
    if (currentLines.length > 0 && currentRows + rows > PAGE_ROW_BUDGET) {
      result.push(currentLines.join('\n'));
      currentLines = [];
      currentRows = 0;
    }

    currentLines.push(...lines);
    currentRows += rows;
  });

  if (currentLines.length > 0) result.push(currentLines.join('\n'));
  return result.length > 0 ? result : ['No diagnostics captured yet.'];
}

function renderPage() {
  const pageCount = Math.max(1, pages.length);
  currentPage = ((currentPage % pageCount) + pageCount) % pageCount;
  panel.pageLabel.textContent = `PAGE ${currentPage + 1} / ${pageCount}`;
  panel.help.textContent = 'BLUE = next page  •  BACK = close  •  photograph each page';
  panel.report.textContent = pages[currentPage] || 'No diagnostics captured yet.';
}

function openDiagnostics() {
  pages = paginateBlocks(
    buildReportBlocks(
      getFeedAdDiagnosticsSnapshot(),
      getShortsDiagnosticsSnapshot(),
      getPlaybackRequestDiagnosticsSnapshot()
    )
  );
  currentPage = 0;
  visible = true;
  panel.overlay.style.display = 'block';
  renderPage();
}

function closeDiagnostics() {
  visible = false;
  panel.overlay.style.display = 'none';
  pages = [];
  currentPage = 0;
}

function nextPage() {
  if (!visible) {
    openDiagnostics();
    return;
  }
  currentPage = (currentPage + 1) % Math.max(1, pages.length);
  renderPage();
}

function consume(evt) {
  evt.preventDefault();
  evt.stopPropagation();
  evt.stopImmediatePropagation();
}

function handleKey(evt) {
  if (isBlueKey(evt)) {
    consume(evt);
    if (evt.type === 'keydown') nextPage();
    return false;
  }

  if (!visible) return true;

  if (isBackKey(evt)) {
    consume(evt);
    if (evt.type === 'keydown') closeDiagnostics();
    return false;
  }

  consume(evt);
  return false;
}

window.addEventListener('keydown', handleKey, true);
window.addEventListener('keypress', handleKey, true);
window.addEventListener('keyup', handleKey, true);
