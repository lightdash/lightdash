#!/usr/bin/env node
// Checks an instance upgraded to the viz unification release against the
// manifest seed-v1.mjs wrote before the upgrade: every seeded item is read
// and run through the new APIs, numbers are compared with the baseline, and
// the known risk points (seams where the backend still reads saved_sql) are
// probed. Read-only unless --mutate is passed; --mutate also runs the probes
// that change content (rename, delete, re-upload as code, legacy writes).
//
// usage: node verify-upgrade.mjs --base http://host --email e --password p \
//          --manifest ./qa-manifest.json [--mutate] [--out ./qa-verify.json]
//
// Exit code 0 when no check FAILs. WARN marks a known gap the docs describe.
import { readFileSync, writeFileSync } from 'node:fs';
import { createClient, parseArgs, requireArg, columnTotal, rawRow, repeatParam } from './lib.mjs';

const args = parseArgs();
const BASE = requireArg(args, 'base', 'LD_URL');
const EMAIL = requireArg(args, 'email', 'LD_EMAIL');
const PASSWORD = requireArg(args, 'password', 'LD_PASSWORD');
const MANIFEST = requireArg(args, 'manifest', 'LD_QA_MANIFEST');
const MUTATE = !!args.mutate;
const OUT = args.out ?? MANIFEST.replace(/\.json$/, '') + '.verify.json';
const m = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const P = m.projectUuid;
const { api, raw, login, results } = createClient(BASE);

const checks = [];
const record = (area, check, status, detail = '') => {
    checks.push({ area, check, status, detail: typeof detail === 'string' ? detail : JSON.stringify(detail) });
    process.stderr.write(`${status.padEnd(5)} ${area} :: ${check}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}\n`);
};
const attempt = async (area, check, fn) => {
    try {
        await fn();
    } catch (e) {
        record(area, check, 'FAIL', e.message.slice(0, 400));
    }
};
const close = (a, b) => a !== null && b !== null && Math.abs(Number(a) - Number(b)) <= Math.max(0.01, Math.abs(Number(b)) * 1e-6);
const runChart = async (chartUuid) => {
    const { queryUuid } = await api('POST', `/projects/${P}/query/chart`, { chartUuid, context: 'chartView' }, 'v2');
    return results(P, queryUuid);
};
const measureOf = (c, rows) => (c.measure ? columnTotal(rows, c.measure, c.aggregation) : null);

const main = async () => {
    await login(EMAIL, PASSWORD);
    const health = await api('GET', '/health');
    record('instance', 'version reported by /health', 'INFO', `${m.health?.version} -> ${health.version} (a branch build can report the release it is based on)`);

    // Saved SQL charts read and run as saved charts
    for (const c of m.sqlCharts) {
        const area = `sql chart ${c.key}`;
        await attempt(area, 'reads as a saved chart', async () => {
            const r = await raw('GET', `/projects/${P}/saved/${c.uuid}`, undefined, 'v2');
            if (c.deleted) {
                record(area, 'deleted before the upgrade stays deleted', r.status === 404 ? 'PASS' : 'FAIL', `status ${r.status}`);
                return;
            }
            if (r.status !== 200) throw new Error(`status ${r.status} ${JSON.stringify(r.json).slice(0, 200)}`);
            const chart = r.json.results;
            record(area, 'reads as a saved chart', chart.pipeline ? 'PASS' : 'FAIL', `pipeline nodes: ${chart.pipeline?.queries?.map((q) => q.nodeId).join(' > ')}; chart type ${chart.chartConfig?.type}`);
            record(area, 'name and space kept', chart.name === c.name && chart.spaceUuid === m.spaceUuid ? 'PASS' : 'FAIL', `${chart.name} / ${chart.spaceUuid}`);
            if (c.key === 'slug_collision') {
                record(area, 'colliding slug suffixed with -sql-<uuid8>', chart.slug === `${c.slug}-sql-${c.uuid.slice(0, 8)}` ? 'PASS' : 'FAIL', `${c.slug} -> ${chart.slug}`);
                const bySlug = await raw('GET', `/projects/${P}/saved/${c.slug}`, undefined, 'v2');
                record(area, 'old slug now opens the OTHER chart (links by slug change target)', bySlug.json.results?.uuid !== c.uuid ? 'WARN' : 'PASS', `old slug resolves to ${bySlug.json.results?.uuid}`);
            } else {
                record(area, 'slug kept', chart.slug === c.slug ? 'PASS' : 'FAIL', `${c.slug} -> ${chart.slug}`);
            }
            const { rows, page } = await runChart(c.uuid);
            const total = measureOf(c, rows);
            const base = c.baseline?.measureTotal ?? null;
            if (c.v1KnownError) record(area, 'chart that failed on the previous release', rows.length > 0 ? 'INFO' : 'WARN', `previous release: query error; now ${rows.length} rows, measure total ${total}`);
            else if (c.measure && base !== null) record(area, 'numbers match the previous release', close(total, base) ? 'PASS' : 'FAIL', `measure total before ${base}, after ${total}; ${rows.length} rows (before ${c.baseline.rowCount})`);
            else record(area, 'runs', rows.length > 0 ? 'PASS' : 'FAIL', `${rows.length} rows; columns ${Object.keys(page.columns ?? {}).join(',')}`);
            record(area, 'result keys use field ids, not column names (API shape change)', Object.keys(rawRow(rows[0] ?? {})).every((k) => k.includes('_')) ? 'INFO' : 'WARN', Object.keys(rawRow(rows[0] ?? {})).join(','));
        });
        if (!c.deleted) {
            await attempt(area, 'deprecated GET sqlRunner/saved still serves it', async () => {
                const r = await raw('GET', `/projects/${P}/sqlRunner/saved/${c.uuid}`);
                const dep = r.headers.get('deprecation') ?? r.headers.get('Deprecation');
                if (r.status !== 200) {
                    record(area, 'deprecated GET sqlRunner/saved still serves it', 'FAIL', `status ${r.status} ${JSON.stringify(r.json).slice(0, 160)}`);
                    return;
                }
                const s = r.json.results;
                const same = c.v1Read && s.sql === c.v1Read.sql && s.limit === c.v1Read.limit && s.chartKind === c.v1Read.chartKind;
                record(area, 'deprecated GET sqlRunner/saved still serves it', same ? 'PASS' : 'WARN', `deprecation header ${dep ? 'present' : 'missing'}; sql/limit/kind ${same ? 'unchanged' : `changed: ${JSON.stringify({ limit: [c.v1Read?.limit, s.limit], kind: [c.v1Read?.chartKind, s.chartKind] })}`}; views ${c.v1Read?.views} -> ${s.views}`);
                const before = JSON.stringify(c.v1Read?.config ?? {});
                const after = JSON.stringify(s.config ?? {});
                record(area, 'SQL runner config round-trips through the adapter', before === after ? 'PASS' : 'WARN', before === after ? '' : `lossy: before ${before.slice(0, 220)} | after ${after.slice(0, 220)}`);
            });
        }
    }

    // Trash
    await attempt('trash', 'chart deleted before the upgrade is listed and restorable', async () => {
        const trashed = m.sqlCharts.find((c) => c.deleted);
        if (!trashed) return record('trash', 'chart deleted before the upgrade is listed and restorable', 'INFO', 'nothing seeded');
        const list = await api('GET', `/content/deleted?projectUuids=${P}&pageSize=100&search=${encodeURIComponent(trashed.name)}`, undefined, 'v2');
        if (m.health?.softDelete === false) return record('trash', 'chart deleted before the upgrade is listed and restorable', 'INFO', 'soft delete was off on the previous release: the delete was permanent');
        const items = list.data ?? list;
        record('trash', 'deleted SQL chart is listed in the trash once', Array.isArray(items) && items.filter((i) => i.uuid === trashed.uuid).length === 1 ? 'PASS' : 'FAIL', `${Array.isArray(items) ? items.length : '?'} items matched`);
    });

    // Dashboard: SQL tiles read as chart tiles and run with the dashboard filter
    for (const d of m.dashboards) {
        const area = 'dashboard';
        await attempt(area, 'SQL tiles read as chart tiles', async () => {
            const dash = await api('GET', `/dashboards/${d.uuid}`);
            const formerSql = d.tiles.filter((t) => t.type === 'sql_chart');
            const now = formerSql.map((t) => dash.tiles.find((x) => x.uuid === t.uuid));
            const ok = now.every((t) => t && t.type === 'saved_chart' && t.properties.savedChartUuid);
            record(area, 'SQL tiles read as chart tiles (same tile uuid, chart uuid = old SQL chart uuid)', ok ? 'PASS' : 'FAIL', now.map((t) => t?.type).join(','));
            for (const t of formerSql) {
                const chart = m.sqlCharts.find((c) => c.uuid === t.chartUuid);
                const base = d.baseline?.[t.uuid];
                await attempt(area, `tile ${chart?.key} runs with the dashboard filter`, async () => {
                    const r = await api('POST', `/projects/${P}/query/dashboard-chart`, { chartUuid: t.chartUuid, tileUuid: t.uuid, dashboardUuid: d.uuid, dashboardFilters: d.filters, dashboardSorts: [], context: 'dashboardView' }, 'v2');
                    const { rows } = await results(P, r.queryUuid);
                    const total = chart ? measureOf(chart, rows) : null;
                    const sameNumbers = base?.measureTotal === null || base?.measureTotal === undefined || close(total, base.measureTotal);
                    record(area, `tile ${chart?.key} runs with the dashboard filter`, sameNumbers ? 'PASS' : 'FAIL', `rows ${base?.rowCount} -> ${rows.length}; measure ${base?.measureTotal} -> ${total}; filters applied before ${JSON.stringify(base?.appliedFilters ?? null).slice(0, 80)} after ${JSON.stringify(r.appliedDashboardFilters ?? null).slice(0, 80)}`);
                });
            }
        });
        await attempt(area, 'available filters for the dashboard', async () => {
            const ids = (await api('GET', `/dashboards/${d.uuid}`)).tiles.filter((t) => t.type === 'saved_chart').map((t) => ({ tileUuid: t.uuid, savedChartUuid: t.properties.savedChartUuid }));
            const af = await api('POST', '/dashboards/availableFilters', ids);
            record(area, 'available filters include pipeline tile fields', Object.keys(af.savedQueryFilters ?? {}).length > 0 ? 'PASS' : 'WARN', `${Object.keys(af.savedQueryFilters ?? {}).length} tiles with filters, ${af.allFilterableFields?.length ?? 0} fields`);
        });
    }

    // Deliveries
    for (const s of m.schedulers) {
        const area = `delivery ${s.key}`;
        await attempt(area, 'scheduler still readable', async () => {
            const sch = await api('GET', `/schedulers/${s.uuid}`);
            record(area, 'scheduler still readable', 'PASS', `savedSqlUuid ${sch.savedSqlUuid ?? null} savedChartUuid ${sch.savedChartUuid ?? null} enabled ${sch.enabled}`);
            if (s.savedSqlUuid) {
                const list = await api('GET', `/saved/${s.savedSqlUuid}/schedulers?pageSize=50`, undefined, 'v2');
                const listed = (list.data ?? []).some((x) => x.schedulerUuid === s.uuid);
                record(area, 'listed on the chart page schedulers (GET /api/v2/saved/{uuid}/schedulers)', listed ? 'PASS' : 'WARN', listed ? '' : 'legacy SQL chart delivery not visible from the chart; only from the project schedulers page');
            }
            if (s.sendable === false) {
                record(area, 'send now completes', 'INFO', 'not sent: points at a placeholder Google sheet; send it with a real sheet by hand (QA-SCHD-U04)');
                return;
            }
            const send = await api('POST', `/schedulers/${s.uuid}/send`);
            let status = 'queued';
            for (let i = 0; i < 150 && !['completed', 'error'].includes(status); i += 1) {
                await new Promise((r) => setTimeout(r, 2000));
                status = (await api('GET', `/schedulers/job/${send.jobId}/status`)).status;
            }
            record(area, 'send now completes', status === 'completed' ? 'PASS' : 'FAIL', `job ${send.jobId} ${status}${status === 'completed' ? '' : '; check the worker log, and send an image delivery of a dashboard with explore charts only: if that fails too, the headless browser is the cause'}`);
        });
    }

    // Documents
    for (const doc of m.documents) {
        const area = 'document';
        await attempt(area, 'inline SQL chart runs', async () => {
            // The previous release renames inline chart ids on save (inline_sql -> c1), so read them back.
            const current = await api('GET', `/projects/${P}/documents/${doc.uuid}`);
            const versionUuid = current.version.versionUuid;
            const chartIds = Object.keys(current.version.content?.charts ?? {});
            const chartId = chartIds.includes(doc.inlineChartId) ? doc.inlineChartId : chartIds[0];
            if (!chartId) {
                record(area, 'inline SQL chart runs', 'FAIL', 'the document has no inline charts after the upgrade');
                return;
            }
            const r = await api('POST', `/projects/${P}/documents/${doc.uuid}/charts/${chartId}/query`, { versionUuid });
            const { rows } = await results(P, r.queryUuid);
            record(area, 'inline SQL chart runs', rows.length > 0 ? 'PASS' : 'FAIL', `${rows.length} rows`);
        });
        await attempt(area, 'linked SQL chart runs', async () => {
            const { rows } = await runChart(doc.linkedSqlChartUuid);
            record(area, 'linked SQL chart runs', rows.length > 0 ? 'PASS' : 'FAIL', `${rows.length} rows`);
        });
    }

    // Share links of the previous release
    for (const s of m.shares) {
        await attempt('share link', 'old SQL runner share link still resolves', async () => {
            const share = await api('GET', `/share/${s.nanoid}`);
            record('share link', 'old SQL runner share link still resolves', share?.params ? 'PASS' : 'FAIL', `open ${s.url} in the UI: the chart tab must draw a bar chart`);
        });
    }

    // Listings: each chart once
    await attempt('listings', 'space lists each chart once', async () => {
        const space = await api('GET', `/projects/${P}/spaces/${m.spaceUuid}`);
        const uuids = (space.queries ?? []).map((q) => q.uuid);
        const dupes = uuids.filter((u, i) => uuids.indexOf(u) !== i);
        const sqlListed = (space.sqlCharts ?? []).length;
        record('listings', 'space lists each chart once', dupes.length === 0 ? 'PASS' : 'FAIL', `${uuids.length} charts, ${dupes.length} duplicates, sqlCharts array ${sqlListed}`);
    });
    await attempt('listings', 'homepage most popular lists each chart once', async () => {
        const r = await api('GET', `/projects/${P}/most-popular-and-recently-updated`);
        const all = [...(r.mostPopular ?? []), ...(r.recentlyUpdated ?? [])].map((i) => i.uuid ?? i.savedSqlUuid);
        const seeded = new Set(m.sqlCharts.map((c) => c.uuid));
        const hits = all.filter((u) => seeded.has(u));
        const dupes = hits.filter((u, i) => hits.indexOf(u) !== i);
        record('listings', 'homepage most popular / recent lists each chart once', dupes.length === 0 ? 'PASS' : 'FAIL', `${hits.length} seeded entries, ${dupes.length} duplicates`);
    });
    await attempt('listings', 'v2 content lists each chart once', async () => {
        const r = await api('GET', `/content?projectUuids=${P}&spaceUuids=${m.spaceUuid}&pageSize=100&page=1`, undefined, 'v2');
        const uuids = (r.data ?? []).map((i) => i.uuid);
        const dupes = uuids.filter((u, i) => uuids.indexOf(u) !== i);
        record('listings', 'v2 content lists each chart once', dupes.length === 0 ? 'PASS' : 'FAIL', `${uuids.length} items, ${dupes.length} duplicates`);
    });

    // Content as code
    await attempt('as-code', 'charts download with a pipeline block', async () => {
        const slugs = m.sqlCharts.filter((c) => !c.deleted).map((c) => c.slug);
        const r = await api('GET', `/projects/${P}/code/charts?${repeatParam('ids', slugs)}`);
        const withPipeline = (r.charts ?? []).filter((c) => c.pipeline).length;
        record('as-code', 'charts download with a pipeline block', withPipeline > 0 ? 'PASS' : 'FAIL', `${withPipeline}/${slugs.length} downloaded as charts with pipeline`);
    });
    await attempt('as-code', 'sqlCharts download', async () => {
        const all = await api('GET', `/projects/${P}/code/sqlCharts`);
        const some = await api('GET', `/projects/${P}/code/sqlCharts?${repeatParam('ids', m.sqlCharts.map((c) => c.slug))}`);
        record('as-code', 'sqlCharts download without ids', (all.sqlCharts ?? []).length === 0 ? 'WARN' : 'PASS', `${(all.sqlCharts ?? []).length} without ids, ${(some.sqlCharts ?? []).length} with ids (old repos re-download nothing under sqlCharts)`);
    });

    // Validation must not flag folded charts
    await attempt('validation', 'no validation errors on seeded charts', async () => {
        await api('POST', `/projects/${P}/validate`, {});
        await new Promise((r) => setTimeout(r, 15000));
        const v = await api('GET', `/projects/${P}/validate?fromSettings=true`);
        const seeded = new Set([...m.sqlCharts.map((c) => c.uuid), ...m.dashboards.map((d) => d.uuid)]);
        const errs = (v ?? []).filter((e) => seeded.has(e.chartUuid) || seeded.has(e.dashboardUuid));
        record('validation', 'no validation errors on seeded charts and dashboard', errs.length === 0 ? 'PASS' : 'FAIL', errs.map((e) => e.error).slice(0, 3).join(' | '));
    });

    if (!MUTATE) return;
    // ---- probes that change content ----
    const bar = m.sqlCharts.find((c) => c.key === 'bar_sum');
    const dash = m.dashboards[0];
    if (bar && dash) {
        await attempt('mutate', 'rename shows on the legacy dashboard tile', async () => {
            const newName = `${bar.name} renamed`;
            await api('PATCH', `/saved/${bar.uuid}`, { name: newName });
            const d = await api('GET', `/dashboards/${dash.uuid}`);
            const tile = d.tiles.find((t) => t.properties.savedChartUuid === bar.uuid);
            record('mutate', 'rename shows on the legacy dashboard tile', tile?.properties.chartName === newName ? 'PASS' : 'FAIL', `tile chartName "${tile?.properties.chartName}"`);
            const sch = m.schedulers.find((s) => s.savedSqlUuid === bar.uuid);
            if (sch) {
                const s = await api('GET', `/schedulers/${sch.uuid}`);
                record('mutate', 'rename shows on the legacy SQL chart delivery', (s.savedSqlName ?? s.savedChartName) === newName ? 'PASS' : 'FAIL', `scheduler shows "${s.savedSqlName ?? s.savedChartName}"`);
            }
        });
    }
    await attempt('mutate', 'deprecated create + scheduler on a chart created after the upgrade', async () => {
        const created = await api('POST', `/projects/${P}/sqlRunner/saved`, { name: `QA post-upgrade ${m.run}`, description: null, sql: 'SELECT 1 AS one', limit: 10, config: { metadata: { version: 1 }, type: 'table', columns: {}, display: undefined }, spaceUuid: m.spaceUuid });
        record('mutate', 'deprecated POST sqlRunner/saved creates a chart', created?.savedSqlUuid ? 'PASS' : 'FAIL', created?.savedSqlUuid);
        const r = await raw('POST', `/projects/${P}/sqlRunner/saved/${created.savedSqlUuid}/schedulers`, { cron: '0 9 * * 1', timezone: 'UTC', enabled: true, includeLinks: true, plainTextEmail: false, targets: [], appUuid: null, appName: null, name: 'post-upgrade sync', format: 'gsheets', options: { gdriveId: 'qa-placeholder-sheet', gdriveName: 'QA placeholder', gdriveOrganizationName: '', url: 'https://docs.google.com/spreadsheets/d/qa-placeholder-sheet', tabName: 'qa' } });
        record('mutate', 'deprecated POST sqlRunner/saved/{uuid}/schedulers on a new chart', r.status < 300 ? 'PASS' : 'FAIL', `status ${r.status} ${JSON.stringify(r.json).slice(0, 160)}`);
        const doc = await raw('POST', `/projects/${P}/documents`, { name: `QA link new SQL chart ${m.run}`, description: '', spaceUuid: m.spaceUuid, schemaVersion: 2, content: { markdown: `<saved-sql-chart uuid="${created.savedSqlUuid}"/>`, charts: {} } });
        record('mutate', 'document links a new chart with <saved-sql-chart>', doc.status < 300 ? 'PASS' : 'FAIL', `status ${doc.status} ${JSON.stringify(doc.json).slice(0, 160)}`);
    });
    if (dash) {
        const victim = m.sqlCharts.find((c) => c.key === 'pie_sum');
        await attempt('mutate', 'delete a chart used by a legacy tile, then save the dashboard', async () => {
            if (!victim) return;
            await api('DELETE', `/saved/${victim.uuid}`);
            const d = await api('GET', `/dashboards/${dash.uuid}`);
            const r = await raw('PATCH', `/dashboards/${dash.uuid}`, { tiles: d.tiles, filters: d.filters, tabs: d.tabs ?? [] });
            record('mutate', 'dashboard still saves after a tile chart is deleted', r.status < 300 ? 'PASS' : 'FAIL', `status ${r.status} ${JSON.stringify(r.json).slice(0, 200)}`);
        });
    }
    await attempt('mutate', 're-upload the v1 sqlCharts snapshot as code', async () => {
        const snap = JSON.parse(readFileSync(m.asCode.file, 'utf8'));
        let ok = 0;
        const problems = [];
        for (const sc of snap.sqlCharts?.sqlCharts ?? []) {
            const r = await raw('POST', `/projects/${P}/code/sqlCharts/${sc.slug}`, { ...sc, name: `${sc.name} (re-uploaded)` });
            if (r.status < 300) ok += 1;
            else problems.push(`${sc.slug}: ${r.status}`);
        }
        record('mutate', 're-upload the v1 sqlCharts snapshot as code', problems.length === 0 ? 'PASS' : 'FAIL', `${ok} uploaded, problems ${problems.join(', ')}`);
        // Each upload must land: the chart at that slug now carries the uploaded name and a pipeline.
        const lost = [];
        for (const sc of snap.sqlCharts?.sqlCharts ?? []) {
            const at = await raw('GET', `/projects/${P}/saved/${sc.slug}`, undefined, 'v2');
            const landed = at.status < 300 && at.json?.results?.name === `${sc.name} (re-uploaded)` && !!at.json?.results?.pipeline;
            if (!landed) lost.push(`${sc.slug} -> "${at.json?.results?.name ?? at.status}" (pipeline ${!!at.json?.results?.pipeline})`);
        }
        record('mutate', 'every re-uploaded SQL chart landed (no silent no-op on a slug now owned by another chart)', lost.length === 0 ? 'PASS' : 'FAIL', lost.length ? `upload reported success but nothing was written: ${lost.join('; ')}` : '');
    });
};

main()
    .catch((e) => record('main', 'run', 'FAIL', e.message))
    .finally(() => {
        writeFileSync(OUT, JSON.stringify({ base: BASE, verifiedAt: new Date().toISOString(), mutate: MUTATE, checks }, null, 2));
        const count = (s) => checks.filter((c) => c.status === s).length;
        process.stdout.write(`| Status | Area | Check | Detail |\n|---|---|---|---|\n${checks.map((c) => `| ${c.status} | ${c.area} | ${c.check} | ${c.detail.replace(/\|/g, '\\|').slice(0, 300)} |`).join('\n')}\n\nPASS ${count('PASS')}  WARN ${count('WARN')}  FAIL ${count('FAIL')}  INFO ${count('INFO')}\n`);
        process.exit(count('FAIL') ? 1 : 0);
    });
