import knex, { Knex } from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import {
    MetricsTreeEdgesTableName,
    MetricsTreeNodesTableName,
    MetricsTreesTableName,
} from '../../database/entities/catalog';
import { CatalogModel } from './CatalogModel';

const MOCK_PROJECT_UUID = 'project-uuid-1';
const MOCK_USER_UUID = 'user-uuid-1';
const MOCK_TREE_UUID = 'tree-uuid-1';
const MOCK_TIMESTAMP = new Date('2026-01-01T00:00:00Z');

const MOCK_CREATED_TREE_ROW = {
    metrics_tree_uuid: MOCK_TREE_UUID,
    project_uuid: MOCK_PROJECT_UUID,
    slug: 'my-tree',
    name: 'My Tree',
    description: null,
    source: 'ui',
    created_by_user_uuid: MOCK_USER_UUID,
    updated_by_user_uuid: null,
    created_at: MOCK_TIMESTAMP,
    updated_at: MOCK_TIMESTAMP,
};

describe('CatalogModel', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new CatalogModel({
        database: database as unknown as Knex,
        lightdashConfig: lightdashConfigMock,
    });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    describe('createMetricsTree', () => {
        test('should create tree with nodes and edges in clean state', async () => {
            // Mock the tree insert (returning created row)
            tracker.on
                .insert(({ sql }) => sql.includes(MetricsTreesTableName))
                .responseOnce([MOCK_CREATED_TREE_ROW]);

            // Mock the nodes insert
            tracker.on
                .insert(({ sql }) => sql.includes(MetricsTreeNodesTableName))
                .responseOnce([]);

            // Mock the edges insert (with onConflict ignore)
            tracker.on
                .insert(({ sql }) => sql.includes(MetricsTreeEdgesTableName))
                .responseOnce([]);

            const result = await model.createMetricsTree(
                {
                    project_uuid: MOCK_PROJECT_UUID,
                    slug: 'my-tree',
                    name: 'My Tree',
                    description: null,
                    source: 'ui',
                    created_by_user_uuid: MOCK_USER_UUID,
                },
                [
                    {
                        catalogSearchUuid: 'node-1',
                        xPosition: 100,
                        yPosition: 200,
                    },
                    {
                        catalogSearchUuid: 'node-2',
                        xPosition: 300,
                        yPosition: 400,
                    },
                ],
                [
                    {
                        sourceCatalogSearchUuid: 'node-1',
                        targetCatalogSearchUuid: 'node-2',
                    },
                ],
            );

            expect(result).toEqual({
                metricsTreeUuid: MOCK_TREE_UUID,
                projectUuid: MOCK_PROJECT_UUID,
                slug: 'my-tree',
                name: 'My Tree',
                description: null,
                source: 'ui',
                createdByUserUuid: MOCK_USER_UUID,
                updatedByUserUuid: null,
                createdAt: MOCK_TIMESTAMP,
                updatedAt: MOCK_TIMESTAMP,
            });

            // Verify all three inserts happened
            expect(tracker.history.insert).toHaveLength(3);

            // Verify tree insert
            const treeInsert = tracker.history.insert[0];
            expect(treeInsert.sql).toContain(MetricsTreesTableName);

            // Verify nodes insert
            const nodesInsert = tracker.history.insert[1];
            expect(nodesInsert.sql).toContain(MetricsTreeNodesTableName);
            expect(nodesInsert.bindings).toEqual(
                expect.arrayContaining([
                    MOCK_TREE_UUID,
                    'node-1',
                    100,
                    200,
                    'ui',
                    MOCK_TREE_UUID,
                    'node-2',
                    300,
                    400,
                    'ui',
                ]),
            );

            // Verify edges insert with onConflict ignore
            const edgesInsert = tracker.history.insert[2];
            expect(edgesInsert.sql).toContain(MetricsTreeEdgesTableName);
            expect(edgesInsert.sql).toContain('on conflict');
            expect(edgesInsert.bindings).toEqual(
                expect.arrayContaining([
                    'node-1',
                    'node-2',
                    MOCK_USER_UUID,
                    MOCK_PROJECT_UUID,
                    'ui',
                ]),
            );
        });

        test('should skip existing edges with onConflict ignore', async () => {
            // Mock the tree insert
            tracker.on
                .insert(({ sql }) => sql.includes(MetricsTreesTableName))
                .responseOnce([MOCK_CREATED_TREE_ROW]);

            // Mock the nodes insert
            tracker.on
                .insert(({ sql }) => sql.includes(MetricsTreeNodesTableName))
                .responseOnce([]);

            // Mock the edges insert — onConflict().ignore() means
            // existing edges are silently skipped, no error thrown
            tracker.on
                .insert(({ sql }) => sql.includes(MetricsTreeEdgesTableName))
                .responseOnce([]);

            const result = await model.createMetricsTree(
                {
                    project_uuid: MOCK_PROJECT_UUID,
                    slug: 'my-tree',
                    name: 'My Tree',
                    description: null,
                    source: 'ui',
                    created_by_user_uuid: MOCK_USER_UUID,
                },
                [
                    { catalogSearchUuid: 'node-1' },
                    { catalogSearchUuid: 'node-2' },
                    { catalogSearchUuid: 'node-3' },
                ],
                [
                    {
                        sourceCatalogSearchUuid: 'node-1',
                        targetCatalogSearchUuid: 'node-2',
                    },
                    {
                        sourceCatalogSearchUuid: 'node-2',
                        targetCatalogSearchUuid: 'node-3',
                    },
                ],
            );

            expect(result.metricsTreeUuid).toEqual(MOCK_TREE_UUID);

            // All three inserts should succeed
            expect(tracker.history.insert).toHaveLength(3);

            // Edges insert uses onConflict ignore
            const edgesInsert = tracker.history.insert[2];
            expect(edgesInsert.sql).toContain('on conflict');
            expect(edgesInsert.sql).toMatch(/do nothing|ignore/i);
        });

        test('should create tree with nodes but no edges', async () => {
            tracker.on
                .insert(({ sql }) => sql.includes(MetricsTreesTableName))
                .responseOnce([MOCK_CREATED_TREE_ROW]);

            tracker.on
                .insert(({ sql }) => sql.includes(MetricsTreeNodesTableName))
                .responseOnce([]);

            const result = await model.createMetricsTree(
                {
                    project_uuid: MOCK_PROJECT_UUID,
                    slug: 'my-tree',
                    name: 'My Tree',
                    description: null,
                    source: 'ui',
                    created_by_user_uuid: MOCK_USER_UUID,
                },
                [{ catalogSearchUuid: 'node-1' }],
                [],
            );

            expect(result.metricsTreeUuid).toEqual(MOCK_TREE_UUID);

            // Only tree + nodes inserts, no edges
            expect(tracker.history.insert).toHaveLength(2);
        });

        test('should create tree with no nodes and no edges', async () => {
            tracker.on
                .insert(({ sql }) => sql.includes(MetricsTreesTableName))
                .responseOnce([MOCK_CREATED_TREE_ROW]);

            const result = await model.createMetricsTree(
                {
                    project_uuid: MOCK_PROJECT_UUID,
                    slug: 'my-tree',
                    name: 'My Tree',
                    description: null,
                    source: 'ui',
                    created_by_user_uuid: MOCK_USER_UUID,
                },
                [],
                [],
            );

            expect(result.metricsTreeUuid).toEqual(MOCK_TREE_UUID);

            // Only tree insert
            expect(tracker.history.insert).toHaveLength(1);
        });

        test('should default node positions to null when omitted', async () => {
            tracker.on
                .insert(({ sql }) => sql.includes(MetricsTreesTableName))
                .responseOnce([MOCK_CREATED_TREE_ROW]);

            tracker.on
                .insert(({ sql }) => sql.includes(MetricsTreeNodesTableName))
                .responseOnce([]);

            await model.createMetricsTree(
                {
                    project_uuid: MOCK_PROJECT_UUID,
                    slug: 'my-tree',
                    name: 'My Tree',
                    description: null,
                    source: 'ui',
                    created_by_user_uuid: MOCK_USER_UUID,
                },
                [{ catalogSearchUuid: 'node-1' }],
                [],
            );

            const nodesInsert = tracker.history.insert[1];
            // Bindings: tree_uuid, catalog_search_uuid, x_position(null), y_position(null), source
            expect(nodesInsert.bindings).toContain(null);
        });

        test('should create a sub-tree with a subset of nodes and edges', async () => {
            // Given metrics A -> B -> C exist globally,
            // we create a tree that only contains A -> B
            tracker.on
                .insert(({ sql }) => sql.includes(MetricsTreesTableName))
                .responseOnce([
                    {
                        ...MOCK_CREATED_TREE_ROW,
                        slug: 'sub-tree',
                        name: 'Sub Tree',
                    },
                ]);

            tracker.on
                .insert(({ sql }) => sql.includes(MetricsTreeNodesTableName))
                .responseOnce([]);

            tracker.on
                .insert(({ sql }) => sql.includes(MetricsTreeEdgesTableName))
                .responseOnce([]);

            const result = await model.createMetricsTree(
                {
                    project_uuid: MOCK_PROJECT_UUID,
                    slug: 'sub-tree',
                    name: 'Sub Tree',
                    description: null,
                    source: 'ui',
                    created_by_user_uuid: MOCK_USER_UUID,
                },
                [
                    { catalogSearchUuid: 'metric-a' },
                    { catalogSearchUuid: 'metric-b' },
                ],
                [
                    {
                        sourceCatalogSearchUuid: 'metric-a',
                        targetCatalogSearchUuid: 'metric-b',
                    },
                ],
            );

            expect(result.metricsTreeUuid).toEqual(MOCK_TREE_UUID);

            // Tree + nodes + edges = 3 inserts
            expect(tracker.history.insert).toHaveLength(3);

            // Verify only A and B are in the nodes insert (not C)
            const nodesInsert = tracker.history.insert[1];
            expect(nodesInsert.bindings).toContain('metric-a');
            expect(nodesInsert.bindings).toContain('metric-b');
            expect(nodesInsert.bindings).not.toContain('metric-c');

            // Verify only A -> B edge is inserted (not B -> C)
            const edgesInsert = tracker.history.insert[2];
            expect(edgesInsert.bindings).toContain('metric-a');
            expect(edgesInsert.bindings).toContain('metric-b');
            expect(edgesInsert.bindings).not.toContain('metric-c');
        });
    });
});
