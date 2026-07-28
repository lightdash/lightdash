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
import type { PromptTemplate, VizDeclaration } from './assertions.ts';

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

type VizContextFixture = {
    fieldMapping: Record<string, string>;
    dimensions: string[];
    metrics: string[];
    options: Record<string, boolean | number | string>;
    colorPalette: string[];
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
function extractCategoryValues(
    description: string | undefined,
): string[] | null {
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
            for (const [name, meta] of Object.entries(
                tableFields.get(table)!,
            )) {
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

/** The prompt's generation template; null for the default template. */
export function loadPromptTemplate(
    promptsJsonPath: string,
    promptId: string,
): PromptTemplate | null {
    const suite = JSON.parse(fs.readFileSync(promptsJsonPath, 'utf-8')) as {
        prompts: { id: string; template?: PromptTemplate }[];
    };
    return suite.prompts.find((p) => p.id === promptId)?.template ?? null;
}

const chooseVizField = (
    field: VizDeclaration['fields'][number],
    used: Set<string>,
): string => {
    const hint = `${field.name} ${field.label}`.toLowerCase();
    const candidates =
        field.type === 'metric'
            ? [
                  'orders_total_revenue',
                  'orders_order_count',
                  'orders_average_order_value',
              ]
            : /date|time|month|year|week|day|trend/.test(hint)
              ? [
                    'orders_order_date_month',
                    'orders_order_date_day',
                    'orders_customer_segment',
                ]
              : field.type === 'series'
                ? ['orders_customer_segment', 'orders_region', 'orders_status']
                : [
                      'orders_customer_segment',
                      'orders_region',
                      'orders_status',
                      'orders_order_date_month',
                  ];
    return (
        candidates.find((candidate) => !used.has(candidate)) ?? candidates[0]
    );
};

const buildVizContextFixture = (
    declaration: VizDeclaration | null,
): VizContextFixture | null => {
    if (!declaration) return null;
    const used = new Set<string>();
    const fieldMapping: Record<string, string> = {};
    const dimensions: string[] = [];
    const metrics: string[] = [];

    for (const field of declaration.fields) {
        const fieldId = chooseVizField(field, used);
        used.add(fieldId);
        fieldMapping[field.name] = fieldId;
        (field.type === 'metric' ? metrics : dimensions).push(fieldId);
    }

    return {
        fieldMapping,
        dimensions,
        metrics,
        options: Object.fromEntries(
            declaration.configOptions.map((option) => [
                option.name,
                option.default,
            ]),
        ),
        colorPalette: ['#FF3B30', '#007AFF', '#34C759', '#AF52DE'],
    };
};

export function buildHarnessHtml(
    catalog: Catalog,
    charts: Record<string, ChartFixture>,
    projectUuid: string,
    vizDeclaration: VizDeclaration | null = null,
): string {
    const harnessJs = fs.readFileSync(
        path.join(BENCH_DIR, 'harness.js'),
        'utf-8',
    );
    const config = {
        projectUuid,
        explores: catalog.explores,
        charts,
        vizContext: buildVizContextFixture(vizDeclaration),
    };
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
