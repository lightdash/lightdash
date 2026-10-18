#!/usr/bin/env node
// Dashboard load benchmark at the API level: logs in, and for every dashboard
// of the first project submits every chart tile's query the way the web app
// does (POST /query/dashboard-chart, then poll /query/{uuid}) with all tiles in
// flight at once, and reports per-dashboard wall time and per-tile latency.
//
// usage: node dashboard-api-bench.mjs --base http://host --email e --password p [--runs 3] [--cold] [--dashboards name,name]
// Prints a JSON report to stdout; progress goes to stderr.

const args = Object.fromEntries(
    process.argv.slice(2).reduce((acc, arg, i, all) => {
        if (arg.startsWith('--')) {
            const next = all[i + 1];
            acc.push([arg.slice(2), next && !next.startsWith('--') ? next : true]);
        }
        return acc;
    }, []),
);
const BASE = args.base ?? 'http://35.205.34.43';
const RUNS = Number(args.runs ?? 3);
const COLD_FIRST = Boolean(args.cold);
const ONLY = args.dashboards ? String(args.dashboards).split(',') : null;
const PAGE_SIZE = 500;
const POLL_MS = 150;

let cookie = '';
const api = async (method, path, body, version = 'v1') => {
    const started = performance.now();
    const res = await fetch(`${BASE}/api/${version}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(cookie ? { Cookie: cookie } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json).slice(0, 200)}`);
    }
    return { results: json.results, ms: performance.now() - started };
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const runTile = async (projectUuid, dashboardUuid, tile, invalidateCache) => {
    const started = performance.now();
    const submit = await api(
        'POST',
        `/projects/${projectUuid}/query/dashboard-chart`,
        {
            context: 'dashboardView',
            tileUuid: tile.uuid,
            chartUuid: tile.properties.savedChartUuid,
            dashboardUuid,
            dashboardFilters: { dimensions: [], metrics: [], tableCalculations: [] },
            dashboardSorts: [],
            invalidateCache,
            pivotResults: true,
        },
        'v2',
    );
    const submittedAt = performance.now();
    const { queryUuid, cacheMetadata } = submit.results;
    let page;
    let polls = 0;
    for (;;) {
        polls += 1;
        const res = await api(
            'GET',
            `/projects/${projectUuid}/query/${queryUuid}?page=1&pageSize=${PAGE_SIZE}`,
            undefined,
            'v2',
        );
        page = res.results;
        if (page.status === 'ready' || page.status === 'error' || page.status === 'expired') break;
        await sleep(POLL_MS);
    }
    const readyAt = performance.now();
    return {
        tileUuid: tile.uuid,
        chartUuid: tile.properties.savedChartUuid,
        chartKind: tile.properties.lastVersionChartKind ?? null,
        status: page.status,
        submitMs: Math.round(submittedAt - started),
        readyMs: Math.round(readyAt - started),
        polls,
        rows: page.rows?.length ?? 0,
        totalResults: page.totalResults ?? null,
        cacheHit: cacheMetadata?.cacheHit ?? null,
        warehouseMs: page.metadata?.warehouseExecutionTimeMs ?? null,
    };
};

const percentile = (values, p) => {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};

const main = async () => {
    await api('POST', '/login', { email: args.email, password: args.password });
    const { results: projects } = await api('GET', '/org/projects');
    const project = projects[0];
    const { results: dashboards } = await api('GET', `/projects/${project.projectUuid}/dashboards`);
    const selected = dashboards.filter((d) => !ONLY || ONLY.includes(d.name));
    process.stderr.write(`project ${project.name}: ${selected.length} dashboards, ${RUNS} runs\n`);

    const report = { base: BASE, project: project.name, runs: RUNS, dashboards: [] };
    for (const summary of selected) {
        const { results: dashboard, ms: dashboardMs } = await api('GET', `/dashboards/${summary.uuid}`);
        const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const chartTiles = dashboard.tiles.filter(
            (t) => t.type === 'saved_chart' && UUID.test(t.properties.savedChartUuid ?? ''),
        );
        const sqlTiles = dashboard.tiles.filter((t) => t.type === 'sql_chart');
        const entry = {
            name: dashboard.name,
            uuid: dashboard.uuid,
            tiles: dashboard.tiles.length,
            chartTiles: chartTiles.length,
            sqlTiles: sqlTiles.length,
            getDashboardMs: Math.round(dashboardMs),
            runs: [],
        };
        for (let run = 0; run < RUNS; run += 1) {
            const invalidateCache = COLD_FIRST && run === 0;
            const started = performance.now();
            const tiles = await Promise.all(
                chartTiles.map((tile) =>
                    runTile(project.projectUuid, dashboard.uuid, tile, invalidateCache).catch((error) => ({
                        tileUuid: tile.uuid,
                        chartUuid: tile.properties.savedChartUuid,
                        status: 'request-error',
                        error: String(error.message).slice(0, 200),
                        submitMs: 0,
                        readyMs: 0,
                    })),
                ),
            );
            const wallMs = Math.round(performance.now() - started);
            const readyTimes = tiles.map((t) => t.readyMs);
            entry.runs.push({
                run,
                invalidateCache,
                wallMs,
                tileReadyP50: percentile(readyTimes, 50),
                tileReadyP95: percentile(readyTimes, 95),
                tileReadyMax: Math.max(...readyTimes, 0),
                submitP50: percentile(tiles.map((t) => t.submitMs), 50),
                errors: tiles.filter((t) => t.status !== 'ready').length,
                cacheHits: tiles.filter((t) => t.cacheHit === true).length,
                tiles,
            });
            process.stderr.write(`  ${dashboard.name}: run ${run} ${wallMs}ms (${chartTiles.length} tiles, p95 ${percentile(readyTimes, 95)}ms)\n`);
        }
        report.dashboards.push(entry);
    }
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
};

main().catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exit(1);
});
