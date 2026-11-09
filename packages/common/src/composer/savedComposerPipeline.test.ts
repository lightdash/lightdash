import { QuerySourceType } from '../types/querySources';
import {
    parseStoredComposerPipeline,
    SAVED_COMPOSER_PIPELINE_SCHEMA_VERSION,
} from './savedComposerPipeline';

const orders = {
    sourceType: QuerySourceType.SEMANTIC_LAYER,
    nodeId: 'orders',
    title: 'Orders',
    exploreName: 'orders',
    dimensions: ['orders_status'],
    metrics: ['orders_total_order_amount'],
    limit: 500,
};

const byStatus = {
    sourceType: QuerySourceType.DUCKDB,
    nodeId: 'by_status',
    title: 'Revenue by status',
    sql: 'SELECT orders_status, sum(orders_total_order_amount) AS revenue FROM orders GROUP BY 1',
    references: ['orders'],
    limit: 100,
};

const stored = {
    schemaVersion: SAVED_COMPOSER_PIPELINE_SCHEMA_VERSION,
    nodes: [orders, byStatus],
    terminalNodeId: 'by_status',
};

describe('parseStoredComposerPipeline', () => {
    test('returns the stored pipeline when it is closed and allowed', () => {
        expect(parseStoredComposerPipeline(stored)).toEqual(stored);
    });

    test('throws on an unknown schema version', () => {
        expect(() =>
            parseStoredComposerPipeline({ ...stored, schemaVersion: 2 }),
        ).toThrow('schema version 2');
    });

    test.each([
        {
            sourceType: QuerySourceType.PYTHON,
            nodeId: 'scored',
            code: 'def run(inputs, params): return inputs["orders"]',
            references: ['orders'],
        },
        {
            sourceType: QuerySourceType.SQL,
            nodeId: 'scored',
            sql: 'SELECT 1',
        },
    ])('refuses a $sourceType node by name', (node) => {
        expect(() =>
            parseStoredComposerPipeline({
                ...stored,
                nodes: [orders, node],
                terminalNodeId: 'scored',
            }),
        ).toThrow('"scored"');
    });

    test('refuses a node missing the fields its kind needs', () => {
        const { exploreName, ...noExplore } = orders;
        expect(() =>
            parseStoredComposerPipeline({
                ...stored,
                nodes: [noExplore, byStatus],
            }),
        ).toThrow('"orders"');
    });

    test.each([undefined, [], 42, { orders: 7 }])(
        'refuses a duckdb node whose references are %j',
        (references) => {
            expect(() =>
                parseStoredComposerPipeline({
                    ...stored,
                    nodes: [orders, { ...byStatus, references }],
                }),
            ).toThrow('"by_status"');
        },
    );

    test('refuses a reference outside the pipeline', () => {
        const external = {
            ...byStatus,
            references: {
                orders: 'orders',
                prev: '5f3a4e3a-7a1b-4f24-b61d-0b0e4a9c8d11',
            },
        };
        expect(() =>
            parseStoredComposerPipeline({
                ...stored,
                nodes: [orders, external],
            }),
        ).toThrow('5f3a4e3a-7a1b-4f24-b61d-0b0e4a9c8d11');
    });

    test('refuses an open closure whose terminal node is not stored', () => {
        expect(() =>
            parseStoredComposerPipeline({
                ...stored,
                nodes: [orders],
            }),
        ).toThrow('"by_status"');
    });

    test('refuses a node without a node id', () => {
        const { nodeId, ...anonymous } = orders;
        expect(() =>
            parseStoredComposerPipeline({
                ...stored,
                nodes: [anonymous, byStatus],
            }),
        ).toThrow('node id');
    });
});
