#!/usr/bin/env node
// Seeds a Lightdash instance that runs the PREVIOUS release (before the viz
// unification, e.g. 2.603.0) with every kind of content the upgrade touches,
// through the APIs that release offers, and records what it created plus
// baseline query numbers in a manifest. Run verify-upgrade.mjs with the
// manifest after upgrading the same instance.
//
// usage: node seed-v1.mjs --base http://host --email e --password p \
//          [--project <uuid>] [--out ./qa-manifest.json] [--sqlTable jaffle.orders]
//
// Every step is independent: a step the instance cannot do (feature off, no
// licence) is recorded as skipped with the reason, never fatal.
import { writeFileSync } from 'node:fs';
import { createClient, parseArgs, requireArg, columnTotal, repeatParam } from './lib.mjs';

const args = parseArgs();
const BASE = requireArg(args, 'base', 'LD_URL');
const EMAIL = requireArg(args, 'email', 'LD_EMAIL');
const PASSWORD = requireArg(args, 'password', 'LD_PASSWORD');
const OUT = args.out ?? './qa-manifest.json';
const TABLE = args.sqlTable ?? 'jaffle.orders';
const RUN = Date.now().toString(36);

const { api, raw, login, results } = createClient(BASE);
const manifest = {
    seededAt: new Date().toISOString(),
    base: BASE,
    run: RUN,
    health: null,
    projectUuid: null,
    spaceUuid: null,
    sqlCharts: [],
    exploreCharts: [],
    dashboards: [],
    schedulers: [],
    documents: [],
    shares: [],
    asCode: null,
    skipped: [],
    v1Errors: [],
    errors: [],
};
const step = async (name, fn, opts = {}) => {
    try {
        const out = await fn();
        process.stderr.write(`ok    ${name}\n`);
        return out;
    } catch (e) {
        if (opts.expectedV1Error) {
            process.stderr.write(`v1err ${name}: ${e.message} (expected: the previous release fails this case)\n`);
            manifest.v1Errors.push({ step: name, error: e.message });
            return { v1Error: e.message };
        }
        process.stderr.write(`FAIL  ${name}: ${e.message}\n`);
        manifest.errors.push({ step: name, error: e.message });
        return undefined;
    }
};
const skip = (name, reason) => {
    process.stderr.write(`skip  ${name}: ${reason}\n`);
    manifest.skipped.push({ step: name, reason });
};

// The SQL runner configs the previous release saved, one per chart kind and
// per layout the fold converts differently.
const monthSql = `SELECT status, date_trunc('month', order_date)::date AS order_month, amount, order_id FROM ${TABLE}`;
const rawSql = `SELECT status, amount, order_date, order_id FROM ${TABLE}`;
const groupedSql = `SELECT status, SUM(amount) AS total_amount, COUNT(*) AS orders FROM ${TABLE} GROUP BY 1`;
const v = { metadata: { version: 1 } };
const SQL_CHARTS = [
    {
        key: 'bar_sum',
        expect: 'aggregating node (sum per status); amount total must match the raw total',
        measure: 'amount',
        aggregation: 'sum',
        sql: rawSql,
        config: { ...v, type: 'vertical_bar', fieldConfig: { x: { reference: 'status', type: 'category' }, y: [{ reference: 'amount', aggregation: 'sum' }], groupBy: undefined, sortBy: [{ reference: 'status', direction: 'DESC' }] }, display: { xAxis: { label: 'Status' }, yAxis: [{ label: 'Amount', format: 'usd' }], legend: { position: 'top', align: 'center' } } },
    },
    {
        key: 'bar_grouped_stacked',
        expect: 'aggregating node + pivot on status, stacked; amount total must match',
        measure: 'amount',
        aggregation: 'sum',
        sql: monthSql,
        config: { ...v, type: 'vertical_bar', fieldConfig: { x: { reference: 'order_month', type: 'time' }, y: [{ reference: 'amount', aggregation: 'sum' }], groupBy: [{ reference: 'status' }], stack: true }, display: { xAxis: { label: 'Month', dateFormat: 'MMM YYYY' }, yAxis: [{ label: 'Amount' }] } },
    },
    {
        key: 'bar_sort_by_y',
        expect: 'v1 sorted by its own y field; the previous release fails this chart ("column amount does not exist"), record what the new release does',
        measure: 'amount',
        aggregation: 'sum',
        v1KnownError: true,
        sql: rawSql,
        config: { ...v, type: 'vertical_bar', fieldConfig: { x: { reference: 'status', type: 'category' }, y: [{ reference: 'amount', aggregation: 'sum' }], groupBy: undefined, sortBy: [{ reference: 'amount', direction: 'DESC' }] }, display: undefined },
    },
    {
        key: 'line_count',
        expect: 'aggregating node (count per month); count total must equal the raw row count',
        measure: 'order_id',
        aggregation: 'count',
        sql: monthSql,
        config: { ...v, type: 'line', fieldConfig: { x: { reference: 'order_month', type: 'time' }, y: [{ reference: 'order_id', aggregation: 'count' }], groupBy: undefined }, display: { xAxis: { label: 'Month' }, yAxis: [{ label: 'Orders' }], series: { order_id_count: { type: 'line', label: 'Order count', color: '#e15759' } } } },
    },
    {
        key: 'line_avg_multi_y',
        expect: 'two y fields with different aggregations (avg, max)',
        measure: null,
        sql: monthSql,
        config: { ...v, type: 'line', fieldConfig: { x: { reference: 'order_month', type: 'time' }, y: [{ reference: 'amount', aggregation: 'avg' }, { reference: 'amount', aggregation: 'max' }], groupBy: undefined }, display: undefined },
    },
    {
        key: 'pie_sum',
        expect: 'aggregating node (sum per status), pie; amount total must match',
        measure: 'amount',
        aggregation: 'sum',
        sql: rawSql,
        config: { ...v, type: 'pie', fieldConfig: { x: { reference: 'status', type: 'category' }, y: [{ reference: 'amount', aggregation: 'sum' }], groupBy: undefined }, display: { isDonut: true } },
    },
    {
        key: 'big_number',
        expect: 'aggregating node (one row); value must equal the raw amount total',
        measure: 'amount',
        aggregation: 'sum',
        sql: rawSql,
        config: { ...v, type: 'big_number', fieldConfig: { x: undefined, y: [{ reference: 'amount', aggregation: 'sum' }], groupBy: undefined }, display: { label: 'Revenue', showLabel: true, style: 'thousands' } },
    },
    {
        key: 'bar_preaggregated',
        expect: 'statement already aggregates; the chart sums one row per status (no change in numbers)',
        measure: 'total_amount',
        aggregation: 'sum',
        sql: groupedSql,
        config: { ...v, type: 'vertical_bar', fieldConfig: { x: { reference: 'status', type: 'category' }, y: [{ reference: 'total_amount', aggregation: 'sum' }, { reference: 'orders', aggregation: 'sum' }], groupBy: undefined }, display: undefined },
    },
    {
        key: 'table_styled',
        expect: 'SQL node only (no aggregation); labels, hidden column, bar display style kept or documented as lost',
        measure: 'amount',
        sql: rawSql,
        limit: 100,
        config: { ...v, type: 'table', columns: { status: { visible: true, reference: 'status', label: 'Order status', frozen: true, order: 0 }, amount: { visible: true, reference: 'amount', label: 'Amount ($)', frozen: false, order: 1, displayStyle: 'bar', barConfig: { color: '#59a14f' } }, order_date: { visible: true, reference: 'order_date', label: 'Ordered on', frozen: false, order: 2 }, order_id: { visible: false, reference: 'order_id', label: 'Id', frozen: false, order: 3 } }, display: undefined },
    },
    {
        key: 'table_no_columns',
        expect: 'table saved with an empty column config: columns discovered on first run (probe query)',
        measure: 'amount',
        sql: rawSql,
        limit: 50,
        config: { ...v, type: 'table', columns: {}, display: undefined },
    },
];

const main = async () => {
    await login(EMAIL, PASSWORD);
    manifest.health = await step('health', async () => {
        const h = await api('GET', '/health');
        return { version: h.version, mode: h.mode, softDelete: h.softDelete?.enabled ?? null };
    });

    const projects = await api('GET', '/org/projects');
    const project = args.project ? projects.find((p) => p.projectUuid === args.project) : projects.find((p) => p.type === 'DEFAULT') ?? projects[0];
    if (!project) throw new Error('no project');
    const projectUuid = project.projectUuid;
    manifest.projectUuid = projectUuid;

    const space = await step('create space', () =>
        api('POST', `/projects/${projectUuid}/spaces`, { name: `QA v1 seed ${RUN}`, isPrivate: false }),
    );
    if (!space) throw new Error('cannot create a space');
    manifest.spaceUuid = space.uuid;

    // SQL charts, with a baseline run on the previous release's SQL chart query
    for (const def of SQL_CHARTS) {
        const created = await step(`sql chart ${def.key}`, () =>
            api('POST', `/projects/${projectUuid}/sqlRunner/saved`, {
                name: `QA ${def.key} ${RUN}`,
                description: `v1 seed: ${def.expect}`,
                sql: def.sql,
                limit: def.limit ?? 500,
                config: def.config,
                spaceUuid: space.uuid,
            }),
        );
        if (!created) continue;
        const entry = { v1KnownError: !!def.v1KnownError, key: def.key, uuid: created.savedSqlUuid, slug: created.slug, name: `QA ${def.key} ${RUN}`, kind: def.config.type, expect: def.expect, measure: def.measure, aggregation: def.aggregation ?? null, baseline: null };
        entry.baseline = await step(`baseline ${def.key}`, async () => {
            const { queryUuid } = await api('POST', `/projects/${projectUuid}/query/sql-chart`, { savedSqlUuid: created.savedSqlUuid, context: 'sqlChartView' }, 'v2');
            const { rows, page } = await results(projectUuid, queryUuid);
            return {
                rowCount: rows.length,
                columns: Object.keys(page.columns ?? rows[0] ?? {}),
                measureTotal: def.measure ? columnTotal(rows, def.measure, def.aggregation) : null,
            };
        }, { expectedV1Error: !!def.v1KnownError });
        manifest.sqlCharts.push(entry);
    }

    // An explore chart whose slug a SQL chart then takes too: the fold suffixes the SQL chart's slug
    const collisionName = `QA slug collision ${RUN}`;
    const exploreChart = await step('explore chart (slug collision source)', () =>
        api('POST', `/projects/${projectUuid}/saved`, {
            name: collisionName,
            tableName: 'orders',
            metricQuery: { exploreName: 'orders', dimensions: ['orders_status'], metrics: ['orders_average_order_size'], filters: {}, sorts: [], limit: 500, tableCalculations: [] },
            chartConfig: { type: 'table' },
            tableConfig: { columnOrder: [] },
            spaceUuid: space.uuid,
        }),
    );
    if (exploreChart) {
        manifest.exploreCharts.push({ key: 'collision_source', uuid: exploreChart.uuid, slug: exploreChart.slug });
        const collided = await step('sql chart with the same slug', () =>
            api('POST', `/projects/${projectUuid}/sqlRunner/saved`, { name: collisionName, description: 'v1 seed: slug collides with an explore chart', sql: rawSql, limit: 10, config: SQL_CHARTS.find((c) => c.key === 'table_no_columns').config, spaceUuid: space.uuid }),
        );
        if (collided) manifest.sqlCharts.push({ key: 'slug_collision', uuid: collided.savedSqlUuid, slug: collided.slug, name: collisionName, kind: 'table', expect: 'slug becomes <slug>-sql-<8 chars of uuid>; old slug URL resolves to the explore chart', measure: null, baseline: null });
    }

    // A SQL chart in the trash (soft delete) and one renamed after its first version
    const trashed = await step('sql chart to trash', async () => {
        const c = await api('POST', `/projects/${projectUuid}/sqlRunner/saved`, { name: `QA trashed ${RUN}`, description: null, sql: rawSql, limit: 10, config: SQL_CHARTS[0].config, spaceUuid: space.uuid });
        await api('DELETE', `/projects/${projectUuid}/sqlRunner/saved/${c.savedSqlUuid}`);
        return c;
    });
    if (trashed) manifest.sqlCharts.push({ key: 'trashed', uuid: trashed.savedSqlUuid, slug: trashed.slug, name: `QA trashed ${RUN}`, kind: 'vertical_bar', expect: 'deleted before the upgrade: stays deleted, restorable when soft delete is on', deleted: true, measure: null, baseline: null });

    const versioned = manifest.sqlCharts.find((c) => c.key === 'bar_sum');
    if (versioned) {
        await step('second version of bar_sum (history)', () =>
            api('PATCH', `/projects/${projectUuid}/sqlRunner/saved/${versioned.uuid}`, {
                unversionedData: { name: versioned.name, description: 'v1 seed: renamed description in a second version', spaceUuid: space.uuid },
                versionedData: { sql: rawSql, limit: 400, config: SQL_CHARTS[0].config },
            }),
        );
        versioned.versions = 2;
        versioned.expect += '; had 2 versions before the upgrade (the fold keeps only the latest)';
    }

    // Dashboard with SQL chart tiles, an explore chart tile, a markdown tile and a filter
    const tileCharts = manifest.sqlCharts.filter((c) => !c.deleted && c.key !== 'slug_collision');
    const dashboard = await step('dashboard with sql_chart tiles', async () => {
        const d = await api('POST', `/projects/${projectUuid}/dashboards`, { name: `QA v1 dashboard ${RUN}`, spaceUuid: space.uuid, tiles: [], tabs: [] });
        const tiles = tileCharts.map((c, i) => ({ uuid: crypto.randomUUID(), type: 'sql_chart', x: (i % 2) * 18, y: Math.floor(i / 2) * 9, h: 9, w: 18, properties: { savedSqlUuid: c.uuid, chartName: c.name, title: i === 0 ? 'Custom tile title' : '' } }));
        if (exploreChart) tiles.push({ uuid: crypto.randomUUID(), type: 'saved_chart', x: 0, y: 100, h: 9, w: 18, properties: { savedChartUuid: exploreChart.uuid, title: '' } });
        tiles.push({ uuid: crypto.randomUUID(), type: 'markdown', x: 18, y: 100, h: 9, w: 18, properties: { title: 'Notes', content: 'v1 seed dashboard' } });
        const filters = { dimensions: [{ id: crypto.randomUUID(), label: undefined, target: { fieldId: 'orders_status', tableName: 'orders' }, operator: 'equals', values: ['completed'], tileTargets: {} }], metrics: [], tableCalculations: [] };
        await api('PATCH', `/dashboards/${d.uuid}`, { tiles, filters, tabs: [] });
        const full = await api('GET', `/dashboards/${d.uuid}`);
        return { uuid: d.uuid, slug: full.slug, name: full.name, tiles: full.tiles.map((t) => ({ uuid: t.uuid, type: t.type, chartUuid: t.properties.savedSqlUuid ?? t.properties.savedChartUuid ?? null, title: t.properties.title ?? '' })), filters };
    });
    if (dashboard) {
        // Baseline of each SQL tile through the dashboard SQL chart query, with the dashboard filter
        dashboard.baseline = {};
        for (const tile of dashboard.tiles.filter((t) => t.type === 'sql_chart')) {
            const chart = manifest.sqlCharts.find((c) => c.uuid === tile.chartUuid);
            dashboard.baseline[tile.uuid] = await step(`dashboard tile baseline ${chart?.key}`, async () => {
                const { queryUuid, appliedDashboardFilters } = await api('POST', `/projects/${projectUuid}/query/dashboard-sql-chart`, { savedSqlUuid: tile.chartUuid, dashboardUuid: dashboard.uuid, tileUuid: tile.uuid, dashboardFilters: dashboard.filters, dashboardSorts: [], context: 'dashboardView' }, 'v2');
                const { rows } = await results(projectUuid, queryUuid);
                return { rowCount: rows.length, appliedFilters: appliedDashboardFilters ?? null, measureTotal: chart?.measure ? columnTotal(rows, chart.measure, chart.aggregation) : null };
            }, { expectedV1Error: !!chart?.v1KnownError });
        }
        manifest.dashboards.push(dashboard);
    }

    // Schedulers. On the previous release a SQL chart could only have Google
    // Sheets syncs (no email delivery path exists for saved_sql_uuid), so the
    // SQL chart gets a sync that points at a placeholder sheet: it is listed and
    // migrates, but sending it needs a real Google account. The dashboard gets
    // an image delivery, which sends.
    const deliveryBase = { cron: '0 9 * * 1', timezone: 'UTC', enabled: true, includeLinks: true, plainTextEmail: false, appUuid: null, appName: null, message: 'v1 seed' };
    const barChart = manifest.sqlCharts.find((c) => c.key === 'bar_sum');
    if (barChart) {
        const s = await step('Google Sheets sync on a SQL chart (placeholder sheet)', () =>
            api('POST', `/projects/${projectUuid}/sqlRunner/saved/${barChart.uuid}/schedulers`, {
                ...deliveryBase,
                name: `QA sql chart sync ${RUN}`,
                format: 'gsheets',
                targets: [],
                options: { gdriveId: 'qa-placeholder-sheet', gdriveName: 'QA placeholder', gdriveOrganizationName: '', url: 'https://docs.google.com/spreadsheets/d/qa-placeholder-sheet', tabName: 'qa' },
            }),
        );
        if (s) manifest.schedulers.push({ key: 'sql_chart_gsheets', uuid: s.schedulerUuid, savedSqlUuid: barChart.uuid, format: 'gsheets', sendable: false });
    }
    if (dashboard) {
        const s = await step('image delivery on the dashboard', () => api('POST', `/dashboards/${dashboard.uuid}/schedulers`, { ...deliveryBase, name: `QA dashboard delivery ${RUN}`, format: 'image', targets: [{ recipient: 'qa-v1-seed@example.com' }], options: {}, filters: [] }));
        if (s) manifest.schedulers.push({ key: 'dashboard_image', uuid: s.schedulerUuid, dashboardUuid: dashboard.uuid, format: 'image', sendable: true });
    }

    // Document: an inline SQL chart, a linked SQL chart and a linked explore chart
    const tableChart = manifest.sqlCharts.find((c) => c.key === 'table_styled');
    if (barChart) {
        const markdown = [
            `# QA v1 document ${RUN}`,
            '',
            '<document-chart id="inline_sql"/>',
            '',
            `<saved-sql-chart uuid="${barChart.uuid}"/>`,
            '',
            exploreChart ? `<saved-chart uuid="${exploreChart.uuid}"/>` : '',
        ].join('\n');
        const doc = await step('document with inline and linked SQL charts', () =>
            api('POST', `/projects/${projectUuid}/documents`, {
                name: `QA v1 document ${RUN}`,
                description: 'v1 seed',
                spaceUuid: space.uuid,
                schemaVersion: 2,
                content: { markdown, charts: { inline_sql: { source: 'sql', chart: { name: 'Inline revenue by status', sql: rawSql, limit: 500, config: SQL_CHARTS[0].config, chartKind: 'vertical_bar' } } } },
            }),
        );
        if (doc) manifest.documents.push({ uuid: doc.documentUuid, slug: doc.slug, versionUuid: doc.version?.versionUuid ?? null, inlineChartId: Object.keys(doc.version?.content?.charts ?? {})[0] ?? 'inline_sql', linkedSqlChartUuid: barChart.uuid, linkedExploreChartUuid: exploreChart?.uuid ?? null });
    } else skip('document', 'no bar chart');

    // A SQL runner share link carrying the previous release's state and SQL runner config
    if (barChart) {
        const share = await step('sql runner share link', () =>
            api('POST', '/share', {
                path: `/projects/${projectUuid}/sql-runner`,
                params: JSON.stringify({ sqlRunnerState: { projectUuid, sql: rawSql, limit: 500, activeEditorTab: 'chart', selectedChartType: 'vertical_bar', mode: 'default' }, chartConfig: SQL_CHARTS[0].config }),
            }),
        );
        if (share) manifest.shares.push({ key: 'sql_runner', nanoid: share.nanoid, url: `${BASE}/projects/${projectUuid}/sql-runner?share=${share.nanoid}` });
    }

    // Content as code snapshot: what a customer's repo holds before the upgrade
    manifest.asCode = await step('as-code snapshot', async () => {
        const sqlCharts = await api('GET', `/projects/${projectUuid}/code/sqlCharts?${repeatParam('ids', manifest.sqlCharts.map((c) => c.slug))}`);
        const charts = await api('GET', `/projects/${projectUuid}/code/charts?${repeatParam('ids', manifest.exploreCharts.map((c) => c.slug))}`);
        const dashboards = dashboard ? await api('GET', `/projects/${projectUuid}/code/dashboards?${repeatParam('ids', [dashboard.slug])}`) : null;
        const file = OUT.replace(/\.json$/, '') + '.as-code-v1.json';
        writeFileSync(file, JSON.stringify({ sqlCharts, charts, dashboards }, null, 2));
        return { file, sqlChartCount: sqlCharts.sqlCharts?.length ?? null, chartCount: charts.charts?.length ?? null };
    });

    // Raw saved_sql read through the old endpoint, kept to diff against the adapter after the upgrade
    for (const c of manifest.sqlCharts.filter((x) => !x.deleted)) {
        c.v1Read = await step(`v1 read ${c.key}`, async () => {
            const r = await raw('GET', `/projects/${projectUuid}/sqlRunner/saved/${c.uuid}`);
            const s = r.json.results;
            return s ? { name: s.name, slug: s.slug, sql: s.sql, limit: s.limit, chartKind: s.chartKind, config: s.config, spaceUuid: s.space?.uuid, views: s.views ?? null } : { status: r.status };
        });
    }

    skip('composer artifacts (AI agent)', 'need an AI key, an EE licence and the multi-source-query flag; seed by hand, see qa/08-ai-agents-mcp-slack.md');
    skip('sending the Google Sheets sync', 'needs a Google account; the seeded sync points at a placeholder sheet, see qa/04-deliveries-alerts-syncs.md');
};

main()
    .catch((e) => {
        manifest.errors.push({ step: 'main', error: e.message });
        process.stderr.write(`${e.stack ?? e}\n`);
    })
    .finally(() => {
        writeFileSync(OUT, JSON.stringify(manifest, null, 2));
        process.stderr.write(`manifest: ${OUT} (${manifest.sqlCharts.length} SQL charts, ${manifest.errors.length} errors, ${manifest.skipped.length} skipped)\n`);
        process.exit(manifest.errors.length ? 1 : 0);
    });
