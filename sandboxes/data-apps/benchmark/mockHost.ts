/**
 * Node-side half of the render gate's mock Lightdash host: parses the fixture
 * catalog (schema.yml) into explore/field metadata, loads chart-reference
 * fixtures, and assembles the harness page that embeds harness.js with that
 * config. The browser half (harness.js) answers the SDK postMessage protocol.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const BENCH_DIR = path.dirname(fileURLToPath(import.meta.url));

export type CatalogFieldMeta = {
    kind: 'dimension' | 'metric';
    /** dimension: date|timestamp|string|number|boolean; metric: warehouse-ish type */
    type: string;
    label: string;
    /** raw|day|week|month|quarter|year for time-interval dimension variants */
    interval: string | null;
    /** category values parsed from the column description, when enumerable */
    values: string[] | null;
    metricType: string | null;
    format: string | null;
};

export type Catalog = {
    explores: Record<
        string,
        { tables: string[]; fields: Record<string, CatalogFieldMeta> }
    >;
};

export type ChartFixture = {
    exploreName: string;
    metricQuery: Record<string, unknown>;
};

type SchemaColumn = {
    name: string;
    description?: string;
    meta?: {
        dimension?: { type?: string; time_intervals?: string[] };
    };
};

type SchemaModel = {
    name: string;
    meta?: {
        joins?: { join: string }[];
        metrics?: Record<
            string,
            { type?: string; label?: string; format?: string }
        >;
    };
    columns?: SchemaColumn[];
};

/**
 * Pull enumerable category values out of a column description like
 * "Order status: placed, shipped, completed, returned." so synthesized rows
 * carry the values generated apps expect to see (and filter on).
 */
function extractCategoryValues(description: string | undefined): string[] | null {
    if (!description) return null;
    const colon = description.lastIndexOf(':');
    const candidate = colon === -1 ? description : description.slice(colon + 1);
    const tokens = candidate
        .split(',')
        .map((t) => t.trim().replace(/\.$/, ''))
        .filter(Boolean);
    const enumerable =
        tokens.length >= 2 &&
        tokens.length <= 8 &&
        tokens.every((t) => /^[A-Za-z][A-Za-z0-9_ -]{0,23}$/.test(t));
    return enumerable ? tokens : null;
}

const TIME_INTERVAL_TYPES: Record<string, string> = {
    day: 'date',
    week: 'date',
    month: 'date',
    quarter: 'date',
    year: 'date',
};

export function parseCatalog(schemaYmlPath: string): Catalog {
    const doc = YAML.parse(fs.readFileSync(schemaYmlPath, 'utf-8')) as {
        models?: SchemaModel[];
    };
    const models = doc.models ?? [];

    // Unqualified field maps per model, used to assemble explores below.
    const tableFields = new Map<string, Record<string, CatalogFieldMeta>>();
    for (const model of models) {
        const fields: Record<string, CatalogFieldMeta> = {};
        for (const column of model.columns ?? []) {
            const dim = column.meta?.dimension ?? {};
            const baseType = dim.type ?? 'string';
            const values = extractCategoryValues(column.description);
            fields[column.name] = {
                kind: 'dimension',
                type: baseType,
                label: column.name,
                interval: null,
                values,
                metricType: null,
                format: null,
            };
            for (const rawInterval of dim.time_intervals ?? []) {
                const interval = rawInterval.toLowerCase();
                fields[`${column.name}_${interval}`] = {
                    kind: 'dimension',
                    type: TIME_INTERVAL_TYPES[interval] ?? baseType,
                    label: `${column.name} (${interval})`,
                    interval,
                    values: null,
                    metricType: null,
                    format: null,
                };
            }
        }
        for (const [name, metric] of Object.entries(
            model.meta?.metrics ?? {},
        )) {
            fields[name] = {
                kind: 'metric',
                type: metric.type ?? 'number',
                label: metric.label ?? name,
                interval: null,
                values: null,
                metricType: metric.type ?? null,
                format: metric.format ?? null,
            };
        }
        tableFields.set(model.name, fields);
    }

    const catalog: Catalog = { explores: {} };
    for (const model of models) {
        const tables = [
            model.name,
            ...(model.meta?.joins ?? []).map((j) => j.join),
        ].filter((t) => tableFields.has(t));
        const fields: Record<string, CatalogFieldMeta> = {};
        for (const table of tables) {
            for (const [name, meta] of Object.entries(tableFields.get(table)!)) {
                fields[`${table}_${name}`] = meta;
            }
        }
        catalog.explores[model.name] = { tables, fields };
    }
    return catalog;
}

/**
 * Chart fixtures for a prompt: every /tmp/metric-queries/*.json sandbox file
 * declared in prompts.json, keyed by chartUuid so the harness can answer
 * /query/chart calls for linked charts.
 */
export function loadChartFixtures(
    promptsJsonPath: string,
    promptId: string,
): Record<string, ChartFixture> {
    const suite = JSON.parse(fs.readFileSync(promptsJsonPath, 'utf-8')) as {
        prompts: {
            id: string;
            sandboxFiles?: Record<string, string>;
        }[];
    };
    const spec = suite.prompts.find((p) => p.id === promptId);
    const charts: Record<string, ChartFixture> = {};
    for (const [sandboxPath, localRel] of Object.entries(
        spec?.sandboxFiles ?? {},
    )) {
        if (!sandboxPath.startsWith('/tmp/metric-queries/')) continue;
        try {
            const fixture = JSON.parse(
                fs.readFileSync(path.join(BENCH_DIR, localRel), 'utf-8'),
            ) as {
                chartUuid?: string;
                exploreName?: string;
                metricQuery?: Record<string, unknown>;
            };
            if (fixture.chartUuid && fixture.exploreName) {
                charts[fixture.chartUuid] = {
                    exploreName: fixture.exploreName,
                    metricQuery: fixture.metricQuery ?? {},
                };
            }
        } catch {
            // A malformed fixture shouldn't kill the gate — the app's own
            // /query/chart call will just get "Chart not found".
        }
    }
    return charts;
}

export function buildHarnessHtml(
    catalog: Catalog,
    charts: Record<string, ChartFixture>,
    projectUuid: string,
): string {
    const harnessJs = fs.readFileSync(path.join(BENCH_DIR, 'harness.js'), 'utf-8');
    const config = { projectUuid, explores: catalog.explores, charts };
    // <-escape so a stray "</script>" inside config can't break the page.
    const configJson = JSON.stringify(config).replace(/</g, '\\u003c');
    // Target the assignment specifically — the docblock also mentions the
    // placeholder, and a bare .replace() would only hit that first mention.
    const script = harnessJs.replace(
        'var CONFIG = __BENCH_CONFIG__;',
        `var CONFIG = ${configJson};`,
    );
    if (script === harnessJs) {
        throw new Error('harness.js is missing the CONFIG assignment marker');
    }
    const iframeSrc = `./app/index.html#transport=postMessage&projectUuid=${encodeURIComponent(
        projectUuid,
    )}`;
    return [
        '<!doctype html>',
        '<html><head><meta charset="utf-8"><title>bench harness</title>',
        '<style>html,body{margin:0;padding:0;background:#fff}iframe{border:0;width:1440px;height:900px;display:block}</style>',
        '</head><body>',
        `<iframe id="app-frame" src="${iframeSrc}"></iframe>`,
        `<script>${script}</script>`,
        '</body></html>',
    ].join('\n');
}
