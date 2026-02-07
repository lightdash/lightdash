#!/usr/bin/env npx tsx
/**
 * Generates an interactive dependency graph of the Lightdash backend.
 *
 * Parses actual runtime DI wiring from:
 *   - ServiceRepository.ts  (service -> model/client/service injections)
 *   - Controller files       (controller -> service calls)
 *
 * Usage:
 *   npx tsx scripts/dep-graph.ts            # generates and opens in browser
 *   npx tsx scripts/dep-graph.ts --json     # outputs raw JSON to stdout
 *   npx tsx scripts/dep-graph.ts --out dir  # writes HTML to dir/dep-graph.html
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BACKEND_SRC = path.resolve(__dirname, '../packages/backend/src');
const SERVICE_REPO = path.join(
    BACKEND_SRC,
    'services/ServiceRepository.ts',
);
const CONTROLLERS_DIR = path.join(BACKEND_SRC, 'controllers');

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

interface ServiceDeps {
    models: string[];
    clients: string[];
    services: string[];
}

function parseServiceRepository(): Record<string, ServiceDeps> {
    const src = fs.readFileSync(SERVICE_REPO, 'utf-8');

    // Find each "public getXxx()" method boundary
    const methodRe = /public\s+(get\w+)\(\)/g;
    const starts: { pos: number; name: string }[] = [];
    let m: RegExpExecArray | null;
    while ((m = methodRe.exec(src)) !== null) {
        starts.push({ pos: m.index, name: m[1] });
    }

    const services: Record<string, ServiceDeps> = {};

    for (let i = 0; i < starts.length; i++) {
        const block = src.slice(
            starts[i].pos,
            i + 1 < starts.length ? starts[i + 1].pos : src.length,
        );

        // Must have getService('key', ...) call
        const keyMatch = block.match(/this\.getService\(\s*'(\w+)'/);
        if (!keyMatch) continue;
        const key = keyMatch[1];

        const models = unique(
            matchAll(block, /this\.models\.(get\w+)\(\)/g).map((x) =>
                x.slice(3),
            ),
        );
        const clients = unique(
            matchAll(block, /this\.clients\.(get\w+)\(\)/g).map((x) =>
                x.slice(3),
            ),
        );
        const svcDeps = unique(
            matchAll(block, /this\.(get\w+Service)\(\)/g)
                .filter((x) => x !== 'getService')
                .map((x) => x.slice(3)),
        );

        const displayName = key[0].toUpperCase() + key.slice(1);
        services[displayName] = { models, clients, services: svcDeps };
    }

    return services;
}

function parseControllers(): Record<string, string[]> {
    const controllers: Record<string, string[]> = {};

    const patterns = [
        path.join(CONTROLLERS_DIR, '*.ts'),
        path.join(CONTROLLERS_DIR, 'v2', '*.ts'),
    ];

    for (const pattern of patterns) {
        const dir = path.dirname(pattern);
        if (!fs.existsSync(dir)) continue;

        const files = fs.readdirSync(dir).filter((f) => f.endsWith('.ts'));
        for (const file of files) {
            if (
                file === 'baseController.ts' ||
                file === 'index.ts' ||
                file.includes('.test.') ||
                file.includes('.spec.')
            )
                continue;

            const fpath = path.join(dir, file);
            const content = fs.readFileSync(fpath, 'utf-8');

            const calls = unique(
                matchAll(content, /\.get(\w+Service)\(\)/g),
            );

            if (calls.length > 0) {
                const isV2 = dir.endsWith('v2');
                const name = file.replace('.ts', '');
                const displayName = isV2 ? `v2/${name}` : name;
                controllers[displayName] = calls.sort();
            }
        }
    }

    return controllers;
}

// ---------------------------------------------------------------------------
// Graph building
// ---------------------------------------------------------------------------

interface GraphNode {
    id: string;
    type: 'controller' | 'service' | 'model' | 'client';
}
interface GraphEdge {
    from: string;
    to: string;
    type: string;
}
interface GraphData {
    nodes: GraphNode[];
    edges: GraphEdge[];
    stats: {
        controllers: number;
        services: number;
        models: number;
        clients: number;
        totalEdges: number;
    };
}

function buildGraph(
    services: Record<string, ServiceDeps>,
    controllers: Record<string, string[]>,
): GraphData {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const nodeSet = new Set<string>();

    const addNode = (id: string, type: GraphNode['type']) => {
        if (!nodeSet.has(id)) {
            nodes.push({ id, type });
            nodeSet.add(id);
        }
    };

    // Add controllers
    for (const c of Object.keys(controllers).sort()) {
        addNode(c, 'controller');
    }

    // Add services
    for (const s of Object.keys(services).sort()) {
        addNode(s, 'service');
    }

    // Add models & clients from service deps
    for (const deps of Object.values(services)) {
        for (const m of deps.models) addNode(m, 'model');
        for (const c of deps.clients) addNode(c, 'client');
    }

    // Controller -> Service edges
    for (const [ctrl, svcs] of Object.entries(controllers)) {
        for (const svc of svcs) {
            if (nodeSet.has(svc)) {
                edges.push({ from: ctrl, to: svc, type: 'uses_service' });
            }
        }
    }

    // Service -> Model/Client/Service edges
    for (const [svc, deps] of Object.entries(services)) {
        for (const m of deps.models) {
            edges.push({ from: svc, to: m, type: 'injects_model' });
        }
        for (const c of deps.clients) {
            edges.push({ from: svc, to: c, type: 'injects_client' });
        }
        for (const s of deps.services) {
            if (nodeSet.has(s)) {
                edges.push({ from: svc, to: s, type: 'injects_service' });
            }
        }
    }

    const modelCount = nodes.filter((n) => n.type === 'model').length;
    const clientCount = nodes.filter((n) => n.type === 'client').length;

    return {
        nodes,
        edges,
        stats: {
            controllers: Object.keys(controllers).length,
            services: Object.keys(services).length,
            models: modelCount,
            clients: clientCount,
            totalEdges: edges.length,
        },
    };
}

// ---------------------------------------------------------------------------
// HTML template
// ---------------------------------------------------------------------------

function generateHtml(data: GraphData): string {
    const { controllers, services, models, clients, totalEdges } = data.stats;
    const json = JSON.stringify(data);

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Lightdash Backend — Dependency Graph</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif; background: #0d1117; color: #c9d1d9; overflow: hidden; }

#controls {
  position: fixed; top: 0; left: 0; right: 0; z-index: 10;
  background: #161b22ee; backdrop-filter: blur(8px);
  border-bottom: 1px solid #21262d;
  padding: 10px 16px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap;
}
#controls input[type=text] {
  background: #0d1117; border: 1px solid #30363d; color: #c9d1d9;
  padding: 6px 12px; border-radius: 6px; font-size: 13px; width: 220px;
}
#controls input:focus { outline: none; border-color: #58a6ff; }
.btn {
  background: #21262d; border: 1px solid #30363d; color: #8b949e;
  padding: 5px 12px; border-radius: 6px; font-size: 12px; cursor: pointer;
  transition: all 0.15s;
}
.btn:hover { background: #30363d; color: #c9d1d9; }
.btn.active { border-color: #58a6ff; color: #58a6ff; background: #1f6feb22; }
.sep { width: 1px; height: 20px; background: #30363d; }
#legend {
  position: fixed; bottom: 16px; right: 16px; z-index: 10;
  background: #161b22dd; backdrop-filter: blur(8px);
  border: 1px solid #21262d; border-radius: 8px;
  padding: 12px 16px; display: flex; flex-direction: column; gap: 6px;
}
.stat { font-size: 12px; color: #8b949e; }
.stat b { font-weight: 600; }
.stat-c b { color: #79c0ff; }
.stat-s b { color: #7ee787; }
.stat-m b { color: #ffa657; }
.stat-k b { color: #f778ba; }

#tooltip {
  position: fixed; background: #1c2128; border: 1px solid #30363d;
  border-radius: 8px; padding: 12px 16px; font-size: 12px;
  pointer-events: none; display: none; z-index: 20; max-width: 380px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.5); line-height: 1.5;
}
#tooltip h3 { font-size: 14px; margin-bottom: 4px; }
#tooltip .t-section { color: #8b949e; margin-top: 6px; font-size: 11px; text-transform: uppercase; font-weight: 600; }
#tooltip .t-item { color: #c9d1d9; padding-left: 10px; }

svg { width: 100vw; height: 100vh; }

.link { stroke-opacity: 0.12; stroke-width: 1; }
.link-uses_service { stroke: #79c0ff; }
.link-injects_model { stroke: #ffa657; }
.link-injects_client { stroke: #f778ba; }
.link-injects_service { stroke: #7ee787; stroke-dasharray: 4,3; }
.link.highlighted { stroke-opacity: 0.85; stroke-width: 2; }
.link.dimmed { stroke-opacity: 0.02; }

.node circle { stroke-width: 1.5; transition: opacity 0.2s; }
.node text { pointer-events: none; transition: opacity 0.2s; }
.node.dimmed circle, .node.dimmed text { opacity: 0.06; }
</style>
</head>
<body>
<div id="controls">
  <input type="text" id="search" placeholder="Search...">
  <div class="sep"></div>
  <button class="btn active" data-filter="all">All</button>
  <button class="btn" data-filter="controller">Controllers</button>
  <button class="btn" data-filter="service">Services</button>
  <button class="btn" data-filter="model">Models</button>
  <button class="btn" data-filter="client">Clients</button>
  <div class="sep"></div>
  <button class="btn" id="btn-reset">Reset</button>
</div>
<div id="legend">
  <span class="stat stat-c"><b>${controllers}</b> controllers</span>
  <span class="stat stat-s"><b>${services}</b> services</span>
  <span class="stat stat-m"><b>${models}</b> models</span>
  <span class="stat stat-k"><b>${clients}</b> clients</span>
  <span class="stat"><b>${totalEdges}</b> edges</span>
</div>
<div id="tooltip"></div>
<svg></svg>

<script src="https://d3js.org/d3.v7.min.js"></script>
<script>
const raw = ${json};

const color = { controller: '#79c0ff', service: '#7ee787', model: '#ffa657', client: '#f778ba' };
const colorDark = { controller: '#1f6feb', service: '#238636', model: '#9e6a03', client: '#da3633' };

const W = window.innerWidth, H = window.innerHeight;

const nodeIdx = {};
raw.nodes.forEach((n, i) => { nodeIdx[n.id] = i; });

const connCount = {};
raw.edges.forEach(e => {
  connCount[e.from] = (connCount[e.from] || 0) + 1;
  connCount[e.to] = (connCount[e.to] || 0) + 1;
});

const nodes = raw.nodes.map(n => ({
  ...n,
  r: Math.max(4, 3 + Math.sqrt(connCount[n.id] || 1) * 2.2)
}));

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

const svg = d3.select('svg').attr('width', W).attr('height', H);
const g = svg.append('g');
const zoomBehavior = d3.zoom().scaleExtent([0.05, 10]).on('zoom', e => g.attr('transform', e.transform));
svg.call(zoomBehavior);

const colX = { controller: W * 0.12, service: W * 0.38, model: W * 0.68, client: W * 0.88 };

const sim = d3.forceSimulation(nodes)
  .force('link', d3.forceLink(links).distance(100).strength(0.15))
  .force('charge', d3.forceManyBody().strength(-350).distanceMax(600))
  .force('center', d3.forceCenter(W / 2, H / 2).strength(0.01))
  .force('collision', d3.forceCollide().radius(d => d.r + 25).strength(0.9).iterations(2))
  .force('x', d3.forceX(d => colX[d.type] || W/2).strength(0.2))
  .force('y', d3.forceY(H / 2).strength(0.05));

['Controllers', 'Services', 'Models', 'Clients'].forEach((label, i) => {
  const types = ['controller', 'service', 'model', 'client'];
  g.append('text')
    .attr('x', colX[types[i]])
    .attr('y', 30)
    .attr('text-anchor', 'middle')
    .attr('fill', color[types[i]])
    .attr('font-size', '13px')
    .attr('font-weight', '600')
    .attr('opacity', 0.4)
    .text(label);
});

const link = g.append('g').selectAll('line').data(links).join('line')
  .attr('class', d => 'link link-' + d.type);

let dragged = false;
const node = g.append('g').selectAll('g').data(nodes).join('g')
  .attr('class', 'node')
  .call(d3.drag()
    .on('start', (e, d) => { dragged = false; d.fx = d.x; d.fy = d.y; })
    .on('drag', (e, d) => { dragged = true; if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = e.x; d.fy = e.y; })
    .on('end', (e, d) => { if (!e.active) sim.alphaTarget(0); if (!dragged) { d.fx = null; d.fy = null; } }));

node.append('circle')
  .attr('r', d => d.r)
  .attr('fill', d => color[d.type])
  .attr('stroke', d => colorDark[d.type])
  .attr('stroke-width', 1.5);

node.append('text')
  .text(d => d.id)
  .attr('dx', d => d.r + 3)
  .attr('dy', 3)
  .attr('fill', d => color[d.type])
  .attr('font-size', d => d.r > 8 ? '10px' : '8px')
  .attr('opacity', 0.7);

const tip = d3.select('#tooltip');

node.on('mouseover', (ev, d) => {
  const out = outgoing[d.id] || [];
  const inc = incoming[d.id] || [];
  let h = '<h3 style="color:' + color[d.type] + '">' + d.id + '</h3>';
  h += '<span style="color:#8b949e">' + d.type + '</span>';
  if (out.length) {
    const byType = {};
    out.forEach(o => { if (!byType[o.type]) byType[o.type] = []; byType[o.type].push(o.id); });
    for (const [t, ids] of Object.entries(byType)) {
      const label = t.replace('injects_','').replace('uses_','uses ');
      h += '<div class="t-section">' + label + 's (' + ids.length + ')</div>';
      ids.sort().forEach(id => { h += '<div class="t-item">' + id + '</div>'; });
    }
  }
  if (inc.length) {
    h += '<div class="t-section">used by (' + inc.length + ')</div>';
    inc.sort((a,b) => a.id.localeCompare(b.id)).forEach(i => {
      h += '<div class="t-item">' + i.id + ' <span style="color:#484f58">(' + i.type.replace('injects_','').replace('uses_','') + ')</span></div>';
    });
  }
  tip.html(h).style('display', 'block');
})
.on('mousemove', ev => {
  const x = Math.min(ev.clientX + 16, W - 400);
  tip.style('left', x + 'px').style('top', (ev.clientY - 10) + 'px');
})
.on('mouseout', () => tip.style('display', 'none'));

let selected = null;
node.on('click', (ev, d) => {
  ev.stopPropagation();
  if (selected === d.id) { selected = null; clearHL(); return; }
  selected = d.id;
  highlightNode(d);
});
svg.on('click', () => { selected = null; clearHL(); });

function getConnected(id) {
  const s = new Set([id]);
  links.forEach(l => {
    const src = typeof l.source === 'object' ? l.source.id : nodes[l.source].id;
    const tgt = typeof l.target === 'object' ? l.target.id : nodes[l.target].id;
    if (src === id || tgt === id) { s.add(src); s.add(tgt); }
  });
  return s;
}

function highlightNode(d) {
  const conn = getConnected(d.id);
  node.classed('dimmed', n => !conn.has(n.id));
  link.classed('dimmed', l => {
    const s = typeof l.source === 'object' ? l.source.id : nodes[l.source].id;
    const t = typeof l.target === 'object' ? l.target.id : nodes[l.target].id;
    return !(s === d.id || t === d.id);
  });
  link.classed('highlighted', l => {
    const s = typeof l.source === 'object' ? l.source.id : nodes[l.source].id;
    const t = typeof l.target === 'object' ? l.target.id : nodes[l.target].id;
    return s === d.id || t === d.id;
  });
}

function clearHL() {
  node.classed('dimmed', false);
  link.classed('dimmed', false).classed('highlighted', false);
}

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
});

document.querySelectorAll('[data-filter]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const type = btn.dataset.filter;
    if (type === 'all') { clearHL(); return; }
    const matches = new Set();
    nodes.forEach(n => { if (n.type === type) matches.add(n.id); });
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
  });
});

document.getElementById('btn-reset').addEventListener('click', () => {
  selected = null; clearHL();
  document.getElementById('search').value = '';
  document.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('active'));
  document.querySelector('[data-filter="all"]').classList.add('active');
  svg.transition().duration(500).call(zoomBehavior.transform, d3.zoomIdentity);
});

sim.on('tick', () => {
  link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
  node.attr('transform', d => \`translate(\${d.x},\${d.y})\`);
});
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function matchAll(str: string, re: RegExp): string[] {
    const results: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(str)) !== null) {
        results.push(m[1]);
    }
    return results;
}

function unique(arr: string[]): string[] {
    return [...new Set(arr)].sort();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const jsonOnly = args.includes('--json');
const outIdx = args.indexOf('--out');
const outDir = outIdx >= 0 ? args[outIdx + 1] : null;

const services = parseServiceRepository();
const controllers = parseControllers();
const graph = buildGraph(services, controllers);

if (jsonOnly) {
    process.stdout.write(JSON.stringify(graph, null, 2));
    process.exit(0);
}

const html = generateHtml(graph);

const outputPath = outDir
    ? path.resolve(outDir, 'dep-graph.html')
    : path.join('/tmp', 'lightdash-dep-graph.html');

if (outDir) {
    fs.mkdirSync(outDir, { recursive: true });
}
fs.writeFileSync(outputPath, html);

console.log(
    `Generated: ${graph.stats.controllers} controllers, ` +
        `${graph.stats.services} services, ${graph.stats.models} models, ` +
        `${graph.stats.clients} clients (${graph.stats.totalEdges} edges)`,
);
console.log(`Written to: ${outputPath}`);

// Open in browser
const platform = process.platform;
const openCmd =
    platform === 'darwin'
        ? 'open'
        : platform === 'win32'
          ? 'start'
          : 'xdg-open';
try {
    execSync(`${openCmd} "${outputPath}"`);
} catch {
    // silent — might be running headless
}
