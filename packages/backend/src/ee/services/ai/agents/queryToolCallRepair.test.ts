import {
    DimensionType,
    FieldType,
    MetricType,
    type Explore,
} from '@lightdash/common';
import {
    createQueryToolCallRepair,
    repairQueryToolCall,
} from './queryToolCallRepair';

describe('query tool-call repair', () => {
    it('does not invent missing query containers', async () => {
        const repaired = await repairQueryToolCall({
            toolCall: {
                type: 'tool-call',
                toolCallId: 'call-1',
                toolName: 'runQuery',
                input: JSON.stringify({
                    queryConfig: {
                        metrics: ['orders_count'],
                        filters: { type: 'and', dimensions: [] },
                    },
                }),
            },
            tools: {} as never,
            inputSchema: async () => ({
                type: 'object',
                required: ['queryConfig'],
                properties: {
                    queryConfig: {
                        type: 'object',
                        required: ['metrics', 'parameters', 'filters'],
                        properties: {
                            metrics: {
                                type: 'array',
                                items: { type: 'string' },
                            },
                            parameters: {
                                anyOf: [{ type: 'object' }, { type: 'null' }],
                            },
                            filters: {
                                type: 'object',
                                required: [
                                    'type',
                                    'dimensions',
                                    'metrics',
                                    'tableCalculations',
                                ],
                                properties: {
                                    type: { type: 'string' },
                                    dimensions: { type: 'array' },
                                    metrics: { type: 'array' },
                                    tableCalculations: { type: 'array' },
                                },
                            },
                        },
                    },
                },
            }),
            instructions: undefined,
            system: undefined,
            messages: [],
            error: new Error('invalid') as never,
        });
        expect(repaired).toBeNull();
    });

    it('turns a model null placeholder into schema-valid null', async () => {
        const repaired = await repairQueryToolCall({
            toolCall: {
                type: 'tool-call',
                toolCallId: 'call-1',
                toolName: 'generateVisualization',
                input: JSON.stringify({ mergeConfig: 'None' }),
            },
            tools: {} as never,
            inputSchema: async () => ({
                type: 'object',
                properties: {
                    mergeConfig: {
                        anyOf: [{ type: 'object' }, { type: 'null' }],
                    },
                },
            }),
            instructions: undefined,
            system: undefined,
            messages: [],
            error: new Error('invalid') as never,
        });
        expect(JSON.parse(repaired?.input ?? '')).toEqual({
            mergeConfig: null,
        });
    });

    it('does not repair unrelated tools', async () => {
        await expect(
            repairQueryToolCall({
                toolCall: {
                    type: 'tool-call',
                    toolCallId: 'call-1',
                    toolName: 'editRepo',
                    input: '{}',
                },
                tools: {} as never,
                inputSchema: async () => ({ type: 'object' }),
                instructions: undefined,
                system: undefined,
                messages: [],
                error: new Error('invalid') as never,
            }),
        ).resolves.toBeNull();
    });
});

describe('query tool-call repair with explore context', () => {
    const explore = {
        name: 'orders',
        label: 'Orders',
        baseTable: 'orders',
        tables: {
            orders: {
                label: 'Orders',
                dimensions: {
                    order_date: {
                        name: 'order_date',
                        table: 'orders',
                        fieldType: FieldType.DIMENSION,
                        type: DimensionType.DATE,
                        label: 'Order date',
                    },
                    status: {
                        name: 'status',
                        table: 'orders',
                        fieldType: FieldType.DIMENSION,
                        type: DimensionType.STRING,
                        label: 'Status',
                    },
                },
                metrics: {
                    total: {
                        name: 'total',
                        table: 'orders',
                        fieldType: FieldType.METRIC,
                        type: MetricType.SUM,
                        label: 'Total',
                    },
                },
            },
        },
    } as unknown as Explore;
    const repair = createQueryToolCallRepair({
        explores: [explore],
        question: 'What was the total in 2024?',
    });
    const call = (toolName: string, input: object) =>
        repair({
            toolCall: {
                type: 'tool-call',
                toolCallId: 'call-1',
                toolName,
                input: JSON.stringify(input),
            },
            tools: {} as never,
            inputSchema: async () => ({ type: 'object' }),
            instructions: undefined,
            system: undefined,
            messages: [],
            error: new Error('invalid') as never,
        });
    const queryConfig = (filters: unknown) => ({
        exploreName: 'orders',
        metrics: ['orders_total'],
        dimensions: [],
        filters,
    });
    const internalRule = (
        fieldId: string,
        operator: string,
        values: unknown[],
    ) => ({
        id: 'r1',
        target: { fieldId },
        operator,
        values,
    });

    it('rewrites a flat metric-query filter group into tool filter rules', async () => {
        const repaired = await call('generateVisualization', {
            title: 'Total',
            description: 'Total in 2024',
            queryConfig: queryConfig({
                dimensions: {
                    id: 'g1',
                    and: [
                        internalRule('orders_order_date', 'inBetween', [
                            '2024-01-01',
                            '2024-12-31',
                        ]),
                        internalRule('orders_status', 'equals', ['completed']),
                    ],
                },
            }),
        });
        expect(JSON.parse(repaired!.input).queryConfig.filters).toEqual({
            type: 'and',
            dimensions: [
                {
                    fieldId: 'orders_order_date',
                    fieldType: 'date',
                    fieldFilterType: 'date',
                    operator: 'inBetween',
                    values: ['2024-01-01', '2024-12-31'],
                },
                {
                    fieldId: 'orders_status',
                    fieldType: 'string',
                    fieldFilterType: 'string',
                    operator: 'equals',
                    values: ['completed'],
                },
            ],
            metrics: null,
            tableCalculations: null,
        });
    });

    it('unwraps tool rules stored as a rules and connector group', async () => {
        const rule = {
            fieldId: 'orders_status',
            fieldType: 'string',
            fieldFilterType: 'string',
            operator: 'equals',
            values: ['completed'],
        };
        const repaired = await call('generateVisualization', {
            title: 'Total',
            description: 'Total',
            queryConfig: queryConfig({
                metrics: null,
                dimensions: { rules: [rule, rule], connector: 'and' },
                tableCalculations: null,
            }),
        });
        expect(JSON.parse(repaired!.input).queryConfig.filters).toEqual({
            type: 'and',
            dimensions: [rule, rule],
            metrics: null,
            tableCalculations: null,
        });
    });

    it.each([
        [
            'nested groups',
            {
                dimensions: {
                    id: 'g1',
                    or: [
                        internalRule('orders_status', 'equals', ['a']),
                        {
                            id: 'g2',
                            and: [
                                internalRule('orders_status', 'equals', ['b']),
                            ],
                        },
                    ],
                },
            },
        ],
        [
            'unknown fields',
            {
                dimensions: {
                    id: 'g1',
                    and: [internalRule('orders_missing', 'equals', ['a'])],
                },
            },
        ],
        [
            'groups with different connectors',
            {
                dimensions: {
                    id: 'g1',
                    or: [
                        internalRule('orders_status', 'equals', ['a']),
                        internalRule('orders_status', 'equals', ['b']),
                    ],
                },
                metrics: {
                    id: 'g2',
                    and: [
                        internalRule('orders_total', 'greaterThan', [1]),
                        internalRule('orders_total', 'lessThan', [9]),
                    ],
                },
            },
        ],
    ])('leaves %s unrepaired', async (_, filters) => {
        expect(
            await call('generateVisualization', {
                title: 'Total',
                description: 'Total',
                queryConfig: queryConfig(filters),
            }),
        ).toBeNull();
    });

    it('fills a missing runQuery title from the question without touching the query', async () => {
        const input = { queryConfig: queryConfig(null), chartConfig: null };
        const repaired = JSON.parse((await call('runQuery', input))!.input);
        expect(repaired).toEqual({
            ...input,
            title: 'What was the total in 2024?',
            description: '',
        });
    });

    it('does not fill titles for visualizations', async () => {
        expect(
            await call('generateVisualization', {
                queryConfig: queryConfig(null),
                chartConfig: null,
            }),
        ).toBeNull();
    });
});
