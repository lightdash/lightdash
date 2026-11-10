import { FilterOperator } from '../../types/filter';
import { QuerySourceType, type SourceQuery } from '../../types/querySources';
import {
    buildComposerArtifactPipeline,
    toComposerArtifactVersion,
    type ThreadComposerQueryNode,
} from './composerArtifact';

const orders: ThreadComposerQueryNode = {
    sourceType: QuerySourceType.SEMANTIC_LAYER,
    nodeId: 'orders',
    title: 'Orders',
    exploreName: 'orders',
    dimensions: ['orders_customer_id'],
    metrics: ['orders_total_order_amount'],
    limit: 500,
};

const customers: ThreadComposerQueryNode = {
    sourceType: QuerySourceType.SQL,
    nodeId: 'customers',
    title: 'Customers',
    sql: 'SELECT customer_id, first_name FROM customers',
    limit: 500,
};

const enriched: ThreadComposerQueryNode = {
    sourceType: QuerySourceType.DUCKDB,
    nodeId: 'enriched',
    title: 'Orders with customer names',
    sql: 'SELECT * FROM orders JOIN customers ON orders_customer_id = customer_id',
    references: ['orders', 'customers'],
    limit: 500,
};

const threadNodes = [orders, customers, enriched];

const summary = (
    references: Record<string, string> | string[],
): ThreadComposerQueryNode => ({
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
            threadNodes,
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
            threadNodes,
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
            threadNodes,
        });

        expect(queries).toEqual([
            orders,
            customers,
            resubmitted,
            summary(['enriched']),
        ]);
    });

    it('treats a filtered node resubmitted with fresh filter ids as the same node', () => {
        const filtered = (
            groupId: string,
            ruleId: string,
        ): Extract<
            ThreadComposerQueryNode,
            { sourceType: QuerySourceType.SEMANTIC_LAYER }
        > => ({
            sourceType: QuerySourceType.SEMANTIC_LAYER,
            nodeId: 'orders',
            title: 'Orders',
            exploreName: 'orders',
            dimensions: ['orders_customer_id'],
            metrics: ['orders_total_order_amount'],
            limit: 500,
            filters: {
                dimensions: {
                    id: groupId,
                    and: [
                        {
                            id: ruleId,
                            target: { fieldId: 'orders_status' },
                            operator: FilterOperator.EQUALS,
                            values: ['completed'],
                        },
                    ],
                },
                metrics: { id: `${groupId}-m`, and: [] },
            },
        });

        expect(
            buildComposerArtifactPipeline({
                queries: [filtered('g2', 'r2')],
                threadNodes: [filtered('g1', 'r1')],
            }),
        ).toEqual([filtered('g2', 'r2')]);
        expect(() =>
            buildComposerArtifactPipeline({
                queries: [
                    {
                        ...filtered('g2', 'r2'),
                        dimensions: ['orders_status'],
                    },
                ],
                threadNodes: [filtered('g1', 'r1')],
            }),
        ).toThrow('already names a different node');
    });

    it('orders a copied node after a submitted node it reads', () => {
        const queries = buildComposerArtifactPipeline({
            queries: [summary(['enriched']), orders],
            threadNodes,
        });

        expect(queries.map((node) => node.nodeId)).toEqual([
            'orders',
            'customers',
            'enriched',
            'summary',
        ]);
    });

    it('reads nodes defined by different earlier calls', () => {
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
            threadNodes: [...threadNodes, summary(['enriched'])],
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
                threadNodes,
            }),
        ).toThrow(
            'Node id "orders" already names a different node in this thread ("Orders"). To reuse it, read "orders" without resubmitting it; to define a new node, give it a different node id.',
        );
    });

    it('rejects an unknown node id, listing the thread composer query nodes', () => {
        expect(() =>
            buildComposerArtifactPipeline({
                queries: [summary({ e: 'enriched', x: 'ordrs' })],
                threadNodes,
            }),
        ).toThrow(
            'Node "summary" reads "ordrs", which is not a node of this submission or of an earlier call in this thread. Nodes defined earlier in this thread: orders ("Orders"), customers ("Customers"), enriched ("Orders with customer names").',
        );
    });

    it('rejects a query id reference when the thread has no nodes', () => {
        expect(() =>
            buildComposerArtifactPipeline({
                queries: [
                    summary({ e: '11111111-1111-4111-8111-111111111111' }),
                ],
                threadNodes: [],
            }),
        ).toThrow(
            'Node "summary" reads "11111111-1111-4111-8111-111111111111", which is not a node of this submission or of an earlier call in this thread. No nodes have been defined earlier in this thread.',
        );
    });
});

describe('toComposerArtifactVersion', () => {
    it('saves a composer chart version, omitting an empty description', () => {
        expect(
            toComposerArtifactVersion({
                title: 'Orders',
                description: null,
                queries: [orders],
                terminalNodeId: 'orders',
                vizConfig: null,
            }),
        ).toEqual({
            artifactType: 'chart',
            title: 'Orders',
            vizConfig: {
                source: 'composer',
                schemaVersion: 1,
                queries: [orders],
                terminalNodeId: 'orders',
                vizConfig: null,
            },
        });
    });
});
