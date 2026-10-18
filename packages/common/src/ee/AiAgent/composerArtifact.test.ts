import { QuerySourceType, type SourceQuery } from '../../types/querySources';
import {
    buildComposerArtifactPipeline,
    COMPOSER_TABLE_VIZ,
    type AiComposerChartArtifactConfig,
} from './composerArtifact';

const orders: SourceQuery = {
    sourceType: QuerySourceType.SEMANTIC_LAYER,
    nodeId: 'orders',
    title: 'Orders',
    exploreName: 'orders',
    dimensions: ['orders_customer_id'],
    metrics: ['orders_total_order_amount'],
    limit: 500,
};

const customers: SourceQuery = {
    sourceType: QuerySourceType.SQL,
    nodeId: 'customers',
    title: 'Customers',
    sql: 'SELECT customer_id, first_name FROM customers',
    limit: 500,
};

const enriched: SourceQuery = {
    sourceType: QuerySourceType.DUCKDB,
    nodeId: 'enriched',
    title: 'Orders with customer names',
    sql: 'SELECT * FROM orders JOIN customers ON orders_customer_id = customer_id',
    references: ['orders', 'customers'],
    limit: 500,
};

const version1: AiComposerChartArtifactConfig = {
    source: 'composer',
    schemaVersion: 2,
    queries: [orders, customers, enriched],
    terminalNodeId: 'enriched',
    viz: COMPOSER_TABLE_VIZ,
};

const summary = (
    references: Record<string, string> | string[],
): SourceQuery => ({
    sourceType: QuerySourceType.DUCKDB,
    nodeId: 'summary',
    title: 'Spend summary',
    sql: 'SELECT count(*) FROM e',
    references,
    limit: 500,
});

describe('buildComposerArtifactPipeline', () => {
    it('copies a reused node and everything it reads, keeping their node ids', () => {
        const queries = buildComposerArtifactPipeline({
            queries: [summary(['enriched'])],
            earlierPipelines: [version1],
        });

        expect(queries).toEqual([
            orders,
            customers,
            enriched,
            summary(['enriched']),
        ]);
    });

    it('aliases a reused node in the map form of references', () => {
        const queries = buildComposerArtifactPipeline({
            queries: [summary({ e: 'enriched', o: 'orders' })],
            earlierPipelines: [version1],
        });

        expect(queries.map((node) => node.nodeId)).toEqual([
            'orders',
            'customers',
            'enriched',
            'summary',
        ]);
        expect(queries[3]).toEqual(summary({ e: 'enriched', o: 'orders' }));
    });

    it('accepts an identical redefinition as a reuse, whatever the references form', () => {
        const resubmitted: SourceQuery = {
            ...enriched,
            references: { customers: 'customers', orders: 'orders' },
        };

        const queries = buildComposerArtifactPipeline({
            queries: [orders, resubmitted, summary(['enriched'])],
            earlierPipelines: [version1],
        });

        expect(queries).toEqual([
            orders,
            customers,
            resubmitted,
            summary(['enriched']),
        ]);
    });

    it('orders a copied node after a submitted node it reads', () => {
        const queries = buildComposerArtifactPipeline({
            queries: [summary(['enriched']), orders],
            earlierPipelines: [version1],
        });

        expect(queries.map((node) => node.nodeId)).toEqual([
            'orders',
            'customers',
            'enriched',
            'summary',
        ]);
    });

    it('takes a node from whichever earlier version defined it', () => {
        const version2: AiComposerChartArtifactConfig = {
            source: 'composer',
            schemaVersion: 2,
            queries: [orders, customers, enriched, summary(['enriched'])],
            terminalNodeId: 'summary',
            viz: COMPOSER_TABLE_VIZ,
        };
        const ranked: SourceQuery = {
            sourceType: QuerySourceType.PYTHON,
            nodeId: 'ranked',
            title: 'Ranked customers',
            code: 'def run(inputs, params):\n    return inputs["s"]',
            references: { s: 'summary', c: 'customers' },
            limit: 500,
        };

        const queries = buildComposerArtifactPipeline({
            queries: [ranked],
            earlierPipelines: [version1, version2],
        });

        expect(queries).toEqual([
            orders,
            customers,
            enriched,
            summary(['enriched']),
            ranked,
        ]);
    });

    it.each([
        ['a different limit', { ...orders, limit: 100 }],
        ['a different title', { ...orders, title: 'All orders' }],
    ])('rejects a node id redefined with %s', (_, redefined) => {
        expect(() =>
            buildComposerArtifactPipeline({
                queries: [redefined, summary(['orders'])],
                earlierPipelines: [version1],
            }),
        ).toThrow(
            'Node id "orders" already names a different node in this thread ("Orders"). To reuse it, read "orders" without resubmitting it; to define a new node, give it a different node id.',
        );
    });

    it('rejects an unknown node id, listing the nodes of earlier versions', () => {
        expect(() =>
            buildComposerArtifactPipeline({
                queries: [summary({ e: 'enriched', x: 'ordrs' })],
                earlierPipelines: [version1],
            }),
        ).toThrow(
            'Node "summary" reads "ordrs", which is not a node of this submission or of an earlier version in this thread. Nodes from earlier versions: orders ("Orders"), customers ("Customers"), enriched ("Orders with customer names").',
        );
    });

    it('rejects a query id reference when the thread has no earlier nodes', () => {
        expect(() =>
            buildComposerArtifactPipeline({
                queries: [
                    summary({ e: '11111111-1111-4111-8111-111111111111' }),
                ],
                earlierPipelines: [],
            }),
        ).toThrow(
            'Node "summary" reads "11111111-1111-4111-8111-111111111111", which is not a node of this submission or of an earlier version in this thread. There are no nodes from earlier versions in this thread.',
        );
    });
});
