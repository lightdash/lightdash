import {
    DimensionType,
    FieldType,
    SupportedDbtAdapter,
    toolGrepFieldsOutputSchema,
    type Explore,
} from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import Logger from '../../../../logging/logger';
import type { FindExploresFn } from '../types/aiAgentDependencies';
import { getGrepFields } from './grepFields';

vi.mock('@sentry/node', () => ({
    captureException: vi.fn(),
    addBreadcrumb: vi.fn(),
    getActiveSpan: vi.fn(),
}));

vi.mock('../../../../logging/logger', () => ({
    __esModule: true,
    default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

type FieldSpec = {
    name: string;
    label?: string;
    description?: string;
    table?: string;
};

const makeExplore = (over: {
    name: string;
    label?: string;
    aiHint?: string | string[];
    fields: FieldSpec[];
}): Explore => ({
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    name: over.name,
    label: over.label ?? over.name,
    tags: [],
    aiHint: over.aiHint,
    spotlight: { visibility: 'show', categories: [] },
    baseTable: over.name,
    joinedTables: Array.from(
        new Set(
            over.fields
                .map((f) => f.table)
                .filter((table): table is string => Boolean(table)),
        ),
    ).map((table) => ({
        table,
        sqlOn: '${orders.id} = ${TABLE}.order_id',
        compiledSqlOn: 'orders.id = joined.order_id',
    })),
    tables: {
        ...Object.fromEntries(
            [
                over.name,
                ...new Set(over.fields.map((f) => f.table).filter(Boolean)),
            ]
                .filter((table): table is string => Boolean(table))
                .map((table) => [
                    table,
                    {
                        name: table,
                        label: table,
                        database: 'test_db',
                        schema: 'public',
                        sqlTable: table,
                        sqlWhere: undefined,
                        uncompiledSqlWhere: undefined,
                        description: undefined,
                        dimensions: Object.fromEntries(
                            over.fields
                                .filter((f) => (f.table ?? over.name) === table)
                                .map((f) => [
                                    f.name,
                                    {
                                        fieldType: FieldType.DIMENSION,
                                        type: DimensionType.STRING,
                                        name: f.name,
                                        label: f.label ?? f.name,
                                        table,
                                        tableLabel: table,
                                        sql: `\${TABLE}.${f.name}`,
                                        hidden: false,
                                        source: undefined,
                                        compiledSql: `${table}.${f.name}`,
                                        tablesReferences: [table],
                                        description: f.description,
                                    },
                                ]),
                        ),
                        metrics: {},
                        lineageGraph: {},
                    },
                ]),
        ),
    },
});

type ExecuteResult = {
    result: string;
    metadata: {
        status: string;
        patternStats?: Array<{
            pattern: string;
            matchCount: number;
            scopeSize: number;
            matchedAllFields: boolean;
        }>;
    };
    structuredContent: unknown;
};

const ftsField = (name: string, tableName: string) => ({
    tableName,
    name,
    label: name,
    fieldType: 'dimension',
    description: undefined,
    verifiedChartUsage: 0,
    chartUsage: 0,
    searchRank: 1,
});

const execute = async (
    tool: ReturnType<typeof getGrepFields>,
    args: { patterns: string[]; exploreName: string | null },
): Promise<ExecuteResult> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await tool.execute!(args, {} as any);
    return result as ExecuteResult;
};

describe('grepFields FTS cross-check on successful greps', () => {
    const explore = makeExplore({
        name: 'orders',
        fields: [
            { name: 'status', label: 'Status' },
            { name: 'amount', label: 'Amount' },
        ],
    });

    it('appends FTS fields that literal grep missed, even when grep matched', async () => {
        // FTS (stemming) can find what a literal grep can't — e.g. searching
        // "statuses" only FTS surfaces the singular field. The cross-check must
        // run on SUCCESSFUL greps too, not just as a dry-grep fallback.
        const findExplores = vi.fn(async () => ({
            topMatchingFields: [ftsField('payment_state', 'payments')],
        })) as unknown as FindExploresFn;
        const tool = getGrepFields({
            availableExplores: [explore],
            findExplores,
            verifiedFieldUsage: new Map(),
        });
        const { result } = await execute(tool, {
            patterns: ['status'],
            exploreName: null,
        });
        // grep hit is present…
        expect(result).toContain('orders_status');
        // …and the FTS-only field is appended as a cross-check
        expect(result).toContain('payments_payment_state');
        expect(findExplores).toHaveBeenCalled();
    });

    it('does not duplicate fields grep already matched', async () => {
        const findExplores = vi.fn(async () => ({
            topMatchingFields: [ftsField('status', 'orders')],
        })) as unknown as FindExploresFn;
        const tool = getGrepFields({
            availableExplores: [explore],
            findExplores,
            verifiedFieldUsage: new Map(),
        });
        const { result } = await execute(tool, {
            patterns: ['status'],
            exploreName: null,
        });
        const occurrences = result.split('orders_status').length - 1;
        expect(occurrences).toBe(1);
    });

    it('degrades silently when the FTS cross-check fails', async () => {
        const findExplores = vi.fn(async () => {
            throw new Error('fts down');
        }) as unknown as FindExploresFn;
        const tool = getGrepFields({
            availableExplores: [explore],
            findExplores,
            verifiedFieldUsage: new Map(),
        });
        const { result, metadata } = await execute(tool, {
            patterns: ['status'],
            exploreName: null,
        });
        expect(metadata.status).toBe('success');
        expect(result).toContain('orders_status');
    });

    it('keeps joined-table FTS matches when scoped to an explore', async () => {
        const joinedExplore = makeExplore({
            name: 'orders',
            fields: [
                { name: 'status', label: 'Status' },
                {
                    table: 'customers',
                    name: 'name',
                    label: 'Customer name',
                },
            ],
        });
        const findExplores = vi.fn(async () => ({
            topMatchingFields: [
                ftsField('name', 'customers'),
                ftsField('name', 'products'),
            ],
        })) as unknown as FindExploresFn;
        const tool = getGrepFields({
            availableExplores: [joinedExplore],
            findExplores,
            verifiedFieldUsage: new Map(),
        });

        const { result } = await execute(tool, {
            patterns: ['client'],
            exploreName: 'orders',
        });

        expect(result).toContain('customers_name');
        expect(result).not.toContain('products_name');
    });
});

describe('grepFields pattern stats metadata', () => {
    it('reports per-pattern match counts and scope size for monitoring', async () => {
        const explore = makeExplore({
            name: 'orders',
            fields: [
                { name: 'status', label: 'Status' },
                { name: 'amount', label: 'Amount' },
            ],
        });
        const findExplores = vi.fn(async () => ({
            topMatchingFields: [],
        })) as unknown as FindExploresFn;
        const tool = getGrepFields({
            availableExplores: [explore],
            findExplores,
            verifiedFieldUsage: new Map(),
        });
        const { metadata } = await execute(tool, {
            patterns: ['status', 'nomatchxyz'],
            exploreName: null,
        });
        expect(metadata.patternStats).toEqual([
            {
                pattern: 'status',
                matchCount: 1,
                scopeSize: 2,
                matchedAllFields: false,
            },
            {
                pattern: 'nomatchxyz',
                matchCount: 0,
                scopeSize: 2,
                matchedAllFields: false,
            },
        ]);
    });

    it('flags matchedAllFields — the fingerprint of a broken/too-broad grep', async () => {
        const explore = makeExplore({
            name: 'orders',
            fields: Array.from({ length: 30 }, (_, i) => ({
                name: `order_attr_${i}`,
                label: `Order Attr ${i}`,
            })),
        });
        const findExplores = vi.fn(async () => ({
            topMatchingFields: [],
        })) as unknown as FindExploresFn;
        const tool = getGrepFields({
            availableExplores: [explore],
            findExplores,
            verifiedFieldUsage: new Map(),
        });
        const { metadata } = await execute(tool, {
            patterns: ['order'],
            exploreName: 'orders',
        });
        expect(metadata.patternStats).toHaveLength(1);
        expect(metadata.patternStats![0]).toMatchObject({
            matchCount: 30,
            scopeSize: 30,
            matchedAllFields: true,
        });
    });
});

describe('grepFields output envelope', () => {
    const explore = makeExplore({
        name: 'orders',
        fields: [
            { name: 'status', label: 'Status', description: 'Order status.' },
            { name: 'amount', label: 'Amount' },
        ],
    });

    it('returns structuredContent that parses and carries the facts the text shows', async () => {
        const findExplores = vi.fn(async () => ({
            topMatchingFields: [ftsField('payment_state', 'payments')],
        })) as unknown as FindExploresFn;
        const tool = getGrepFields({
            availableExplores: [explore],
            findExplores,
            verifiedFieldUsage: new Map(),
        });

        const output = await execute(tool, {
            patterns: ['status', 'nomatchxyz'],
            exploreName: null,
        });

        const parsed = toolGrepFieldsOutputSchema.parse(output);
        expect(parsed.metadata.status).toBe('success');
        if ('error' in parsed.structuredContent) {
            throw new Error('expected success structuredContent');
        }
        const { patterns, fuzzyMatches, exploreName } =
            parsed.structuredContent;
        expect(exploreName).toBeNull();
        expect(patterns.map((p) => [p.pattern, p.status])).toEqual([
            ['status', 'matches'],
            ['nomatchxyz', 'no_matches'],
        ]);
        expect(patterns[0]?.matchCount).toBe(1);
        expect(patterns[0]?.resultsByExplore[0]?.fields[0]).toMatchObject({
            path: 'orders/orders_status',
            fieldId: 'orders_status',
            label: 'Status',
            description: 'Order status.',
        });
        expect(output.result).toContain('/status/ — 1 match:');
        expect(output.result).toContain('orders/orders_status');
        expect(output.result).toContain('/nomatchxyz/ — no matches.');
        expect(fuzzyMatches.map((f) => f.fieldId)).toEqual([
            'payments_payment_state',
        ]);
        expect(output.result).toContain('payments_payment_state');
    });

    it('reports an unknown explore as an empty result that still parses', async () => {
        const tool = getGrepFields({
            availableExplores: [explore],
            findExplores: vi.fn() as unknown as FindExploresFn,
            verifiedFieldUsage: new Map(),
        });

        const output = await execute(tool, {
            patterns: ['status'],
            exploreName: 'typo',
        });

        const parsed = toolGrepFieldsOutputSchema.parse(output);
        expect(output.result).toContain('Explore "typo" not found');
        expect(parsed.structuredContent).toEqual({
            description: output.result,
            exploreName: 'typo',
            patterns: [],
            fuzzyMatches: [],
        });
    });

    it('mirrors the error text as structuredContent.error when execution throws', async () => {
        vi.mocked(Logger.warn).mockImplementationOnce(() => {
            throw new Error('logger down');
        });
        const broadExplore = makeExplore({
            name: 'orders',
            fields: Array.from({ length: 30 }, (_, i) => ({
                name: `order_attr_${i}`,
                label: `Order Attr ${i}`,
            })),
        });
        const tool = getGrepFields({
            availableExplores: [broadExplore],
            findExplores: vi.fn() as unknown as FindExploresFn,
            verifiedFieldUsage: new Map(),
        });

        const output = await execute(tool, {
            patterns: ['order'],
            exploreName: 'orders',
        });

        expect(toolGrepFieldsOutputSchema.safeParse(output).success).toBe(true);
        expect(output.metadata).toEqual({ status: 'error' });
        expect(output.result).toContain('Error grepping fields');
        expect(output.result).toContain('logger down');
        expect(output.structuredContent).toEqual({ error: output.result });
    });
});
