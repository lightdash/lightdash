/* eslint-disable no-console */
/**
 * PROTOTYPE (ZAP-1278) — throwaway runner.
 * Runs real Jaffle shop composer pipelines, drives the model through schema A
 * and schema B for each question, validates against the node's columns,
 * renders through @lightdash/visualization headlessly, and writes REPORT.md.
 *
 *   direnv exec . npx tsx packages/backend/src/ee/services/ai/tools/__prototype__/visualizeNodeSchema/run.ts
 */
import { createAnthropic } from '@ai-sdk/anthropic';
import {
    QueryHistoryStatus,
    QuerySourceType,
    type DataAppVizField,
    type PivotConfiguration,
    type ResultColumns,
    type SourceQuery,
} from '@lightdash/common';
import { generateText, tool, type ModelMessage } from 'ai';
import { createRequire } from 'module';
import { writeFileSync } from 'fs';
import path from 'path';
import {
    columnsToFields,
    pivotFor,
    resolveA,
    resolveB,
    schemaA,
    schemaB,
    toEditableLayout,
    validateResolved,
    type Resolved,
} from './visualizeNodeSchemas';

const require_ = createRequire(__filename);
// Backend does not depend on the visualization package; load the built CJS.
const viz = require_(
    path.resolve(__dirname, '../../../../../../../../visualization/dist/cjs/index.js'),
) as typeof import('../../../../../../../../visualization/src/index');

const URL_ = process.env.LIGHTDASH_URL!;
const KEY = process.env.LIGHTDASH_API_KEY!;
const PROJECT = '3675b69e-8324-4110-bdca-059031aa8da3';
const MODEL = process.env.PROTO_MODEL ?? 'claude-sonnet-5-5';

// ------------------------------------------------------------------ api

const api = async <T>(p: string, init?: RequestInit): Promise<T> => {
    const res = await fetch(`${URL_}${p}`, {
        ...init,
        headers: { Authorization: `ApiKey ${KEY}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
    const json = (await res.json()) as { status: string; results: T; error?: { message: string } };
    if (json.status !== 'ok') throw new Error(json.error?.message ?? JSON.stringify(json));
    return json.results;
};

type Ready = {
    status: string;
    queryUuid: string;
    columns: ResultColumns;
    pivotDetails: unknown | null;
    error?: string;
};

const poll = async (queryUuid: string): Promise<Ready> => {
    for (;;) {
        const r = await api<Ready>(`/api/v2/projects/${PROJECT}/query/${queryUuid}`);
        if (r.status === QueryHistoryStatus.READY) return r;
        if (r.status === QueryHistoryStatus.ERROR) throw new Error(r.error ?? 'query error');
        await new Promise((res) => setTimeout(res, 300));
    }
};

const rows = async (queryUuid: string): Promise<Record<string, unknown>[]> => {
    const res = await fetch(`${URL_}/api/v2/projects/${PROJECT}/query/${queryUuid}/results`, {
        headers: { Authorization: `ApiKey ${KEY}` },
    });
    return (await res.text()).split('\n').filter(Boolean).map((l) => JSON.parse(l));
};

type NodeResult = { queryUuid: string; columns: ResultColumns; rows: Record<string, unknown>[]; pivotDetails: unknown | null };

const runPipeline = async (queries: SourceQuery[], terminal: string): Promise<NodeResult> => {
    const { queries: subs } = await api<{ queries: { nodeId: string; queryUuid: string }[] }>(
        `/api/v2/projects/${PROJECT}/query-sources/queries`,
        { method: 'POST', body: JSON.stringify({ queries }) },
    );
    const t = subs.find((s) => s.nodeId === terminal)!;
    const ready = await poll(t.queryUuid);
    return { queryUuid: t.queryUuid, columns: ready.columns, rows: await rows(t.queryUuid), pivotDetails: ready.pivotDetails };
};

/** The pivot mechanism under test: one DuckDB node on the compose engine reading the stored result. */
const pivotOnEngine = async (queryUuid: string, pivotConfiguration: PivotConfiguration): Promise<NodeResult> =>
    runPipeline(
        [
            {
                sourceType: QuerySourceType.DUCKDB,
                nodeId: 'viz_pivot',
                sql: 'SELECT * FROM src',
                references: { src: queryUuid },
                pivotConfiguration,
            },
        ],
        'viz_pivot',
    );

// ------------------------------------------------- installed custom types (local DB, 2026-10-20)

const CUSTOM_TYPES: Record<string, DataAppVizField[]> = {
    heatmap: [
        { name: 'x', type: 'dimension', label: 'X axis', required: true },
        { name: 'y', type: 'dimension', label: 'Y axis', required: true },
        { name: 'value', type: 'metric', label: 'Value (cell color)', required: true },
    ],
    'big-number-with-sparkline-trend': [
        { name: 'value', type: 'metric', label: 'Value', required: true },
        { name: 'comparisonValue', type: 'metric', label: 'Comparison value', required: false },
        { name: 'time', type: 'dimension', label: 'Trend date/time', required: false },
        { name: 'sparklineMetric', type: 'metric', label: 'Sparkline metric', required: false },
        { name: 'target', type: 'metric', label: 'Target / goal', required: false },
    ],
    'customizable-cartesian-chart': [
        { name: 'x', type: 'dimension', label: 'X axis', required: true },
        { name: 'm1', type: 'metric', label: 'Metric 1', required: true },
        { name: 'm2', type: 'metric', label: 'Metric 2', required: false },
        { name: 'splitBy', type: 'dimension', label: 'Split by', required: false },
    ],
    'word-cloud': [
        { name: 'word', type: 'dimension', label: 'Words', required: true },
        { name: 'size', type: 'metric', label: 'Size by', required: true },
        { name: 'colorBy', type: 'dimension', label: 'Color by', required: false },
    ],
    'sortable-pivot-table': [
        { name: 'rowDimension', type: 'dimension', label: 'Row grouping', required: true },
        { name: 'series', type: 'series', label: 'Column pivot', required: false },
        { name: 'metric', type: 'metric', label: 'Values', multiple: true, required: true },
    ],
};
const lookupCustomType = (slug: string) => CUSTOM_TYPES[slug] ?? null;
const customTypesPrompt = Object.entries(CUSTOM_TYPES)
    .map(([slug, slots]) => `- ${slug}: ${slots.map((s) => `${s.name}(${s.type}${s.required ? ', required' : ''}${s.multiple ? ', multiple' : ''})`).join(', ')}`)
    .join('\n');

// ----------------------------------------------------------- questions

const sl = (nodeId: string, dimensions: string[], metrics: string[], extra: Partial<SourceQuery> = {}): SourceQuery =>
    ({ sourceType: QuerySourceType.SEMANTIC_LAYER, nodeId, exploreName: 'orders', dimensions, metrics, limit: 500, ...extra }) as SourceQuery;

type Question = { id: string; question: string; queries: SourceQuery[]; terminal: string; expect: string };

const QUESTIONS: Question[] = [
    {
        id: 'q1_stacked',
        question: 'Show monthly revenue broken down by order status, as a stacked bar chart.',
        queries: [sl('monthly_revenue_by_status', ['orders_order_date_month', 'orders_status'], ['orders_total_order_amount'], { sorts: [{ fieldId: 'orders_order_date_month', descending: false }] })],
        terminal: 'monthly_revenue_by_status',
        expect: 'stacked bar, x=month, y=total amount, groupBy=status (forces the pivot)',
    },
    {
        id: 'q2_bignumber',
        question: 'What is our total revenue to date?',
        queries: [sl('total_revenue', [], ['orders_total_order_amount'])],
        terminal: 'total_revenue',
        expect: 'big number on the single numeric column',
    },
    {
        id: 'q3_pie_duckdb',
        question: 'What share of revenue does each order status account for?',
        queries: [
            sl('rev_by_status', ['orders_status'], ['orders_total_order_amount']),
            {
                sourceType: QuerySourceType.DUCKDB,
                nodeId: 'revenue_share',
                sql: 'SELECT orders_status AS status, orders_total_order_amount AS revenue, ROUND(100.0 * orders_total_order_amount / SUM(orders_total_order_amount) OVER (), 1) AS share_pct FROM o ORDER BY revenue DESC',
                references: { o: 'rev_by_status' },
            },
        ],
        terminal: 'revenue_share',
        expect: 'pie over renamed DuckDB columns (no provenance): x=status, y=revenue or share_pct',
    },
    {
        id: 'q4_dual_axis',
        question: 'Plot the monthly trend of order count together with average order amount.',
        queries: [sl('monthly_orders', ['orders_order_date_month'], ['orders_unique_order_count', 'orders_average_order_amount'], { sorts: [{ fieldId: 'orders_order_date_month', descending: false }] })],
        terminal: 'monthly_orders',
        expect: 'line, two y columns, ideally a secondary axis for the average',
    },
    {
        id: 'q5_custom_heatmap',
        question: 'Show a heatmap of revenue by month and order status using the installed heatmap chart type.',
        queries: [sl('heat', ['orders_order_date_month', 'orders_status'], ['orders_total_order_amount'])],
        terminal: 'heat',
        expect: 'custom chart type heatmap: x=month, y=status, value=amount, slots bound to column references',
    },
];

// ---------------------------------------------------------------- render

const render = (r: Resolved, node: NodeResult) => {
    const fields = columnsToFields(node.columns);
    const data = {
        rows: viz.toResultRows(node.rows as never, fields as never),
        fields,
        pivotDetails: node.pivotDetails as never,
    };
    const rendered = viz.renderChart(
        { chartConfig: r.chartConfig, pivotConfig: r.pivotColumns.length ? { columns: r.pivotColumns } : undefined },
        data as never,
        { colors: { palette: ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd'] }, size: { width: 800, height: 400 } },
    );
    switch (rendered.kind) {
        case 'echarts': {
            const series = (rendered.option as { series?: unknown[] }).series ?? [];
            return { kind: 'echarts', series: Array.isArray(series) ? series.length : 1 };
        }
        case 'bigNumber':
            return { kind: 'bigNumber', value: (rendered.model as { value: unknown }).value };
        case 'table':
            return { kind: 'table' };
        case 'empty':
            return { kind: 'empty', reason: rendered.reason };
        case 'unsupported':
            return { kind: 'unsupported' };
        default:
            return { kind: rendered.kind };
    }
};

// ------------------------------------------------------------------- llm

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type Attempt = { args: unknown; errors: string[]; zodError: string | null };
type Trial = { schema: 'A' | 'B'; attempts: Attempt[]; resolved: Resolved | null; editable: unknown; rendered: unknown; pivot: unknown; ms: number; tokens: number };

const describeNode = (q: Question, node: NodeResult) => {
    const cols = Object.values(node.columns).map((c) => `${c.reference} (${c.type}${c.label ? `, "${c.label}"` : ''})`).join(', ');
    const sample = node.rows.slice(0, 5).map((r) => JSON.stringify(r)).join('\n');
    return `Node "${q.terminal}" returned ${node.rows.length} rows.\nColumns: ${cols}.\nSample rows:\n${sample}\n\nInstalled custom chart types (slug: slots):\n${customTypesPrompt}`;
};

const SYSTEM = `You are a data analyst agent. You already ran a composer query; now present it to the user by calling visualizeNode exactly once with the best chart for the question. Reference columns exactly by their column reference. Pick the chart the question asks for.`;

const trial = async (q: Question, node: NodeResult, schema: 'A' | 'B'): Promise<Trial> => {
    const zodSchema = schema === 'A' ? schemaA : schemaB;
    const started = Date.now();
    let tokens = 0;
    const attempts: Attempt[] = [];
    const messages: ModelMessage[] = [
        { role: 'user', content: `Question: ${q.question}\n\n${describeNode(q, node)}` },
    ];
    let resolved: Resolved | null = null;
    for (let i = 0; i < 3 && !resolved; i += 1) {
        // Loose tool so zod errors are ours to report, mirroring the real validation path.
        const result = await generateText({
            model: anthropic(MODEL),
            system: SYSTEM,
            messages,
            tools: { visualizeNode: tool({ description: 'Visualize a composer node for the user.', inputSchema: zodSchema }) },
            toolChoice: 'auto',
        });
        tokens += result.usage.totalTokens ?? 0;
        const call = result.toolCalls[0];
        if (!call) {
            attempts.push({ args: null, errors: [`no tool call; model said: ${result.text.slice(0, 200)}`], zodError: null });
            messages.push({ role: 'assistant', content: result.text || '(no text)' });
            messages.push({ role: 'user', content: 'Call visualizeNode now.' });
            continue;
        }
        const raw = call.input;
        const parsed = zodSchema.safeParse(raw);
        let errors: string[] = [];
        let zodError: string | null = null;
        if (!parsed.success) {
            zodError = parsed.error.issues.map((is) => `${is.path.join('.')}: ${is.message}`).join('; ');
            errors = [zodError];
        } else {
            const r = schema === 'A' ? resolveA(parsed.data as never) : resolveB(parsed.data as never);
            errors = validateResolved(r, node.columns, lookupCustomType);
            if (errors.length === 0) resolved = r;
        }
        attempts.push({ args: raw, errors, zodError });
        if (!resolved) {
            messages.push({ role: 'assistant', content: [{ type: 'tool-call', toolCallId: call?.toolCallId ?? `c${i}`, toolName: 'visualizeNode', input: raw }] });
            messages.push({ role: 'tool', content: [{ type: 'tool-result', toolCallId: call?.toolCallId ?? `c${i}`, toolName: 'visualizeNode', output: { type: 'text', value: `Invalid visualization: ${errors.join(' ')} Fix and call visualizeNode again.` } }] });
        }
    }
    let rendered: unknown = null;
    let pivot: unknown = null;
    if (resolved) {
        const pc = pivotFor(resolved, node.columns);
        if (pc) {
            const unpivoted = render(resolved, node);
            const pivoted = await pivotOnEngine(node.queryUuid, pc);
            rendered = render(resolved, pivoted);
            pivot = { unpivotedRender: unpivoted, pivotColumns: Object.keys(pivoted.columns), pivotRows: pivoted.rows.length };
        } else {
            rendered = render(resolved, node);
        }
    }
    return { schema, attempts, resolved, editable: resolved ? toEditableLayout(resolved) : null, rendered, pivot, ms: Date.now() - started, tokens };
};

// ------------------------------------------------------------------ main

const main = async () => {
    const out: { id: string; question: string; expect: string; columns: string[]; rows: number; trials: Trial[] }[] = [];
    for (const q of QUESTIONS) {
        console.log(`\n== ${q.id}: ${q.question}`);
        const node = await runPipeline(q.queries, q.terminal);
        console.log(`   columns: ${Object.keys(node.columns).join(', ')} (${node.rows.length} rows)`);
        const trials: Trial[] = [];
        for (const schema of ['A', 'B'] as const) {
            const t = await trial(q, node, schema);
            trials.push(t);
            console.log(`   [${schema}] attempts=${t.attempts.length} ok=${!!t.resolved} render=${JSON.stringify(t.rendered)} editable=${JSON.stringify(t.editable)} ${t.ms}ms ${t.tokens}tok`);
            t.attempts.forEach((a, i) => a.errors.length && console.log(`       attempt ${i + 1} errors: ${a.errors.join(' | ')}`));
        }
        out.push({ id: q.id, question: q.question, expect: q.expect, columns: Object.keys(node.columns), rows: node.rows.length, trials });
    }
    const file = path.join(__dirname, 'results.json');
    writeFileSync(file, JSON.stringify(out, null, 2));
    console.log(`\nwrote ${file}`);
};

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
