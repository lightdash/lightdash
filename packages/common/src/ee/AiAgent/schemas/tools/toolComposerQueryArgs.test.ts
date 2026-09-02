import { QuerySourceType } from '../../../../types/querySources';
import {
    DEFAULT_COMPOSER_QUERY_LIMIT,
    parsePartialToolComposerQueriesArgs,
} from './toolComposerQueryArgs';

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
                    exploreName: 'payments',
                    dimensions: ['payments_month'],
                    // metrics not streamed yet
                },
                {
                    sourceType: QuerySourceType.SQL,
                    nodeId: 'signups',
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
                sql: '',
                tables: { t: 'table-uuid' },
                limit: DEFAULT_COMPOSER_QUERY_LIMIT,
            },
            {
                sourceType: QuerySourceType.DUCKDB,
                nodeId: 'joined',
                sql: '',
                references: ['revenue', 'targets'],
                limit: DEFAULT_COMPOSER_QUERY_LIMIT,
            },
        ]);
    });
});
