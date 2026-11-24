import {
    TOOL_ANALYZE_FIELD_IMPACT_DESCRIPTION,
    TOOL_GREP_WAREHOUSE_COLUMNS_DESCRIPTION,
    TOOL_LIST_WAREHOUSE_TABLES_DESCRIPTION,
    toolAnalyzeFieldImpactArgsSchema,
    toolGrepWarehouseColumnsArgsSchema,
    toolListWarehouseTablesArgsSchema,
    WarehouseTableType,
    WarehouseTypes,
    type SemanticLayerDraftModelInput,
} from '@lightdash/common';
import { generateText, tool } from 'ai';
import { describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import { aiCopilotConfigSchema } from '../../../../config/aiConfigSchema';
import { getAiConfig } from '../../../../config/parseConfig';
import {
    foldDraft,
    foldProposal,
    withWrites,
} from '../../SemanticStudioService/draftFold';
import { getStudioCardResponse } from '../agents/agentV2';
import { getModel } from '../models';
import { getDescribeWarehouseTable } from '../tools/describeWarehouseTable';
import {
    getProposeSemanticLayerChange,
    getReadSemanticModel,
} from '../tools/semanticStudioTools';
import { getSemanticStudioSystemPrompt } from './systemV2SemanticStudio';

// Live model eval, opt in: SEMANTIC_STUDIO_EVAL=1 plus a provider key. The draft is kept in memory and folded as the service folds it; no warehouse checks a change.
const describeEval =
    process.env.SEMANTIC_STUDIO_EVAL === '1' ? describe : describe.skip;
const RUNS = Number(process.env.SEMANTIC_STUDIO_EVAL_RUNS ?? 3);
const TIMEOUT = 300_000;

const MODEL = `type: model
name: orders
label: Orders
sql_from: public.orders
dimensions:
  - name: order_id
    type: number
    sql: \${TABLE}.order_id
    metrics:
      order_count:
        type: count
  - name: status
    type: string
    sql: \${TABLE}.status
    metrics:
      status_count:
        type: count_distinct
  - name: amount
    type: number
    sql: \${TABLE}.amount
    metrics:
      revenue:
        type: sum
`;

const COLUMNS =
    'order_id bigint, customer_id bigint, status varchar, amount double';

const TABLE_COMMENT = 'One row per order placed.';
const STATUS_COMMENT = 'Where the order is in fulfilment.';
const AMOUNT_COMMENT = 'Order total in the account currency.';

const COLUMN_TYPES = [
    { name: 'order_id', type: 'number', nativeType: 'bigint' },
    { name: 'customer_id', type: 'number', nativeType: 'bigint' },
    { name: 'status', type: 'string', nativeType: 'varchar' },
    { name: 'amount', type: 'number', nativeType: 'double' },
];

const COLUMN_COMMENTS: Record<string, string | null> = {
    status: STATUS_COMMENT,
    amount: AMOUNT_COMMENT,
};

type Dimension = { name: string; metrics?: Record<string, unknown> };

/** rejectWith fails every proposal with that error, as a warehouse check would. */
const runAsk = async (prompt: string, rejectWith: string | null) => {
    const { model, callOptions, providerOptions } = getModel(
        aiCopilotConfigSchema.parse(getAiConfig()),
    );
    const live = new Map([['orders', MODEL]]);
    const drafted: SemanticLayerDraftModelInput[][] = [];
    const proposals: SemanticLayerDraftModelInput[][] = [];
    const notes: (string | null)[] = [];
    const readDraft = () => withWrites(live, foldDraft(live, drafted).writes);
    const stub = (output: string) => async () => output;

    const { text, steps } = await generateText({
        ...callOptions,
        providerOptions,
        model,
        // The harness ends a turn on its card once a change joined the draft cleanly.
        stopWhen: ({ steps: taken }) =>
            taken.length >= 12 || getStudioCardResponse(taken) !== null,
        instructions: getSemanticStudioSystemPrompt({
            agentName: 'Agent',
            date: '2026-01-01',
            instructions: undefined,
            projectContext: null,
            warehouse: { type: 'duckdb', schema: 'public' },
            studio: {
                kind: 'draft',
                canQueryDraft: false,
                canDraftContext: false,
            },
        }),
        prompt,
        tools: {
            readSemanticModel: getReadSemanticModel({
                readSemanticModel: async (name) => {
                    const draft = readDraft();
                    return {
                        content: draft.get(name) ?? null,
                        inDraft: drafted.some((change) =>
                            change.some((item) => item.name === name),
                        ),
                        modelNames: [...draft.keys()],
                    };
                },
            }),
            proposeSemanticLayerChange: getProposeSemanticLayerChange({
                canRunMetrics: false,
                proposeSemanticLayerChange: async (models) => {
                    proposals.push(models);
                    if (rejectWith !== null) {
                        return {
                            results: models.map(({ name }) => ({
                                model: name,
                                status: 'failed' as const,
                                changes: [],
                                refusals: [],
                                error: rejectWith,
                                notes: [],
                            })),
                            diffs: [],
                            draftChangeUuid: null,
                            startedChange: null,
                        };
                    }
                    const before = readDraft();
                    const { results, writes } = foldProposal(
                        live,
                        drafted,
                        models,
                    );
                    const passing = models.filter(
                        (_item, index) => results[index].status === 'ready',
                    );
                    if (passing.length === 0) {
                        return {
                            results,
                            diffs: [],
                            draftChangeUuid: null,
                            startedChange: null,
                        };
                    }
                    drafted.push(passing);
                    return {
                        results,
                        diffs: [
                            ...new Set(passing.map(({ name }) => name)),
                        ].map((name) => ({
                            model: name,
                            contentBefore: before.get(name) ?? null,
                            contentAfter: writes.get(name) ?? null,
                        })),
                        draftChangeUuid: `draft-${drafted.length}`,
                        startedChange: null,
                    };
                },
            }),
            analyzeFieldImpact: tool({
                description: TOOL_ANALYZE_FIELD_IMPACT_DESCRIPTION,
                inputSchema: toolAnalyzeFieldImpactArgsSchema,
                execute: stub('No saved chart or dashboard uses this field.'),
            }),
            listWarehouseTables: tool({
                description: TOOL_LIST_WAREHOUSE_TABLES_DESCRIPTION,
                inputSchema: toolListWarehouseTablesArgsSchema,
                execute: stub('memory.public.orders'),
            }),
            describeWarehouseTable: getDescribeWarehouseTable({
                describeWarehouseTable: async () => ({
                    columns: COLUMN_TYPES,
                    resolvedSchema: 'public',
                    resolvedDatabase: 'memory',
                    partitioning: null,
                    metadata: {
                        tableType: WarehouseTableType.TABLE,
                        comment: TABLE_COMMENT,
                        columns: COLUMN_TYPES.map(({ name }) => ({
                            name,
                            comment: COLUMN_COMMENTS[name] ?? null,
                            isMeasure: false,
                        })),
                        definition: null,
                    },
                    warehouseType: WarehouseTypes.DATABRICKS,
                }),
            }),
            grepWarehouseColumns: tool({
                description: TOOL_GREP_WAREHOUSE_COLUMNS_DESCRIPTION,
                inputSchema: toolGrepWarehouseColumnsArgsSchema,
                execute: stub(`memory.public.orders: ${COLUMNS}`),
            }),
        },
    });
    steps
        .flatMap(({ toolCalls }) => toolCalls)
        .forEach(({ toolName, input }) => {
            if (
                toolName === 'proposeSemanticLayerChange' &&
                typeof input === 'object' &&
                input !== null &&
                'note' in input
            ) {
                notes.push(typeof input.note === 'string' ? input.note : null);
            }
        });
    const content = readDraft().get('orders') ?? '';
    const parsed: unknown = parse(content);
    const dimensions: Dimension[] =
        typeof parsed === 'object' &&
        parsed !== null &&
        'dimensions' in parsed &&
        Array.isArray(parsed.dimensions)
            ? parsed.dimensions
            : [];
    process.stdout.write(
        `\n[studio draft eval] "${prompt}"\n  tools: ${steps
            .flatMap(({ toolCalls }) => toolCalls)
            .map(({ toolName }) => toolName)
            .join(
                ', ',
            )}\n  proposals: ${JSON.stringify(proposals)}\n  notes: ${JSON.stringify(notes)}\n  reply: ${text}\n`,
    );
    const metricsOf = (name: string) =>
        Object.keys(
            dimensions.find((dimension) => dimension.name === name)?.metrics ??
                {},
        );
    return {
        content,
        proposals,
        toolNames: steps
            .flatMap(({ toolCalls }) => toolCalls)
            .map(({ toolName }) => toolName),
        said: [text, ...notes].join(' '),
        metricsOf,
        hasDimension: (name: string) =>
            dimensions.some((dimension) => dimension.name === name),
    };
};

const runMany = (prompt: string, rejectWith: string | null = null) =>
    Promise.all(Array.from({ length: RUNS }, () => runAsk(prompt, rejectWith)));

describeEval('Semantic Studio changes a model in the draft', () => {
    // The unit setup stubs fetch; this suite talks to the provider.
    vi.unstubAllGlobals();

    it(
        'moves a metric onto a new dimension without losing it',
        async () => {
            const runs = await runMany(
                'move order_count onto a new customer_id dimension',
            );
            runs.forEach(({ metricsOf }) => {
                expect(metricsOf('customer_id')).toContain('order_count');
                expect(metricsOf('order_id')).not.toContain('order_count');
            });
        },
        TIMEOUT,
    );

    it(
        'renames a dimension and keeps its metric',
        async () => {
            const runs = await runMany(
                'rename the status dimension to order_status and keep its metric',
            );
            runs.forEach(({ metricsOf, hasDimension }) => {
                expect(hasDimension('status')).toBe(false);
                expect(metricsOf('order_status')).toContain('status_count');
            });
        },
        TIMEOUT,
    );

    it(
        'makes the part it can when another part is refused, and says what it left out',
        async () => {
            const runs = await runMany(
                'label the model Sales orders and tag the amount dimension as finance',
            );
            runs.forEach(({ content, said }) => {
                expect(content).toContain('label: Sales orders');
                expect(content).not.toMatch(/tags/);
                expect(said).toMatch(/tag/i);
            });
        },
        TIMEOUT,
    );

    it(
        'drafts descriptions from warehouse comments without asking for a paste',
        async () => {
            const runs = await runMany(
                'add descriptions to the orders model from the warehouse',
            );
            runs.forEach(({ toolNames, content, said }) => {
                expect(toolNames).toContain('describeWarehouseTable');
                expect(content).toContain(TABLE_COMMENT);
                expect(content).toContain(STATUS_COMMENT);
                expect(content).toContain(AMOUNT_COMMENT);
                expect(said).not.toMatch(/paste/i);
            });
        },
        TIMEOUT,
    );

    it(
        'explains a rejected change without offering a hand edit around it',
        async () => {
            const runs = await runMany(
                'add a count_distinct metric on customer_id to the orders model',
                'The warehouse refused the check query: permission denied on table memory.public.orders.',
            );
            runs.forEach(({ proposals, said }) => {
                expect(proposals.length).toBeGreaterThan(0);
                expect(said).not.toMatch(
                    /code tab|by hand|manually|paste|yaml yourself/i,
                );
            });
        },
        TIMEOUT,
    );
});
