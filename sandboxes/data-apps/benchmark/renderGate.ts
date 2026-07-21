/**
 * Render gate: load each benchmark cell's built app (dist/) in headless
 * Chromium under a mock Lightdash host (mockHost.ts + harness.js) and score
 * what actually happens at runtime — uncaught errors, error-boundary trips,
 * blank screens, and whether the queries the app issues reference real
 * catalog fields. Also captures a full-height screenshot per cell for the
 * gallery.
 *
 * Used inline by run.ts after a benchmark run, or standalone to (re)render
 * an existing run directory:
 *
 *   npx tsx benchmark/renderGate.ts runs/<timestamp>/
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from 'playwright';
import { writeGallery } from './gallery.ts';
import {
    buildHarnessHtml,
    loadChartFixtures,
    parseCatalog,
} from './mockHost.ts';

const BENCH_DIR = path.dirname(fileURLToPath(import.meta.url));

export type IssuedQuery = {
    kind: 'metric' | 'chart' | 'underlying';
    exploreName: string | null;
    dimensions: string[];
    metrics: string[];
    limit: number | null;
    unknownExplore: boolean;
    unknownChart?: boolean;
    invalidFields: string[];
    rowCount: number;
};

export type RenderResult = {
    cell: string;
    /** Harness-level failure (navigation, missing dist, …); null when the page ran. */
    error: string | null;
    settled: boolean;
    durationMs: number;
    pageErrors: string[];
    consoleErrors: string[];
    fatalMarker: boolean;
    boundaryMarker: boolean;
    rootChildren: number;
    rootTextLength: number;
    queries: IssuedQuery[];
    blockedFetches: string[];
    exports: unknown[];
    screenshot: string | null;
    rules: Record<string, boolean>;
};

export function renderRules(
    result: Omit<RenderResult, 'rules'>,
): Record<string, boolean> {
    return {
        'renders-clean':
            result.error === null &&
            result.pageErrors.length === 0 &&
            !result.fatalMarker &&
            !result.boundaryMarker &&
            result.rootChildren > 0,
        'made-metric-queries': result.queries.some(
            (q) => q.kind === 'metric' || q.kind === 'chart',
        ),
        // Vacuously true with no queries — made-metric-queries covers that.
        'queries-valid-fields': result.queries.every(
            (q) =>
                !q.unknownExplore &&
                !q.unknownChart &&
                q.invalidFields.length === 0,
        ),
    };
}

const MIME_TYPES: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
    '.json': 'application/json',
    '.map': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.txt': 'text/plain',
};

const promptIdOfCell = (cell: string): string | null =>
    cell.match(/__([a-z0-9-]+)__r\d+$/i)?.[1] ?? null;

async function renderCell(
    browser: Browser,
    runDir: string,
    cell: string,
    harnessHtml: string,
): Promise<RenderResult> {
    const distDir = path.join(runDir, 'dist', cell);
    const screenshotDir = path.join(runDir, 'screenshots');
    const renderDir = path.join(runDir, 'render');
    fs.mkdirSync(screenshotDir, { recursive: true });
    fs.mkdirSync(renderDir, { recursive: true });

    const result: Omit<RenderResult, 'rules'> = {
        cell,
        error: null,
        settled: false,
        durationMs: 0,
        pageErrors: [],
        consoleErrors: [],
        fatalMarker: false,
        boundaryMarker: false,
        rootChildren: 0,
        rootTextLength: 0,
        queries: [],
        blockedFetches: [],
        exports: [],
        screenshot: null,
    };
    const startedAt = Date.now();
    let context: Awaited<ReturnType<Browser['newContext']>> | null = null;

    try {
        context = await browser.newContext({
            viewport: { width: 1440, height: 900 },
        });
        await context.route('**/*', async (route) => {
            const url = new URL(route.request().url());
            if (url.hostname !== 'ldbench.test') {
                await route.fulfill({ status: 404, body: '' });
                return;
            }
            if (url.pathname === '/' || url.pathname === '/index.html') {
                await route.fulfill({
                    contentType: 'text/html',
                    body: harnessHtml,
                });
                return;
            }
            if (url.pathname === '/favicon.ico') {
                await route.fulfill({ status: 204, body: '' });
                return;
            }
            if (url.pathname.startsWith('/app/')) {
                const rel =
                    decodeURIComponent(url.pathname.slice('/app/'.length)) ||
                    'index.html';
                const filePath = path.resolve(distDir, rel);
                if (
                    filePath.startsWith(distDir + path.sep) &&
                    fs.existsSync(filePath) &&
                    fs.statSync(filePath).isFile()
                ) {
                    await route.fulfill({
                        contentType:
                            MIME_TYPES[path.extname(filePath)] ??
                            'application/octet-stream',
                        body: fs.readFileSync(filePath),
                    });
                    return;
                }
            }
            await route.fulfill({ status: 404, body: '' });
        });

        const page = await context.newPage();
        page.on('pageerror', (err) => {
            if (result.pageErrors.length < 20) {
                result.pageErrors.push(String(err.message ?? err).slice(0, 300));
            }
        });
        page.on('console', (msg) => {
            if (msg.type() !== 'error') return;
            const text = msg.text();
            if (text.includes('[lightdash] fatal app error:')) {
                result.fatalMarker = true;
            }
            if (text.includes('render error caught by ErrorBoundary')) {
                result.boundaryMarker = true;
            }
            if (result.consoleErrors.length < 20) {
                result.consoleErrors.push(text.slice(0, 300));
            }
        });

        // https so the page is a secure context — the SDK's postMessage
        // adapter needs crypto.randomUUID. Playwright fulfills the routed
        // requests directly; no real TLS handshake happens.
        await page.goto('https://ldbench.test/', {
            waitUntil: 'load',
            timeout: 15_000,
        });

        // Settle: quiet on the postMessage channel for 3s with a mounted root,
        // after at least 5s total; hard cap 30s.
        const readState = () =>
            page.evaluate(() => {
                /* eslint-disable @typescript-eslint/no-explicit-any */
                const w = window as any;
                const bench = w.__bench ?? {};
                let rootChildren = 0;
                let rootTextLength = 0;
                try {
                    const frame = document.getElementById(
                        'app-frame',
                    ) as any;
                    const root =
                        frame?.contentDocument?.getElementById('root');
                    if (root) {
                        rootChildren = root.childElementCount;
                        rootTextLength = (root.innerText ?? '').length;
                    }
                } catch {
                    // cross-origin shouldn't happen; treat as unmounted
                }
                return {
                    activityAt: bench.activityAt ?? 0,
                    queries: bench.queries ?? [],
                    blocked: bench.blocked ?? [],
                    exports: bench.exports ?? [],
                    rootChildren,
                    rootTextLength,
                };
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

        const deadline = Date.now() + 30_000;
        while (Date.now() < deadline) {
            await page.waitForTimeout(500);
            const s = await readState();
            result.rootChildren = s.rootChildren;
            result.rootTextLength = s.rootTextLength;
            if (
                Date.now() - startedAt > 5_000 &&
                Date.now() - s.activityAt > 3_000 &&
                s.rootChildren > 0
            ) {
                result.settled = true;
                break;
            }
        }

        // Let chart mount animations finish before capturing.
        await page.waitForTimeout(1_500);

        const final = await readState();
        result.rootChildren = final.rootChildren;
        result.rootTextLength = final.rootTextLength;
        result.queries = final.queries as IssuedQuery[];
        result.blockedFetches = final.blocked as string[];
        result.exports = final.exports as unknown[];

        // Expand the iframe to its content height (same-origin) so the
        // screenshot captures the whole app, not just the top viewport.
        await page.evaluate(() => {
            /* eslint-disable @typescript-eslint/no-explicit-any */
            const frame = document.getElementById('app-frame') as any;
            const doc = frame?.contentDocument;
            if (frame && doc) {
                const height = Math.min(
                    Math.max(900, doc.documentElement.scrollHeight),
                    4000,
                );
                frame.style.height = `${height}px`;
            }
            /* eslint-enable @typescript-eslint/no-explicit-any */
        });
        await page.waitForTimeout(400);
        const screenshotPath = path.join(screenshotDir, `${cell}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        result.screenshot = `screenshots/${cell}.png`;
    } catch (err) {
        result.error = err instanceof Error ? err.message : String(err);
    } finally {
        await context?.close().catch(() => {});
    }
    result.durationMs = Date.now() - startedAt;

    const full: RenderResult = { ...result, rules: renderRules(result) };
    fs.writeFileSync(
        path.join(renderDir, `${cell}.json`),
        JSON.stringify(full, null, 2),
    );
    return full;
}

export async function renderRun(
    runDir: string,
    opts: { concurrency?: number } = {},
): Promise<Record<string, RenderResult>> {
    const distRoot = path.join(runDir, 'dist');
    if (!fs.existsSync(distRoot)) return {};
    const cells = fs
        .readdirSync(distRoot)
        .filter((cell) =>
            fs.existsSync(path.join(distRoot, cell, 'index.html')),
        )
        .sort();
    if (cells.length === 0) return {};

    const catalog = parseCatalog(
        path.join(BENCH_DIR, 'fixtures', 'schema.yml'),
    );
    const promptsJsonPath = path.join(BENCH_DIR, 'prompts.json');
    const harnessByPrompt = new Map<string, string>();
    const harnessFor = (cell: string): string => {
        const promptId = promptIdOfCell(cell) ?? '';
        if (!harnessByPrompt.has(promptId)) {
            harnessByPrompt.set(
                promptId,
                buildHarnessHtml(
                    catalog,
                    loadChartFixtures(promptsJsonPath, promptId),
                    'bench-project-uuid',
                ),
            );
        }
        return harnessByPrompt.get(promptId)!;
    };

    const browser = await chromium.launch();
    const results: Record<string, RenderResult> = {};
    let next = 0;
    const workers = Array.from(
        { length: Math.min(opts.concurrency ?? 4, cells.length) },
        async () => {
            while (next < cells.length) {
                const cell = cells[next];
                next += 1;
                results[cell] = await renderCell(
                    browser,
                    runDir,
                    cell,
                    harnessFor(cell),
                );
            }
        },
    );
    await Promise.all(workers);
    await browser.close();
    return results;
}

// ---------------------------------------------------------------------------
// CLI: re-render an existing run dir and regenerate its gallery
// ---------------------------------------------------------------------------

const isMain =
    process.argv[1] &&
    path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
    const runDir = path.resolve(process.argv[2] ?? '');
    if (!process.argv[2] || !fs.existsSync(runDir)) {
        console.error('Usage: npx tsx benchmark/renderGate.ts <runDir>');
        process.exit(1);
    }
    const results = await renderRun(runDir);
    const cells = Object.keys(results).sort();
    if (cells.length === 0) {
        console.error(`No built cells under ${path.join(runDir, 'dist')}`);
        process.exit(1);
    }
    for (const cell of cells) {
        const r = results[cell];
        const rulesSummary = Object.entries(r.rules)
            .map(([name, ok]) => `${ok ? '✓' : '✗'} ${name}`)
            .join('  ');
        console.log(
            `${cell}: ${r.error ? `ERROR ${r.error.slice(0, 80)}` : rulesSummary}`,
        );
    }
    const galleryPath = writeGallery(runDir);
    console.log(`\nGallery: ${galleryPath}`);
}
