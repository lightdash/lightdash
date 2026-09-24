import { QuerySourceType } from '../../../../types/querySources';
import {
    DEFAULT_COMPOSER_QUERY_LIMIT,
    parsePartialToolComposerQueriesArgs,
    toolComposerQueriesArgsSchema,
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
