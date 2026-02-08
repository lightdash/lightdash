const raw = /*__DATA__*/null;

const hasSentry = raw.nodes.some(n => n.sentryActivity);
if (!hasSentry) { document.querySelectorAll('#size-mode option').forEach(o => { if (o.value === 'traffic' || o.value === 'errors') o.remove(); }); }

const color = { controller: '#79c0ff', router: '#d2a8ff', service: '#7ee787', model: '#ffa657', client: '#f778ba', scheduler: '#ff7b72', entity: '#76e4f7', adapter: '#e3b341', middleware: '#adbac7', analytics: '#2dd4bf' };
const colorDark = { controller: '#1f6feb', router: '#8957e5', service: '#238636', model: '#9e6a03', client: '#da3633', scheduler: '#da3633', entity: '#0e7490', adapter: '#9e6a03', middleware: '#636e7b', analytics: '#0f766e' };

const W = window.innerWidth, H = window.innerHeight;

const nodeIdx = {};
raw.nodes.forEach((n, i) => { nodeIdx[n.id] = i; });

const connCount = {};
raw.edges.forEach(e => {
  connCount[e.from] = (connCount[e.from] || 0) + 1;
  connCount[e.to] = (connCount[e.to] || 0) + 1;
});

function calcRadius(n) {
  const mode = document.getElementById('size-mode').value;
  switch (mode) {
    case 'lines': return Math.max(4, 3 + Math.sqrt((n.lineCount || 100) / 30) * 2.2);
    case 'cyclomatic': return Math.max(4, 3 + Math.sqrt((n.complexity?.cyclomatic || 1) / 5) * 2.2);
    case 'cognitive': return Math.max(4, 3 + Math.sqrt((n.complexity?.cognitive || 1) / 5) * 2.2);
    case 'commits': return Math.max(4, 3 + Math.sqrt((n.gitActivity?.commits || 1) / 8) * 2.2);
    case 'authors': return Math.max(4, 3 + Math.sqrt(n.gitActivity?.authors || 1) * 3);
    case 'churn': return Math.max(4, 3 + Math.sqrt((n.gitActivity?.churn || 0) / 2) * 2.5);
    case 'health': return Math.max(4, 3 + (n.healthScore || 0) * 16);
    case 'duplication': return Math.max(4, 3 + Math.sqrt((n.duplication?.ratio || 0) * 100) * 2);
    case 'traffic': return Math.max(4, 3 + Math.log10((n.sentryActivity?.totalRequests || 1)) * 2.5);
    case 'errors': return Math.max(4, 3 + Math.log10((n.sentryActivity?.totalErrors || 1)) * 2.5);
    default: return Math.max(4, 3 + Math.sqrt(connCount[n.id] || 1) * 2.2);
  }
}

const nodes = raw.nodes.map(n => ({ ...n, r: calcRadius(n) }));

// Health score: normalized composite of coupling, complexity, churn, commits
const hMetrics = {
  coupling: raw.nodes.map(n => connCount[n.id] || 0),
  complexity: raw.nodes.map(n => n.complexity?.cyclomatic || 0),
  churn: raw.nodes.map(n => n.gitActivity?.churn || 0),
  commits: raw.nodes.map(n => n.gitActivity?.commits || 0),
};
function maxNorm(vals) { const mx = Math.max(...vals); return mx === 0 ? vals.map(() => 0) : vals.map(v => v / mx); }
const nCoup = maxNorm(hMetrics.coupling), nComp = maxNorm(hMetrics.complexity);
const nChurn = maxNorm(hMetrics.churn), nComm = maxNorm(hMetrics.commits);
const healthColorScale = d3.scaleLinear().domain([0, 0.5, 1]).range(['#3fb950', '#d29922', '#f47067']).interpolate(d3.interpolateRgb);
const healthStrokeScale = d3.scaleLinear().domain([0, 0.5, 1]).range(['#238636', '#9e6a03', '#da3633']).interpolate(d3.interpolateRgb);
nodes.forEach((n, i) => { n.healthScore = nCoup[i] * 0.3 + nComp[i] * 0.25 + nChurn[i] * 0.3 + nComm[i] * 0.15; });

const trafficMax = Math.max(...raw.nodes.map(n => Math.log10((n.sentryActivity?.totalRequests || 0) + 1)));
function trafficNorm(n) { if (!n.sentryActivity || trafficMax === 0) return -1; return Math.log10(n.sentryActivity.totalRequests + 1) / trafficMax; }
const trafficColorScale = d3.scaleLinear().domain([0, 0.5, 1]).range(['#e2b340', '#e8853a', '#f47067']).interpolate(d3.interpolateRgb);
const trafficStrokeScale = d3.scaleLinear().domain([0, 0.5, 1]).range(['#9e6a03', '#b85c1e', '#da3633']).interpolate(d3.interpolateRgb);

const errorsMax = Math.max(...raw.nodes.map(n => Math.log10((n.sentryActivity?.totalErrors || 0) + 1)));
function errorsNorm(n) { if (!n.sentryActivity || errorsMax === 0) return -1; return Math.log10((n.sentryActivity.totalErrors || 0) + 1) / errorsMax; }
const errorsColorScale = d3.scaleLinear().domain([0, 0.5, 1]).range(['#d29922', '#f47067', '#da3633']).interpolate(d3.interpolateRgb);
const errorsStrokeScale = d3.scaleLinear().domain([0, 0.5, 1]).range(['#9e6a03', '#da3633', '#8b1a1a']).interpolate(d3.interpolateRgb);

function getColorMode() { const m = document.getElementById('size-mode').value; if (m === 'health' || m === 'duplication' || m === 'traffic' || m === 'errors') return m; return 'type'; }
function getNodeColor(d) { const m = getColorMode(); if (m === 'health') return healthColorScale(d.healthScore); if (m === 'duplication') return healthColorScale(d.duplication?.ratio || 0); if (m === 'traffic') { const t = trafficNorm(d); return t < 0 ? '#30363d' : trafficColorScale(t); } if (m === 'errors') { const e = errorsNorm(d); return e < 0 ? '#30363d' : e === 0 ? '#3fb950' : errorsColorScale(e); } return color[d.type]; }
function getNodeStroke(d) { const m = getColorMode(); if (m === 'health') return healthStrokeScale(d.healthScore); if (m === 'duplication') return healthStrokeScale(d.duplication?.ratio || 0); if (m === 'traffic') { const t = trafficNorm(d); return t < 0 ? '#21262d' : trafficStrokeScale(t); } if (m === 'errors') { const e = errorsNorm(d); return e < 0 ? '#21262d' : e === 0 ? '#238636' : errorsStrokeScale(e); } return colorDark[d.type]; }

const links = raw.edges.map(e => ({
  source: nodeIdx[e.from],
  target: nodeIdx[e.to],
  type: e.type
}));

const outgoing = {}, incoming = {};
raw.edges.forEach(e => {
  if (!outgoing[e.from]) outgoing[e.from] = [];
  outgoing[e.from].push({ id: e.to, type: e.type });
  if (!incoming[e.to]) incoming[e.to] = [];
  incoming[e.to].push({ id: e.from, type: e.type });
});

const svg = d3.select('#graph').attr('width', W).attr('height', H);

// Arrowhead markers (5 edge types × dim/bright)
const defs = svg.append('defs');
const edgeTypes = [
  { type: 'uses_service', color: '#79c0ff' },
  { type: 'router_uses_service', color: '#d2a8ff' },
  { type: 'injects_model', color: '#ffa657' },
  { type: 'injects_client', color: '#f778ba' },
  { type: 'injects_service', color: '#7ee787' },
  { type: 'shares_code', color: '#f47067' },
  { type: 'scheduler_uses_service', color: '#ff7b72' },
  { type: 'scheduler_uses_client', color: '#ff7b72' },
  { type: 'uses_entity', color: '#76e4f7' },
  { type: 'uses_adapter', color: '#e3b341' },
  { type: 'extends_adapter', color: '#e3b341' },
  { type: 'middleware_uses_service', color: '#adbac7' },
  { type: 'uses_analytics', color: '#2dd4bf' },
];
const coreEdgeTypes = new Set(['uses_service', 'router_uses_service', 'injects_model', 'injects_client', 'injects_service', 'uses_entity', 'uses_adapter', 'uses_analytics']);
const defaultEdgeVisibility = {};
edgeTypes.forEach(({ type }) => { defaultEdgeVisibility[type] = coreEdgeTypes.has(type); });
let edgeVisibility;
try {
  const stored = JSON.parse(localStorage.getItem('dep-graph-edge-visibility'));
  edgeVisibility = { ...defaultEdgeVisibility };
  if (stored) Object.keys(stored).forEach(k => { if (k in edgeVisibility) edgeVisibility[k] = stored[k]; });
} catch { edgeVisibility = { ...defaultEdgeVisibility }; }
function saveEdgeVisibility() { localStorage.setItem('dep-graph-edge-visibility', JSON.stringify(edgeVisibility)); }

let eeVisible = true;

edgeTypes.forEach(({ type, color: c }) => {
  [{ suffix: '', opacity: 0.15, w: 8, h: 6 }, { suffix: 'hi-', opacity: 0.9, w: 5, h: 3.75 }].forEach(({ suffix, opacity, w, h }) => {
    defs.append('marker')
      .attr('id', 'arrow-' + suffix + type)
      .attr('viewBox', '0 0 10 6')
      .attr('refX', 10).attr('refY', 3)
      .attr('markerWidth', w).attr('markerHeight', h)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,0 L10,3 L0,6Z')
      .attr('fill', c)
      .attr('fill-opacity', opacity);
  });
});

const g = svg.append('g');
const zoomBehavior = d3.zoom().scaleExtent([0.05, 10]).on('zoom', e => g.attr('transform', e.transform));
svg.call(zoomBehavior);

const colX = { controller: W * 0.08, router: W * 0.20, service: W * 0.40, model: W * 0.68, client: W * 0.88 };

let domainNames = [];
let domainColor = {};
let domainCenters = {};
const typeOffsetX = { controller: -50, router: -25, service: 0, model: 25, client: 50, scheduler: -60, entity: 40, adapter: -40, middleware: -55, analytics: 15 };

const domainMap = {};
nodes.forEach(n => {
  if (n.domain) {
    if (!domainMap[n.domain]) domainMap[n.domain] = [];
    domainMap[n.domain].push(n);
  }
});
domainNames = Object.keys(domainMap).sort();
const dCols = Math.ceil(Math.sqrt(domainNames.length * (W / H)));
const dRows = Math.ceil(domainNames.length / dCols);
const cellW = W / (dCols + 1);
const cellH = (H - 60) / (dRows + 1);
const palette = d3.schemeTableau10;

domainNames.forEach((name, i) => {
  const col = i % dCols;
  const row = Math.floor(i / dCols);
  const cx = cellW * (col + 1);
  const cy = cellH * (row + 1) + 40;
  domainCenters[name] = { x: cx, y: cy };
  domainColor[name] = palette[i % palette.length];
  domainMap[name].forEach(n => {
    n.domainX = cx + (typeOffsetX[n.type] || 0);
    n.domainY = cy;
  });
});

let groupMode = 'domain';

const layerTypes = ['controller', 'router', 'service', 'model', 'client', 'scheduler', 'entity', 'adapter', 'middleware', 'analytics'];
const layerLabels = { controller: 'Controllers', router: 'Routers', service: 'Services', model: 'Models', client: 'Clients', scheduler: 'Schedulers', entity: 'Entities', adapter: 'Adapters', middleware: 'Middleware', analytics: 'Analytics' };
let layerCenters = {};
const layerMap = {};
nodes.forEach(n => {
  if (!layerMap[n.type]) layerMap[n.type] = [];
  layerMap[n.type].push(n);
});
const lCols = Math.ceil(Math.sqrt(layerTypes.length * (W / H)));
const lRows = Math.ceil(layerTypes.length / lCols);
const lCellW = W / (lCols + 1);
const lCellH = (H - 60) / (lRows + 1);
layerTypes.forEach((type, i) => {
  const col = i % lCols;
  const row = Math.floor(i / lCols);
  const cx = lCellW * (col + 1);
  const cy = lCellH * (row + 1) + 40;
  layerCenters[type] = { x: cx, y: cy };
  (layerMap[type] || []).forEach(n => {
    n.layerX = cx;
    n.layerY = cy;
  });
});

const sim = d3.forceSimulation(nodes)
  .force('link', d3.forceLink(links).distance(60).strength(0.1))
  .force('charge', d3.forceManyBody().strength(-150).distanceMax(300))
  .force('collision', d3.forceCollide().radius(d => d.r + 18).strength(0.9).iterations(2))
  .force('x', d3.forceX(d => d.domainX || W/2).strength(0.3))
  .force('y', d3.forceY(d => d.domainY || H/2).strength(0.3));

const colLabels = g.append('g').attr('class', 'col-labels').style('display', 'none');
layerTypes.forEach(type => {
  if (!colX[type]) return;
  colLabels.append('text')
    .attr('x', colX[type])
    .attr('y', 30)
    .attr('text-anchor', 'middle')
    .attr('fill', color[type])
    .attr('font-size', '13px')
    .attr('font-weight', '600')
    .attr('opacity', 0.4)
    .text(layerLabels[type]);
});

function applyGroupLayout() {
  if (groupMode === 'domain') {
    sim.force('link', d3.forceLink(links).distance(60).strength(0.1))
      .force('charge', d3.forceManyBody().strength(-150).distanceMax(300))
      .force('collision', d3.forceCollide().radius(d => d.r + 18).strength(0.9).iterations(2))
      .force('center', null)
      .force('x', d3.forceX(d => d.domainX || W/2).strength(0.3))
      .force('y', d3.forceY(d => d.domainY || H/2).strength(0.3));
    colLabels.style('display', 'none');
  } else {
    sim.force('link', d3.forceLink(links).distance(60).strength(0.1))
      .force('charge', d3.forceManyBody().strength(-150).distanceMax(300))
      .force('collision', d3.forceCollide().radius(d => d.r + 18).strength(0.9).iterations(2))
      .force('center', null)
      .force('x', d3.forceX(d => d.layerX || W/2).strength(0.3))
      .force('y', d3.forceY(d => d.layerY || H/2).strength(0.3));
    colLabels.style('display', 'none');
  }
  sim.alpha(0.8).restart();
}

const hullLayer = g.insert('g', ':first-child').attr('class', 'hull-layer');

const edgeColorMap = {};
edgeTypes.forEach(({ type, color: c }) => { edgeColorMap[type] = c; });

const linkHit = g.append('g').selectAll('line').data(links).join('line')
  .attr('class', 'link-hit')
  .attr('stroke', 'transparent').attr('stroke-width', 12).attr('fill', 'none');

const link = g.append('g').selectAll('line').data(links).join('line')
  .attr('class', d => 'link link-' + d.type)
  .attr('marker-end', d => 'url(#arrow-' + d.type + ')');

const linkNodes = link.nodes();
linkHit.on('mouseover', function(ev, d) {
  const i = linkHit.nodes().indexOf(this);
  if (i >= 0 && linkNodes[i].classList.contains('dimmed')) return;
  const src = typeof d.source === 'object' ? d.source.id : nodes[d.source].id;
  const tgt = typeof d.target === 'object' ? d.target.id : nodes[d.target].id;
  const c = edgeColorMap[d.type] || '#8b949e';
  tip.html('<span style="color:' + c + ';font-weight:600">' + d.type + '</span><br><span style="color:#8b949e">' + src + ' → ' + tgt + '</span>')
    .style('display', 'block');
})
.on('mousemove', ev => {
  const x = Math.min(ev.clientX + 16, W - 400);
  tip.style('left', x + 'px').style('top', (ev.clientY - 10) + 'px');
})
.on('mouseout', () => tip.style('display', 'none'));

function isEeHidden(l) {
  if (eeVisible) return false;
  const s = typeof l.source === 'object' ? l.source.id : nodes[l.source].id;
  const t = typeof l.target === 'object' ? l.target.id : nodes[l.target].id;
  const sNode = nodes.find(n => n.id === s);
  const tNode = nodes.find(n => n.id === t);
  return (sNode && sNode.ee) || (tNode && tNode.ee);
}

function applyEdgeDisplay() {
  link.each(function(l) {
    const hidden = !edgeVisibility[l.type] || isEeHidden(l);
    d3.select(this).style('display', hidden ? 'none' : null);
    if (!hidden) d3.select(this).style('stroke-opacity', 0);
  });
  linkHit.each(function(l) {
    d3.select(this).style('display', (!edgeVisibility[l.type] || isEeHidden(l)) ? 'none' : null);
  });
  if (selected) {
    const d = nodes.find(n => n.id === selected);
    if (d) requestAnimationFrame(() => highlightNode(d));
  } else {
    link.each(function() { d3.select(this).style('stroke-opacity', null); });
  }
  updateEdgeBadge();
}

function updateEdgeBadge() {
  const total = edgeTypes.length;
  const visible = edgeTypes.filter(({ type }) => edgeVisibility[type]).length;
  document.getElementById('edge-badge').textContent = visible + '/' + total;
  document.getElementById('btn-edges').classList.toggle('active', visible > 0);
}

let dragged = false;
const node = g.append('g').selectAll('g').data(nodes).join('g')
  .attr('class', 'node')
  .call(d3.drag()
    .on('start', (e, d) => { dragged = false; d.fx = d.x; d.fy = d.y; })
    .on('drag', (e, d) => { dragged = true; if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = e.x; d.fy = e.y; })
    .on('end', (e, d) => { if (!e.active) sim.alphaTarget(0); if (!dragged) { d.fx = null; d.fy = null; } }));

node.append('circle')
  .attr('r', d => d.r)
  .attr('fill', d => getNodeColor(d))
  .attr('stroke', d => getNodeStroke(d))
  .attr('stroke-width', 1.5)
  .attr('stroke-dasharray', d => d.ee ? '3,2' : null);

node.append('text')
  .text(d => d.id)
  .attr('dx', d => d.r + 3)
  .attr('dy', 3)
  .attr('fill', d => color[d.type])
  .attr('font-size', d => d.r > 8 ? '10px' : '8px')
  .attr('opacity', 0.7);

const tip = d3.select('#tooltip');

function fmtNum(n) { if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'; if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'; return String(n); }
function fmtMs(ms) { if (ms >= 1000) return (ms / 1000).toFixed(1) + 's'; return Math.round(ms) + 'ms'; }

function buildNodeContent(d, opts) {
  const interactive = opts && opts.interactive;
  let h = '';
  if (!interactive) {
    h += '<h3 style="color:' + color[d.type] + '">' + d.id + '</h3>';
  }
  h += '<span style="color:#8b949e">' + d.type + '</span>';
  if (d.domain) h += ' <span style="color:#6e7681">· ' + d.domain + '</span>';
  const pct = Math.round((1 - d.healthScore) * 100);
  h += '<div class="t-section">health score</div>';
  h += '<div class="t-item"><span style="color:' + healthColorScale(d.healthScore) + ';font-weight:700;font-size:18px">' + pct + '</span><span style="color:#484f58;font-size:12px"> / 100</span></div>';
  h += '<div class="t-item" style="font-size:11px;color:#8b949e;margin-top:2px">';
  h += (connCount[d.id]||0) + ' edges · ' + (d.lineCount||0) + ' lines · ' + (d.gitActivity?.churn||0) + ' churn · ' + (d.gitActivity?.commits||0) + ' commits';
  h += '</div>';
  if (d.complexity) {
    h += '<div class="t-item" style="font-size:11px;color:#8b949e;margin-top:2px">Cyclomatic: <b style="color:#c9d1d9">' + d.complexity.cyclomatic + '</b> · Cognitive: <b style="color:#c9d1d9">' + d.complexity.cognitive + '</b> · Max/fn: <b style="color:#c9d1d9">' + d.complexity.maxFunctionCyclomatic + '</b></div>';
  }
  if (d.healthSummary) {
    h += '<div style="color:' + healthColorScale(d.healthScore) + ';font-style:italic;padding-left:10px;margin-top:4px;font-size:11px">' + d.healthSummary + '</div>';
  }
  if (d.duplication && d.duplication.ratio > 0) {
    const dupPct = Math.round(d.duplication.ratio * 100);
    const dupEdges = raw.edges.filter(e => e.type === 'shares_code' && (e.from === d.id || e.to === d.id));
    h += '<div class="t-section">duplication</div>';
    h += '<div class="t-item"><span style="color:#f47067;font-weight:700">' + dupPct + '%</span> duplicated <span style="color:#484f58">(' + d.duplication.clonedLines + ' / ' + d.duplication.totalLines + ' lines)</span>';
    if (dupEdges.length > 0) h += ' · <span style="color:#484f58">' + dupEdges.length + ' shared</span>';
    h += '</div>';
    if (d.duplicationSummary) {
      h += '<div style="color:#f47067;font-style:italic;padding-left:10px;margin-top:4px;font-size:11px">' + d.duplicationSummary + '</div>';
    }
    dupEdges.forEach(e => {
      const other = e.from === d.id ? e.to : e.from;
      const dup = e.duplication;
      if (dup) {
        h += '<div class="t-item" style="font-size:11px;margin-top:4px"><span style="color:#f47067">↔</span> <b style="color:#c9d1d9">' + other + '</b> <span style="color:#484f58">' + dup.cloneCount + ' clone' + (dup.cloneCount > 1 ? 's' : '') + ', ' + dup.totalLines + ' lines</span></div>';
        if (dup.advice) {
          h += '<div style="color:#d29922;font-style:italic;padding-left:18px;margin-top:1px;font-size:11px">' + dup.advice + '</div>';
        }
      }
    });
  }
  if (d.sentryActivity) {
    const sa = d.sentryActivity;
    h += '<div class="t-section">sentry (30d)</div>';
    h += '<div class="t-item"><span style="color:#58a6ff;font-weight:700">' + fmtNum(sa.totalRequests) + '</span> requests';
    if (sa.maxP95Ms > 0) h += ' · p95 <span style="color:#c9d1d9;font-weight:600">' + fmtMs(sa.maxP95Ms) + '</span>';
    if (sa.totalErrors > 0) h += ' · <span style="color:#f47067">' + fmtNum(sa.totalErrors) + ' errors (' + (sa.errorRate * 100).toFixed(2) + '%)</span>';
    h += '</div>';
    if (sa.topError) {
      const shortErr = sa.topError.length > 60 ? sa.topError.slice(0, 57) + '…' : sa.topError;
      if (interactive && sa.topErrorGroupId) {
        var issueUrl = 'https://lightdash.sentry.io/issues/' + sa.topErrorGroupId + '/events/?project=5959292';
        if (sa.topErrorTransaction) issueUrl += '&query=' + encodeURIComponent('transaction:"' + sa.topErrorTransaction + '"');
        h += '<div class="t-item" style="font-size:11px;margin-top:2px"><span style="color:#f47067">⚡</span> <a href="' + issueUrl + '" target="_blank" style="color:#f0883e">' + shortErr + '</a> <span style="color:#484f58">(' + fmtNum(sa.topErrorCount) + ')</span></div>';
      } else if (interactive) {
        h += '<div class="t-item" style="font-size:11px;margin-top:2px"><span style="color:#f47067">⚡</span> <span style="color:#f0883e">' + shortErr + '</span> <span style="color:#484f58">(' + fmtNum(sa.topErrorCount) + ')</span></div>';
      } else {
        h += '<div class="t-item" style="font-size:11px;margin-top:2px"><span style="color:#f47067">⚡</span> <span style="color:#f0883e">' + shortErr + '</span> <span style="color:#484f58">(' + fmtNum(sa.topErrorCount) + ')</span></div>';
      }
    }
    if (sa.endpoints && sa.endpoints.length > 0) {
      h += '<div class="t-section" style="margin-top:4px">top endpoints</div>';
      sa.endpoints.slice(0, 3).forEach(ep => {
        const shortRoute = ep.route.length > 45 ? '...' + ep.route.slice(-42) : ep.route;
        h += '<div class="t-item" style="font-size:11px"><span style="color:#58a6ff">' + fmtNum(ep.count).padStart(5) + '</span>  ' + shortRoute;
        if (ep.p95Ms > 0) h += '  <span style="color:#484f58">p95 ' + fmtMs(ep.p95Ms) + '</span>';
        if (ep.errorCount > 0) h += '  <span style="color:#f47067">' + fmtNum(ep.errorCount) + ' err</span>';
        h += '</div>';
      });
    }
    if (sa.spans && sa.spans.length > 0) {
      h += '<div class="t-section" style="margin-top:4px">service spans</div>';
      sa.spans.slice(0, 3).forEach(sp => {
        h += '<div class="t-item" style="font-size:11px"><span style="color:#58a6ff">' + fmtNum(sp.count).padStart(5) + '</span>  ' + sp.name + '</div>';
      });
    }
  }
  if (d.gitActivity) {
    h += '<div class="t-section">git activity</div>';
    h += '<div class="t-item">' + d.gitActivity.commits + ' commits · ' + d.gitActivity.authors + ' authors · ' + d.gitActivity.churn + ' recent (6mo)</div>';
    if (d.gitSummary) {
      h += '<div style="color:#7ee787;font-style:italic;padding-left:10px;margin-top:4px;font-size:11px;white-space:pre-line">' + d.gitSummary + '</div>';
    }
    if (interactive || !d.gitSummary) {
      if (d.gitActivity.recentCommits && d.gitActivity.recentCommits.length > 0) {
        h += '<div class="t-section" style="margin-top:6px">recent commits</div>';
        d.gitActivity.recentCommits.forEach(c => {
          const msg = c.message.length > 50 ? c.message.slice(0, 50) + '…' : c.message;
          if (interactive) {
            h += '<div class="t-item" style="font-size:11px"><a href="https://github.com/lightdash/lightdash/commit/' + c.hash + '" target="_blank" style="color:#484f58">' + c.hash + '</a>  ' + msg + '  <span style="color:#484f58">' + c.relativeDate + '</span></div>';
          } else {
            h += '<div class="t-item" style="font-size:11px"><span style="color:#484f58">' + c.hash + '</span>  ' + msg + '  <span style="color:#484f58">' + c.relativeDate + '</span></div>';
          }
        });
      }
    }
  }
  return h;
}

node.on('mouseover', (ev, d) => {
  if (selected === d.id) return;
  tip.html(buildNodeContent(d, { interactive: false })).style('display', 'block');
})
.on('mousemove', ev => {
  const x = Math.min(ev.clientX + 16, W - 400);
  tip.style('left', x + 'px').style('top', (ev.clientY - 10) + 'px');
})
.on('mouseout', () => tip.style('display', 'none'));

let selected = null;
node.on('click', (ev, d) => {
  ev.stopPropagation();
  tip.style('display', 'none');
  if (selected === d.id) { selected = null; clearHL(); closeDetail(); return; }
  selected = d.id;
  highlightNode(d);
  openDetail(d);
});
svg.on('click', () => {
  selected = null; clearHL(); closeDetail();
  document.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('active'));
  document.querySelector('[data-filter="all"]').classList.add('active');
});

document.getElementById('depth').addEventListener('input', () => {
  if (selected) {
    const d = nodes.find(n => n.id === selected);
    if (d) highlightNode(d);
  }
});

function updateHeatmapLegend() {
  const mode = getColorMode();
  const isHeatmap = mode !== 'type';
  document.getElementById('heatmap-legend').style.display = isHeatmap ? 'flex' : 'none';
  if (!isHeatmap) return;
  const labels = document.querySelectorAll('.heatmap-labels span');
  const bar = document.querySelector('.heatmap-bar');
  if (mode === 'duplication') { labels[0].textContent = 'No duplication'; labels[1].textContent = 'High duplication'; bar.style.background = 'linear-gradient(to right, #3fb950, #d29922, #f47067)'; }
  else if (mode === 'traffic') { labels[0].textContent = 'Low traffic'; labels[1].textContent = 'High traffic'; bar.style.background = 'linear-gradient(to right, #e2b340, #e8853a, #f47067)'; }
  else if (mode === 'errors') { labels[0].textContent = 'No errors'; labels[1].textContent = 'High errors'; bar.style.background = 'linear-gradient(to right, #d29922, #f47067, #da3633)'; }
  else { labels[0].textContent = 'Healthy'; labels[1].textContent = 'Hot'; bar.style.background = 'linear-gradient(to right, #3fb950, #d29922, #f47067)'; }
}

const sizeDescriptions = {
  edges: 'Larger nodes have more dependencies',
  lines: 'Larger nodes have more lines of code',
  cyclomatic: 'Larger nodes have more execution paths through the code',
  cognitive: 'Larger nodes are harder for humans to read and understand',
  commits: 'Larger nodes have been changed more frequently',
  authors: 'Larger nodes have been touched by more contributors',
  churn: 'Larger nodes had more recent changes in the last 6 months',
  health: 'Larger nodes score worse on a composite of coupling, complexity, and churn',
  duplication: 'Larger nodes have more duplicated code blocks',
  traffic: 'Larger nodes handle more production requests (Sentry, 30 days)',
  errors: 'Larger nodes have more production errors (Sentry, 30 days)',
};
const sizeDescEl = document.getElementById('size-description');
function updateSizeDescription() {
  sizeDescEl.textContent = sizeDescriptions[document.getElementById('size-mode').value] || '';
}
updateSizeDescription();

document.getElementById('size-mode').addEventListener('change', () => {
  nodes.forEach(n => { n.r = calcRadius(n); });
  node.select('circle').attr('r', d => d.r);
  node.select('text').attr('dx', d => d.r + 3).attr('font-size', d => d.r > 8 ? '10px' : '8px');
  sim.force('collision', d3.forceCollide().radius(d => d.r + 18).strength(0.9).iterations(2));
  sim.alpha(0.3).restart();
  node.select('circle')
    .transition().duration(400)
    .attr('fill', d => getNodeColor(d))
    .attr('stroke', d => getNodeStroke(d));
  updateHeatmapLegend();
  updateSizeDescription();
});

function getConnected(id, depth) {
  const downMap = new Map([[id, 0]]);
  let downFrontier = new Set([id]);
  for (let d = 0; d < depth; d++) {
    const next = new Set();
    links.forEach(l => {
      if (!edgeVisibility[l.type]) return;
      const src = typeof l.source === 'object' ? l.source.id : nodes[l.source].id;
      const tgt = typeof l.target === 'object' ? l.target.id : nodes[l.target].id;
      if (downFrontier.has(src) && !downMap.has(tgt)) { downMap.set(tgt, d + 1); next.add(tgt); }
    });
    if (next.size === 0) break;
    downFrontier = next;
  }

  const upMap = new Map([[id, 0]]);
  let upFrontier = new Set([id]);
  for (let d = 0; d < depth; d++) {
    const next = new Set();
    links.forEach(l => {
      if (!edgeVisibility[l.type]) return;
      const src = typeof l.source === 'object' ? l.source.id : nodes[l.source].id;
      const tgt = typeof l.target === 'object' ? l.target.id : nodes[l.target].id;
      if (upFrontier.has(tgt) && !upMap.has(src)) { upMap.set(src, d + 1); next.add(src); }
    });
    if (next.size === 0) break;
    upFrontier = next;
  }

  const merged = new Map(downMap);
  upMap.forEach((dep, nid) => {
    if (!merged.has(nid) || dep < merged.get(nid)) merged.set(nid, dep);
  });
  return merged;
}

function getDepth() {
  return Math.max(1, parseInt(document.getElementById('depth').value) || 1);
}

function highlightNode(d) {
  link.interrupt();
  const depth = getDepth();
  const conn = getConnected(d.id, depth);
  node.classed('dimmed', n => !conn.has(n.id));
  link.classed('dimmed', l => {
    const s = typeof l.source === 'object' ? l.source.id : nodes[l.source].id;
    const t = typeof l.target === 'object' ? l.target.id : nodes[l.target].id;
    return !(conn.has(s) && conn.has(t));
  });
  link.classed('highlighted', l => {
    const s = typeof l.source === 'object' ? l.source.id : nodes[l.source].id;
    const t = typeof l.target === 'object' ? l.target.id : nodes[l.target].id;
    return conn.has(s) && conn.has(t);
  });
  updateMarkers();

  const edgesBySource = {};
  link.filter('.highlighted').each(function(l) {
    const src = typeof l.source === 'object' ? l.source.id : nodes[l.source].id;
    const tgt = typeof l.target === 'object' ? l.target.id : nodes[l.target].id;
    const srcDepth = conn.get(src) ?? Infinity;
    const tgtDepth = conn.get(tgt) ?? Infinity;
    const outward = srcDepth <= tgtDepth;
    const origin = outward ? src : tgt;
    if (!edgesBySource[origin]) edgesBySource[origin] = [];
    edgesBySource[origin].push({ el: d3.select(this), l, outward });
    d3.select(this).style('stroke-opacity', 0).attr('marker-end', null);
  });

  const animated = new Set();
  function animateFrom(nodeId) {
    const edges = edgesBySource[nodeId];
    if (!edges) return;
    edges.forEach(e => {
      const el = e.el;
      if (animated.has(el.node())) return;
      animated.add(el.node());
      const x1 = +el.attr('x1'), y1 = +el.attr('y1');
      const x2 = +el.attr('x2'), y2 = +el.attr('y2');
      const len = Math.hypot(x2 - x1, y2 - y1);
      if (len === 0) return;
      const src = typeof e.l.source === 'object' ? e.l.source.id : nodes[e.l.source].id;
      const tgt = typeof e.l.target === 'object' ? e.l.target.id : nodes[e.l.target].id;
      const destId = e.outward ? tgt : src;
      el.style('stroke-opacity', null)
        .style('stroke-dasharray', len)
        .style('stroke-dashoffset', e.outward ? len : -len);
      el.transition()
        .delay(100 + Math.random() * 500)
        .duration(300 + Math.random() * 500)
        .ease(d3.easeCubicOut)
        .style('stroke-dashoffset', 0)
        .on('end', function() {
          const self = d3.select(this);
          self.style('stroke-dasharray', null).style('stroke-dashoffset', null);
          if (arrowsEnabled && e.l.type !== 'shares_code') self.attr('marker-end', 'url(#arrow-hi-' + e.l.type + ')');
          animateFrom(destId);
        });
    });
  }
  animateFrom(d.id);
}

function clearHL() {
  link.interrupt();
  node.classed('dimmed', false);
  link.classed('dimmed', false).classed('highlighted', false);
  link.each(function() {
    const el = d3.select(this);
    el.style('stroke-opacity', null).style('stroke-dasharray', null).style('stroke-dashoffset', null);
  });
  updateMarkers();
}

let arrowsEnabled = true;
function updateMarkers() {
  link.attr('marker-end', function(l) {
    if (!arrowsEnabled) return null;
    if (l.type === 'shares_code' || l.type === 'uses_analytics') return null;
    if (d3.select(this).classed('dimmed')) return null;
    const isHL = d3.select(this).classed('highlighted');
    return 'url(#arrow-' + (isHL ? 'hi-' : '') + l.type + ')';
  });
}

document.getElementById('btn-arrows').addEventListener('click', () => {
  arrowsEnabled = !arrowsEnabled;
  document.getElementById('btn-arrows').classList.toggle('active', arrowsEnabled);
  updateMarkers();
});

document.getElementById('group-mode').addEventListener('change', e => {
  groupMode = e.target.value;
  applyGroupLayout();
});

let nodesVisible = true;
function applyNodeVisibility() {
  node.style('opacity', nodesVisible ? null : 0).style('pointer-events', nodesVisible ? null : 'none');
  link.style('opacity', nodesVisible ? null : 0);
  svg.node().classList.toggle('domain-only', !nodesVisible);
}
document.getElementById('btn-nodes').addEventListener('click', () => {
  nodesVisible = !nodesVisible;
  document.getElementById('btn-nodes').classList.toggle('active', nodesVisible);
  applyNodeVisibility();
});

document.getElementById('search').addEventListener('input', e => {
  const q = e.target.value.toLowerCase();
  if (!q) { clearHL(); return; }
  const matches = new Set();
  nodes.forEach(n => { if (n.id.toLowerCase().includes(q)) matches.add(n.id); });
  const conn = new Set(matches);
  links.forEach(l => {
    const s = typeof l.source === 'object' ? l.source.id : nodes[l.source].id;
    const t = typeof l.target === 'object' ? l.target.id : nodes[l.target].id;
    if (matches.has(s) || matches.has(t)) { conn.add(s); conn.add(t); }
  });
  node.classed('dimmed', n => !conn.has(n.id));
  link.classed('dimmed', l => {
    const s = typeof l.source === 'object' ? l.source.id : nodes[l.source].id;
    const t = typeof l.target === 'object' ? l.target.id : nodes[l.target].id;
    return !(matches.has(s) || matches.has(t));
  });
  link.classed('highlighted', l => {
    const s = typeof l.source === 'object' ? l.source.id : nodes[l.source].id;
    const t = typeof l.target === 'object' ? l.target.id : nodes[l.target].id;
    return matches.has(s) || matches.has(t);
  });
  updateMarkers();
});

document.querySelectorAll('[data-filter]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const type = btn.dataset.filter;
    if (type === 'all') { clearHL(); return; }
    const matches = new Set();
    nodes.forEach(n => { if (n.type === type) matches.add(n.id); });
    node.classed('dimmed', n => !matches.has(n.id));
    link.classed('dimmed', l => {
      const s = typeof l.source === 'object' ? l.source.id : nodes[l.source].id;
      const t = typeof l.target === 'object' ? l.target.id : nodes[l.target].id;
      return !(matches.has(s) && matches.has(t));
    });
    updateMarkers();
  });
});

document.getElementById('btn-reset').addEventListener('click', () => {
  selected = null; clearHL(); closeDetail();
  document.getElementById('search').value = '';
  document.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('active'));
  document.querySelector('[data-filter="all"]').classList.add('active');
  document.getElementById('size-mode').value = 'edges';
  groupMode = 'domain';
  document.getElementById('group-mode').value = 'domain';
  nodes.forEach(n => { n.r = calcRadius(n); });
  node.select('circle').attr('r', d => d.r).attr('fill', d => getNodeColor(d)).attr('stroke', d => getNodeStroke(d));
  node.select('text').attr('dx', d => d.r + 3).attr('font-size', d => d.r > 8 ? '10px' : '8px');
  updateHeatmapLegend();
  if (!nodesVisible) {
    nodesVisible = true;
    document.getElementById('btn-nodes').classList.add('active');
    applyNodeVisibility();
  }
  edgeVisibility = { ...defaultEdgeVisibility };
  saveEdgeVisibility();
  buildEdgePanelItems();
  applyEdgeDisplay();
  applyGroupLayout();
  svg.transition().duration(500).call(zoomBehavior.transform, d3.zoomIdentity);
});

// Guide sidebar
const guideEl = document.getElementById('guide');
document.getElementById('btn-guide').addEventListener('click', () => {
  guideEl.classList.toggle('open');
  document.getElementById('btn-guide').classList.toggle('active', guideEl.classList.contains('open'));
});
document.getElementById('guide-close').addEventListener('click', () => {
  guideEl.classList.remove('open');
  document.getElementById('btn-guide').classList.remove('active');
});
document.querySelectorAll('.guide-toggle').forEach(btn => {
  btn.addEventListener('click', () => {
    const expanded = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', String(!expanded));
    btn.nextElementSibling.classList.toggle('open', !expanded);
  });
});

// Detail sidebar
const detailEl = document.getElementById('detail');
const detailTitle = document.getElementById('detail-title');
const detailBody = document.getElementById('detail-body');
function openDetail(d) {
  detailTitle.textContent = d.id;
  detailTitle.style.color = color[d.type];
  detailBody.innerHTML = buildNodeContent(d, { interactive: true });
  detailEl.classList.add('open');
}
function closeDetail() {
  detailEl.classList.remove('open');
}
document.getElementById('detail-close').addEventListener('click', () => {
  closeDetail();
  selected = null;
  clearHL();
});

// EE toggle
const hasEe = nodes.some(n => n.ee);
if (hasEe) {
  document.getElementById('btn-ee').style.display = '';
  document.getElementById('sep-ee').style.display = '';
  const eeBtn = document.getElementById('btn-ee');
  eeBtn.classList.add('active');
  function applyEeNodeVisibility() {
    node.each(function(d) {
      if (d.ee) {
        d3.select(this).style('display', eeVisible ? null : 'none');
      }
    });
    applyEdgeDisplay();
  }
  applyEeNodeVisibility();
  eeBtn.addEventListener('click', () => {
    eeVisible = !eeVisible;
    eeBtn.classList.toggle('active', eeVisible);
    applyEeNodeVisibility();
  });
}

applyEdgeDisplay();

function padHull(points, pad) {
  if (points.length < 3) return points;
  const cx = d3.mean(points, p => p[0]);
  const cy = d3.mean(points, p => p[1]);
  return points.map(p => {
    const dx = p[0] - cx, dy = p[1] - cy;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    return [p[0] + dx / len * pad, p[1] + dy / len * pad];
  });
}

function smoothHull(points) {
  if (points.length < 3) return '';
  const n = points.length;
  let d = 'M' + points[0].join(',');
  for (let i = 0; i < n; i++) {
    const p0 = points[i];
    const p1 = points[(i + 1) % n];
    const p2 = points[(i + 2) % n];
    const mx1 = (p0[0] + p1[0]) / 2, my1 = (p0[1] + p1[1]) / 2;
    const mx2 = (p1[0] + p2[0]) / 2, my2 = (p1[1] + p2[1]) / 2;
    if (i === 0) d = 'M' + mx1 + ',' + my1;
    d += ' Q' + p1[0] + ',' + p1[1] + ' ' + mx2 + ',' + my2;
  }
  return d + 'Z';
}

sim.on('tick', () => {
  link.each(function(d) {
    const dx = d.target.x - d.source.x;
    const dy = d.target.y - d.source.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const r = d.target.r || 6;
    const el = d3.select(this);
    el.attr('x1', d.source.x).attr('y1', d.source.y)
      .attr('x2', d.target.x - dx / len * r)
      .attr('y2', d.target.y - dy / len * r);
  });
  linkHit.each(function(d) {
    const dx = d.target.x - d.source.x;
    const dy = d.target.y - d.source.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const r = d.target.r || 6;
    d3.select(this).attr('x1', d.source.x).attr('y1', d.source.y)
      .attr('x2', d.target.x - dx / len * r)
      .attr('y2', d.target.y - dy / len * r);
  });
  node.attr('transform', d => `translate(${d.x},${d.y})`);

  hullLayer.selectAll('*').remove();
  if (groupMode === 'domain') {
    domainNames.forEach(name => {
      const pts = nodes.filter(n => n.domain === name).map(n => [n.x, n.y]);
      if (pts.length < 2) return;
      if (pts.length === 2) {
        const [a, b] = pts;
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const nx = -dy / len * 25, ny = dx / len * 25;
        const expanded = [[a[0]+nx,a[1]+ny],[b[0]+nx,b[1]+ny],[b[0]-nx,b[1]-ny],[a[0]-nx,a[1]-ny]];
        hullLayer.append('path')
          .attr('class', 'domain-hull')
          .attr('d', 'M' + expanded.map(p => p.join(',')).join('L') + 'Z')
          .attr('fill', domainColor[name]).attr('fill-opacity', 0.04)
          .attr('stroke', domainColor[name]).attr('stroke-opacity', 0.15)
          .attr('stroke-width', 1);
      } else {
        const hull = d3.polygonHull(pts);
        if (hull) {
          const padded = padHull(hull, 25);
          hullLayer.append('path')
            .attr('class', 'domain-hull')
            .attr('d', smoothHull(padded))
            .attr('fill', domainColor[name]).attr('fill-opacity', 0.04)
            .attr('stroke', domainColor[name]).attr('stroke-opacity', 0.15)
            .attr('stroke-width', 1);
        }
      }
      const cx = d3.mean(pts, p => p[0]);
      const cy = d3.mean(pts, p => p[1]);
      const minY = d3.min(pts, p => p[1]);
      hullLayer.append('text')
        .attr('class', 'domain-label')
        .attr('x', cx).attr('y', minY - 18)
        .attr('fill', domainColor[name]).attr('fill-opacity', 0.6)
        .text(name);
    });
  } else {
    layerTypes.forEach(type => {
      const pts = nodes.filter(n => n.type === type).map(n => [n.x, n.y]);
      if (pts.length < 2) return;
      if (pts.length === 2) {
        const [a, b] = pts;
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const nx = -dy / len * 25, ny = dx / len * 25;
        const expanded = [[a[0]+nx,a[1]+ny],[b[0]+nx,b[1]+ny],[b[0]-nx,b[1]-ny],[a[0]-nx,a[1]-ny]];
        hullLayer.append('path')
          .attr('class', 'domain-hull')
          .attr('d', 'M' + expanded.map(p => p.join(',')).join('L') + 'Z')
          .attr('fill', color[type]).attr('fill-opacity', 0.04)
          .attr('stroke', color[type]).attr('stroke-opacity', 0.15)
          .attr('stroke-width', 1);
      } else {
        const hull = d3.polygonHull(pts);
        if (hull) {
          const padded = padHull(hull, 25);
          hullLayer.append('path')
            .attr('class', 'domain-hull')
            .attr('d', smoothHull(padded))
            .attr('fill', color[type]).attr('fill-opacity', 0.04)
            .attr('stroke', color[type]).attr('stroke-opacity', 0.15)
            .attr('stroke-width', 1);
        }
      }
      const cx = d3.mean(pts, p => p[0]);
      const cy = d3.mean(pts, p => p[1]);
      const minY = d3.min(pts, p => p[1]);
      hullLayer.append('text')
        .attr('class', 'domain-label')
        .attr('x', cx).attr('y', minY - 18)
        .attr('fill', color[type]).attr('fill-opacity', 0.6)
        .text(layerLabels[type]);
    });
  }
});

// Edge visibility panel
const edgePanel = document.getElementById('edge-panel');
const edgePanelList = document.getElementById('edge-panel-list');
const edgeBtn = document.getElementById('btn-edges');

function buildEdgePanelItems() {
  edgePanelList.innerHTML = '';
  edgeTypes.forEach(({ type, color: c }) => {
    const item = document.createElement('div');
    item.className = 'edge-panel-item' + (edgeVisibility[type] ? ' checked' : '');
    item.innerHTML = '<div class="edge-panel-check">✓</div>'
      + '<div class="edge-panel-dot" style="background:' + c + '"></div>'
      + '<span>' + type + '</span>';
    item.addEventListener('click', (ev) => {
      ev.stopPropagation();
      edgeVisibility[type] = !edgeVisibility[type];
      item.classList.toggle('checked', edgeVisibility[type]);
      saveEdgeVisibility();
      applyEdgeDisplay();
    });
    edgePanelList.appendChild(item);
  });
}
buildEdgePanelItems();

edgeBtn.addEventListener('click', (ev) => {
  ev.stopPropagation();
  const isOpen = edgePanel.classList.contains('open');
  if (isOpen) { edgePanel.classList.remove('open'); return; }
  const rect = edgeBtn.getBoundingClientRect();
  edgePanel.style.top = (rect.bottom + 6) + 'px';
  edgePanel.style.left = Math.max(8, rect.left) + 'px';
  edgePanel.classList.add('open');
});

edgePanel.addEventListener('click', (ev) => { ev.stopPropagation(); });

document.addEventListener('click', () => { edgePanel.classList.remove('open'); });

document.getElementById('edge-show-all').addEventListener('click', () => {
  edgeTypes.forEach(({ type }) => { edgeVisibility[type] = true; });
  saveEdgeVisibility();
  buildEdgePanelItems();
  applyEdgeDisplay();
});

document.getElementById('edge-show-core').addEventListener('click', () => {
  edgeVisibility = { ...defaultEdgeVisibility };
  saveEdgeVisibility();
  buildEdgePanelItems();
  applyEdgeDisplay();
});

document.getElementById('edge-hide-all').addEventListener('click', () => {
  edgeTypes.forEach(({ type }) => { edgeVisibility[type] = false; });
  saveEdgeVisibility();
  buildEdgePanelItems();
  applyEdgeDisplay();
});
