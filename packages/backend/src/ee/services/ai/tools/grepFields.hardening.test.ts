import {
    DimensionType,
    FieldType,
    SupportedDbtAdapter,
    type Explore,
    type ToolOutput,
} from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import type { FindExploresFn } from '../types/aiAgentDependencies';
import { getGrepFields } from './grepFields';

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

const getSuccessStringOutput = (output: ToolOutput) => {
    if (Array.isArray(output)) {
        throw new Error('Unexpected array output');
    }
    if (output.status === 'error') {
        throw new Error(output.error);
    }
    if (output.type !== 'string') {
        throw new Error(`Unexpected output type: ${output.type}`);
    }
    return output;
};

const execute = async (
    tool: ReturnType<typeof getGrepFields>,
    args: { patterns: string[]; exploreName: string | null },
) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await tool.execute!(args, {} as any);
    if (Symbol.asyncIterator in result) {
        throw new Error('Unexpected streaming result');
    }
    return getSuccessStringOutput(result);
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
        expect(metadata).toMatchObject({ status: 'success' });
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
        expect(metadata).toMatchObject({
            patternStats: [
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
            ],
        });
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
        expect(metadata).toMatchObject({
            patternStats: [
                {
                    matchCount: 30,
                    scopeSize: 30,
                    matchedAllFields: true,
                },
            ],
        });
    });
});
