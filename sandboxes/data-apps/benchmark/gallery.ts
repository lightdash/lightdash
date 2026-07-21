/**
 * Blinded screenshot gallery for a benchmark run: one row per prompt×rep,
 * one card per variant in deterministically-shuffled order with blinded
 * labels. You vote for the best card per row; "Reveal" shows which variant
 * each card was and tallies wins. Votes persist in localStorage.
 *
 *   npx tsx benchmark/gallery.ts runs/<timestamp>/
 *
 * Reads screenshots/ + render/*.json (from renderGate.ts) and results.json
 * (build gate); writes <runDir>/gallery.html referencing screenshots
 * relatively, so the file works straight from disk.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type GalleryEntry = {
    variant: string;
    cell: string;
    screenshot: string | null;
    badges: string[];
};

type GalleryRow = {
    id: string;
    promptId: string;
    rep: number;
    entries: GalleryEntry[];
};

const CELL_RE = /^(.*)__([a-z0-9-]+)__r(\d+)$/i;

const hashStr = (s: string): number => {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i += 1) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
};

function shuffled<T>(items: T[], seed: number): T[] {
    const out = [...items];
    let t = seed >>> 0;
    const rand = () => {
        t = (t + 0x6d2b79f5) >>> 0;
        let x = Math.imul(t ^ (t >>> 15), t | 1);
        x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
        return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = out.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rand() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

const esc = (s: string): string =>
    s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

function readJsonIfExists<T>(filePath: string): T | null {
    if (!fs.existsSync(filePath)) return null;
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
    } catch {
        return null;
    }
}

function collectRows(runDir: string): GalleryRow[] {
    // Cell universe: every source that knows about a cell contributes, so
    // failed builds still show up as placeholders.
    const cells = new Set<string>();
    const results =
        readJsonIfExists<
            { variant: string; promptId: string; rep: number; rules?: Record<string, boolean> }[]
        >(path.join(runDir, 'results.json')) ?? [];
    for (const r of results) {
        cells.add(`${r.variant}__${r.promptId}__r${r.rep}`);
    }
    for (const dir of ['screenshots', 'render', 'dist', 'src']) {
        const full = path.join(runDir, dir);
        if (!fs.existsSync(full)) continue;
        for (const name of fs.readdirSync(full)) {
            cells.add(name.replace(/\.(png|json)$/, ''));
        }
    }

    const buildRules = new Map<string, Record<string, boolean>>();
    for (const r of results) {
        buildRules.set(
            `${r.variant}__${r.promptId}__r${r.rep}`,
            r.rules ?? {},
        );
    }

    const rows = new Map<string, GalleryRow>();
    for (const cell of [...cells].sort()) {
        const match = cell.match(CELL_RE);
        if (!match) continue;
        const [, variant, promptId, repStr] = match;
        const rep = Number(repStr);
        const rowId = `${promptId}__r${rep}`;

        const screenshotRel = `screenshots/${cell}.png`;
        const hasScreenshot = fs.existsSync(path.join(runDir, screenshotRel));
        const render = readJsonIfExists<{ rules?: Record<string, boolean> }>(
            path.join(runDir, 'render', `${cell}.json`),
        );

        const badges: string[] = [];
        const rules = { ...buildRules.get(cell), ...render?.rules };
        if (rules['build-passes'] === false) badges.push('build ✗');
        if (rules['renders-clean'] === false) badges.push('render ✗');
        if (rules['queries-valid-fields'] === false) badges.push('queries ✗');
        if (rules['made-metric-queries'] === false) badges.push('no queries');
        if (!hasScreenshot) badges.push('no screenshot');

        if (!rows.has(rowId)) {
            rows.set(rowId, { id: rowId, promptId, rep, entries: [] });
        }
        rows.get(rowId)!.entries.push({
            variant,
            cell,
            screenshot: hasScreenshot ? screenshotRel : null,
            badges,
        });
    }

    return [...rows.values()].sort(
        (a, b) =>
            a.promptId.localeCompare(b.promptId) || a.rep - b.rep,
    );
}

export function writeGallery(runDir: string): string {
    const runId = path.basename(path.resolve(runDir));
    const rows = collectRows(runDir);

    const rowsHtml = rows
        .map((row) => {
            const entries = shuffled(row.entries, hashStr(row.id));
            const cards = entries
                .map((entry, i) => {
                    const blind = String.fromCharCode(65 + i);
                    const badges = entry.badges
                        .map((b) => `<span class="badge">${esc(b)}</span>`)
                        .join('');
                    const img = entry.screenshot
                        ? `<div class="shot"><img loading="lazy" src="${esc(entry.screenshot)}" alt="${esc(entry.cell)}"></div>`
                        : '<div class="missing">not built</div>';
                    const open = entry.screenshot
                        ? `<a class="open" href="${esc(entry.screenshot)}" target="_blank">open ↗</a>`
                        : '';
                    return [
                        `<div class="card" data-row="${esc(row.id)}" data-cell="${esc(entry.cell)}" data-variant="${esc(entry.variant)}">`,
                        `<div class="card-head"><span class="blind">${blind}</span><span class="variant-name">${esc(entry.variant)}</span>${badges}${open}</div>`,
                        img,
                        `<button class="vote" type="button">Pick ${blind}</button>`,
                        '</div>',
                    ].join('');
                })
                .join('\n');
            return [
                `<section class="row" data-row="${esc(row.id)}">`,
                `<h2>${esc(row.promptId)} <span class="rep">r${row.rep}</span></h2>`,
                `<div class="cards" style="--cols:${entries.length}">${cards}</div>`,
                '</section>',
            ].join('\n');
        })
        .join('\n');

    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Benchmark gallery — ${esc(runId)}</title>
<style>
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body { margin: 0; background: #101418; color: #dbe2e8; font: 14px/1.5 ui-sans-serif, system-ui, sans-serif; }
header { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 16px; padding: 12px 20px; background: #171c22; border-bottom: 1px solid #2a323b; }
header h1 { font-size: 15px; margin: 0; font-weight: 600; }
header .spacer { flex: 1; }
button { background: #2a323b; color: #dbe2e8; border: 1px solid #3a444f; border-radius: 6px; padding: 6px 12px; cursor: pointer; font: inherit; }
button:hover { background: #343e49; }
.row { padding: 18px 20px 6px; }
.row h2 { font-size: 14px; margin: 0 0 10px; font-weight: 600; }
.row .rep { color: #7b8794; font-weight: 400; }
.cards { display: grid; grid-template-columns: repeat(var(--cols), minmax(320px, 1fr)); gap: 14px; }
.card { background: #171c22; border: 1px solid #2a323b; border-radius: 10px; overflow: hidden; display: flex; flex-direction: column; }
.card.voted { border-color: #4c9aff; box-shadow: 0 0 0 1px #4c9aff; }
.card-head { display: flex; align-items: center; gap: 8px; padding: 8px 10px; }
.blind { font-weight: 700; color: #9fb3c8; }
.variant-name { display: none; color: #7ee2a8; font-weight: 600; }
body.revealed .variant-name { display: inline; }
.badge { background: #3b2a2a; color: #e8a0a0; border-radius: 5px; padding: 1px 7px; font-size: 12px; }
.card-head .open { margin-left: auto; color: #9fb3c8; font-size: 12px; text-decoration: none; }
.card-head .open:hover { color: #dbe2e8; }
.shot { max-height: 78vh; overflow-y: auto; background: #fff; }
.card img { display: block; width: 100%; height: auto; }
.missing { display: flex; align-items: center; justify-content: center; height: 200px; color: #7b8794; }
.vote { margin: 10px; }
#tally { display: none; padding: 12px 20px; }
body.revealed #tally { display: block; }
#tally table { border-collapse: collapse; }
#tally td, #tally th { border: 1px solid #2a323b; padding: 5px 12px; text-align: left; }
</style>
</head>
<body>
<header>
<h1>Blinded gallery — ${esc(runId)}</h1>
<span id="progress"></span>
<span class="spacer"></span>
<button id="clear" type="button">Clear votes</button>
<button id="reveal" type="button">Reveal variants</button>
</header>
<div id="tally"></div>
${rowsHtml}
<script>
(function () {
    'use strict';
    var KEY = 'bench-gallery:' + ${JSON.stringify(runId)};
    var votes = {};
    try { votes = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { votes = {}; }
    var save = function () { try { localStorage.setItem(KEY, JSON.stringify(votes)); } catch (e) {} };
    var rowCount = document.querySelectorAll('.row').length;

    function refresh() {
        document.querySelectorAll('.card').forEach(function (card) {
            var isVote = votes[card.dataset.row] === card.dataset.cell;
            card.classList.toggle('voted', isVote);
        });
        var voted = Object.keys(votes).length;
        document.getElementById('progress').textContent = voted + ' / ' + rowCount + ' rows voted';
        renderTally();
    }

    function renderTally() {
        var wins = {};
        var counted = 0;
        Object.keys(votes).forEach(function (rowId) {
            var card = document.querySelector('.card[data-row="' + CSS.escape(rowId) + '"][data-cell="' + CSS.escape(votes[rowId]) + '"]');
            if (!card) return;
            counted += 1;
            var v = card.dataset.variant;
            wins[v] = (wins[v] || 0) + 1;
        });
        var html = '<table><tr><th>variant</th><th>wins</th></tr>';
        Object.keys(wins).sort().forEach(function (v) {
            html += '<tr><td>' + v + '</td><td>' + wins[v] + ' / ' + counted + '</td></tr>';
        });
        html += '</table>';
        document.getElementById('tally').innerHTML = html;
    }

    document.querySelectorAll('.vote').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var card = btn.closest('.card');
            if (votes[card.dataset.row] === card.dataset.cell) {
                delete votes[card.dataset.row];
            } else {
                votes[card.dataset.row] = card.dataset.cell;
            }
            save();
            refresh();
        });
    });
    document.getElementById('reveal').addEventListener('click', function () {
        document.body.classList.toggle('revealed');
    });
    document.getElementById('clear').addEventListener('click', function () {
        votes = {};
        save();
        refresh();
    });
    refresh();
})();
</script>
</body>
</html>
`;

    const outPath = path.join(runDir, 'gallery.html');
    fs.writeFileSync(outPath, html);
    return outPath;
}

const isMain =
    process.argv[1] &&
    path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
    const runDir = path.resolve(process.argv[2] ?? '');
    if (!process.argv[2] || !fs.existsSync(runDir)) {
        console.error('Usage: npx tsx benchmark/gallery.ts <runDir>');
        process.exit(1);
    }
    console.log(`Gallery: ${writeGallery(runDir)}`);
}
