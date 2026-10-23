import { QuerySourceType } from '../../../../types/querySources';
import { isSameComposerNodeDefinition } from '../../composerArtifact';
import {
    createToolComposerQueriesArgsSchema,
    DEFAULT_COMPOSER_QUERY_LIMIT,
    getToolComposerQueriesDescription,
    parsePartialToolComposerQueriesArgs,
    toolComposerQueriesArgsSchema,
    toolComposerQueriesArgsSchemaPersisted,
    toolComposerQueryNodeToSourceQuery,
} from './toolComposerQueryArgs';

describe('toolComposerQueriesArgsSchema node titles', () => {
    const sqlNode = {
        sourceType: QuerySourceType.SQL,
        nodeId: 'signups',
        title: 'Signups by month',
        description: null,
        sql: 'SELECT 1',
    };
    const args = (node: object) => ({
        title: null,
        description: null,
        terminalNodeId: null,
        queries: [node],
    });

    it('requires a title on every node', () => {
        const { title, ...untitled } = sqlNode;
        expect(
            toolComposerQueriesArgsSchema.safeParse(args(untitled)).success,
        ).toBe(false);
        expect(
            toolComposerQueriesArgsSchema.safeParse(args(sqlNode)).success,
        ).toBe(true);
    });

    it('accepts a null description', () => {
        const parsed = toolComposerQueriesArgsSchema.parse(args(sqlNode));
        expect(parsed.queries[0].description).toBeNull();
    });
});

describe('toolComposerQueryNodeToSourceQuery', () => {
    it('keeps title and description, mapping null description to undefined', () => {
        expect(
            toolComposerQueryNodeToSourceQuery({
                sourceType: QuerySourceType.DUCKDB,
                nodeId: 'joined',
                title: 'Revenue vs signups',
                description: 'Joins revenue with signups by month.',
                sql: 'SELECT * FROM revenue JOIN signups USING (month)',
                references: ['revenue', 'signups'],
                limit: 500,
            }),
        ).toEqual({
            sourceType: QuerySourceType.DUCKDB,
            nodeId: 'joined',
            title: 'Revenue vs signups',
            description: 'Joins revenue with signups by month.',
            sql: 'SELECT * FROM revenue JOIN signups USING (month)',
            references: ['revenue', 'signups'],
            limit: 500,
        });
        expect(
            toolComposerQueryNodeToSourceQuery({
                sourceType: QuerySourceType.SQL,
                nodeId: 'signups',
                title: 'Signups',
                description: null,
                sql: 'SELECT 1',
                limit: 500,
            }),
        ).toEqual({
            sourceType: QuerySourceType.SQL,
            nodeId: 'signups',
            title: 'Signups',
            description: undefined,
            sql: 'SELECT 1',
            limit: 500,
        });
    });
});

describe('parsePartialToolComposerQueriesArgs', () => {
    it('returns null when no node is renderable yet', () => {
        expect(parsePartialToolComposerQueriesArgs(undefined)).toBeNull();
        expect(parsePartialToolComposerQueriesArgs(null)).toBeNull();
        expect(parsePartialToolComposerQueriesArgs('{"que')).toBeNull();
        expect(parsePartialToolComposerQueriesArgs({})).toBeNull();
        expect(parsePartialToolComposerQueriesArgs({ queries: [] })).toBeNull();
        // A node streamed up to (but not including) its nodeId isn't
        // identifiable yet.
        expect(
            parsePartialToolComposerQueriesArgs({
                queries: [{ sourceType: QuerySourceType.SQL }],
            }),
        ).toBeNull();
        // Unknown source types are skipped, not defaulted.
        expect(
            parsePartialToolComposerQueriesArgs({
                queries: [{ nodeId: 'orders', sourceType: 'sem' }],
            }),
        ).toBeNull();
    });

    it('keeps identifiable nodes and defaults their missing fields', () => {
        const parsed = parsePartialToolComposerQueriesArgs({
            title: 'Revenue vs signups',
            queries: [
                {
                    sourceType: QuerySourceType.SEMANTIC_LAYER,
                    nodeId: 'revenue',
                    title: 'Revenue by month',
                    description: 'Total revenue per month.',
                    exploreName: 'payments',
                    dimensions: ['payments_month'],
                    // metrics not streamed yet
                },
                {
                    sourceType: QuerySourceType.SQL,
                    nodeId: 'signups',
                    // title not streamed yet
                    sql: 'SELECT month, count(*) FROM raw.us',
                },
            ],
        });

        expect(parsed).toEqual({
            title: 'Revenue vs signups',
            description: null,
            terminalNodeId: null,
            queries: [
                {
                    sourceType: QuerySourceType.SEMANTIC_LAYER,
                    nodeId: 'revenue',
                    title: 'Revenue by month',
                    description: 'Total revenue per month.',
                    exploreName: 'payments',
                    dimensions: ['payments_month'],
                    metrics: [],
                    filters: null,
                    sorts: null,
                    parameters: null,
                    limit: DEFAULT_COMPOSER_QUERY_LIMIT,
                },
                {
                    sourceType: QuerySourceType.SQL,
                    nodeId: 'signups',
                    // Title falls back to the node id until it streams in
                    title: 'signups',
                    description: null,
                    // Cut-off SQL is kept as-is so it can grow with the stream
                    sql: 'SELECT month, count(*) FROM raw.us',
                    limit: DEFAULT_COMPOSER_QUERY_LIMIT,
                },
            ],
        });
    });

    it('parses duckdb references and external tables in both shapes', () => {
        const parsed = parsePartialToolComposerQueriesArgs({
            queries: [
                {
                    sourceType: QuerySourceType.EXTERNAL,
                    nodeId: 'targets',
                    tables: { t: 'table-uuid', partial: 42 },
                },
                {
                    sourceType: QuerySourceType.DUCKDB,
                    nodeId: 'joined',
                    references: ['revenue', 'targets'],
                },
            ],
        });

        expect(parsed?.queries).toEqual([
            {
                sourceType: QuerySourceType.EXTERNAL,
                nodeId: 'targets',
                title: 'targets',
                description: null,
                sql: '',
                tables: { t: 'table-uuid' },
                limit: DEFAULT_COMPOSER_QUERY_LIMIT,
            },
            {
                sourceType: QuerySourceType.DUCKDB,
                nodeId: 'joined',
                title: 'joined',
                description: null,
                sql: '',
                references: ['revenue', 'targets'],
                limit: DEFAULT_COMPOSER_QUERY_LIMIT,
            },
        ]);
    });
});

describe('python composer nodes', () => {
    const pythonNode = {
        sourceType: QuerySourceType.PYTHON,
        nodeId: 'forecast',
        title: 'Revenue forecast',
        description: null,
        code: 'def run(inputs, params):\n    return inputs["revenue"]',
        references: ['revenue'],
    };
    const args = {
        title: null,
        description: null,
        terminalNodeId: null,
        queries: [pythonNode],
    };

    it('offers the python node only when enabled', () => {
        expect(toolComposerQueriesArgsSchema.safeParse(args).success).toBe(
            false,
        );
        expect(
            createToolComposerQueriesArgsSchema({
                enablePythonNodes: true,
            }).safeParse(args).success,
        ).toBe(true);
    });

    it('describes python nodes only when enabled', () => {
        expect(
            getToolComposerQueriesDescription({ enablePythonNodes: false }),
        ).not.toContain('"python"');
        expect(
            getToolComposerQueriesDescription({ enablePythonNodes: true }),
        ).toContain('"python"');
    });

    it('converts to a python source query', () => {
        const [node] = createToolComposerQueriesArgsSchema({
            enablePythonNodes: true,
        }).parse(args).queries;
        if (node.sourceType !== QuerySourceType.PYTHON) {
            throw new Error('expected a python node');
        }
        expect(toolComposerQueryNodeToSourceQuery(node)).toEqual({
            sourceType: QuerySourceType.PYTHON,
            nodeId: 'forecast',
            title: 'Revenue forecast',
            description: undefined,
            code: pythonNode.code,
            references: ['revenue'],
            limit: DEFAULT_COMPOSER_QUERY_LIMIT,
        });
    });

    it('renders a partially streamed python node', () => {
        const parsed = parsePartialToolComposerQueriesArgs({
            queries: [
                {
                    sourceType: QuerySourceType.PYTHON,
                    nodeId: 'forecast',
                    code: 'def run(inp',
                    references: { rev: 'revenue', partial: 1 },
                },
            ],
        });
        expect(parsed?.queries).toEqual([
            {
                sourceType: QuerySourceType.PYTHON,
                nodeId: 'forecast',
                title: 'forecast',
                description: null,
                code: 'def run(inp',
                references: { rev: 'revenue' },
                limit: DEFAULT_COMPOSER_QUERY_LIMIT,
            },
        ]);
    });
});

describe('composer node references', () => {
    const duckdbArgs = (references: unknown) => ({
        title: null,
        description: null,
        terminalNodeId: null,
        queries: [
            {
                sourceType: QuerySourceType.DUCKDB,
                nodeId: 'summary',
                title: 'Spend summary',
                description: null,
                sql: 'SELECT * FROM o',
                references,
            },
        ],
    });

    it('aliases node ids in the map form', () => {
        expect(
            toolComposerQueriesArgsSchema.safeParse(duckdbArgs({ o: 'orders' }))
                .success,
        ).toBe(true);
    });

    it.each([
        ['map', { o: '11111111-1111-4111-8111-111111111111' }],
        ['array', ['11111111-1111-4111-8111-111111111111']],
    ])('rejects a query id in the %s form', (_, references) => {
        const parsed = toolComposerQueriesArgsSchema.safeParse(
            duckdbArgs(references),
        );
        expect(parsed.success).toBe(false);
        expect(parsed.error?.issues.map((issue) => issue.message)).toEqual([
            'References name node ids (letters, digits and underscores), not query ids',
        ]);
    });

    it('never mentions query ids in the description', () => {
        expect(
            getToolComposerQueriesDescription({ enablePythonNodes: true }),
        ).not.toMatch(/query ?uuid|query id/i);
    });
});

describe('semanticLayer node filters', () => {
    const semanticArgs = (filters: unknown) => ({
        title: null,
        description: null,
        terminalNodeId: null,
        queries: [
            {
                sourceType: QuerySourceType.SEMANTIC_LAYER,
                nodeId: 'revenue',
                title: 'Revenue by customer',
                description: null,
                exploreName: 'orders',
                dimensions: ['orders_customer_name'],
                metrics: ['orders_total_revenue'],
                filters,
                sorts: null,
            },
        ],
    });

    it('accepts one flat expression per field kind, or null', () => {
        expect(
            toolComposerQueriesArgsSchema.safeParse(
                semanticArgs({
                    dimensions: 'orders_customer_name equals=Alice',
                    metrics: null,
                }),
            ).success,
        ).toBe(true);
        expect(
            toolComposerQueriesArgsSchema.safeParse(semanticArgs(null)).success,
        ).toBe(true);
    });

    it('rejects structured rules, table calculation filters and empty expressions', () => {
        expect(
            toolComposerQueriesArgsSchema.safeParse(
                semanticArgs({
                    dimensions: null,
                    metrics: null,
                    tableCalculations: 'rank lessThan=10',
                }),
            ).success,
        ).toBe(false);
        expect(
            toolComposerQueriesArgsSchema.safeParse(
                semanticArgs({
                    type: 'and',
                    dimensions: [
                        {
                            fieldId: 'orders_customer_name',
                            fieldType: 'string',
                            fieldFilterType: 'string',
                            operator: 'equals',
                            values: ['Alice'],
                        },
                    ],
                    metrics: null,
                    tableCalculations: null,
                }),
            ).success,
        ).toBe(false);
        expect(
            toolComposerQueriesArgsSchema.safeParse(
                semanticArgs({ dimensions: '' }),
            ).success,
        ).toBe(false);
    });
});

describe('toolComposerQueriesArgsSchemaPersisted', () => {
    const args = (node: object) => ({
        title: null,
        description: null,
        terminalNodeId: null,
        queries: [node],
    });

    it('parses python nodes and limits above the advertised max', () => {
        const pythonNode = {
            sourceType: QuerySourceType.PYTHON,
            nodeId: 'forecast',
            title: 'Forecast',
            description: null,
            code: 'def run(inputs, params):\n    return inputs["revenue"]',
            references: ['revenue'],
            limit: 1_000_000,
        };
        expect(
            toolComposerQueriesArgsSchemaPersisted.safeParse(args(pythonNode))
                .success,
        ).toBe(true);
    });

    it('renders a semanticLayer node with legacy free-form filters unfiltered', () => {
        const parsed = toolComposerQueriesArgsSchemaPersisted.parse(
            args({
                sourceType: QuerySourceType.SEMANTIC_LAYER,
                nodeId: 'orders',
                title: 'Orders',
                description: null,
                exploreName: 'orders',
                dimensions: ['orders_status'],
                metrics: ['orders_count'],
                filters: {
                    dimensions: {
                        id: 'g1',
                        and: [
                            {
                                id: 'r1',
                                target: { fieldId: 'orders_status' },
                                operator: 'equals',
                                values: ['completed'],
                            },
                        ],
                    },
                },
                sorts: null,
                limit: 500,
            }),
        );
        expect(parsed.queries[0]).toMatchObject({
            nodeId: 'orders',
            filters: null,
        });
    });

    it('parses a semanticLayer node persisted before parameters existed', () => {
        const parsed = toolComposerQueriesArgsSchemaPersisted.parse(
            args({
                sourceType: QuerySourceType.SEMANTIC_LAYER,
                nodeId: 'orders',
                title: 'Orders',
                description: null,
                exploreName: 'orders',
                dimensions: ['orders_status'],
                metrics: ['orders_count'],
                filters: null,
                sorts: null,
                limit: 500,
            }),
        );
        expect(parsed.queries[0]).toMatchObject({ parameters: null });
    });
});

describe('semanticLayer node parameters', () => {
    const semanticNode = {
        sourceType: QuerySourceType.SEMANTIC_LAYER as const,
        nodeId: 'orders',
        title: 'Orders',
        description: null,
        exploreName: 'orders',
        dimensions: ['orders_status'],
        metrics: ['orders_count'],
        filters: null,
        sorts: null,
        limit: 500,
    };

    it('accepts parameter values on the node', () => {
        const parsed = toolComposerQueriesArgsSchema.parse({
            title: null,
            description: null,
            terminalNodeId: null,
            queries: [
                {
                    ...semanticNode,
                    parameters: { 'orders.metric': 'active_users' },
                },
            ],
        });
        expect(parsed.queries[0]).toMatchObject({
            parameters: { 'orders.metric': 'active_users' },
        });
    });

    it('carries parameter values to the source query, and none when null or empty', () => {
        expect(
            toolComposerQueryNodeToSourceQuery({
                ...semanticNode,
                parameters: { 'orders.metric': 'active_users' },
            }),
        ).toMatchObject({ parameters: { 'orders.metric': 'active_users' } });
        expect(
            toolComposerQueryNodeToSourceQuery({
                ...semanticNode,
                parameters: null,
            }),
        ).toMatchObject({ parameters: undefined });
        expect(
            isSameComposerNodeDefinition(
                toolComposerQueryNodeToSourceQuery({
                    ...semanticNode,
                    parameters: null,
                }),
                toolComposerQueryNodeToSourceQuery({
                    ...semanticNode,
                    parameters: {},
                }),
            ),
        ).toBe(true);
    });
});
