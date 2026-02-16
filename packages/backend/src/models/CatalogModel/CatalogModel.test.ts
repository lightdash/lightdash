import { AlreadyExistsError } from '@lightdash/common';
import knex, { Knex } from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import {
    MetricsTreeEdgesTableName,
    MetricsTreeLocksTableName,
    MetricsTreeNodesTableName,
    MetricsTreesTableName,
} from '../../database/entities/catalog';
import { CatalogModel } from './CatalogModel';

const MOCK_PROJECT_UUID = 'project-uuid-1';
const MOCK_USER_UUID = 'user-uuid-1';
const MOCK_OTHER_USER_UUID = 'user-uuid-2';
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

    describe('acquireTreeLock', () => {
        const MOCK_LOCK_ROW = {
            metrics_tree_uuid: MOCK_TREE_UUID,
            locked_by_user_uuid: MOCK_USER_UUID,
            acquired_at: MOCK_TIMESTAMP,
            last_heartbeat_at: new Date(),
        };

        test('should acquire lock when no existing lock', async () => {
            tracker.on
                .insert(({ sql }) => sql.includes(MetricsTreeLocksTableName))
                .responseOnce([MOCK_LOCK_ROW]);

            // SELECT user info
            tracker.on
                .select(({ sql }) => sql.includes('users'))
                .responseOnce([{ first_name: 'John', last_name: 'Doe' }]);

            const result = await model.acquireTreeLock(
                MOCK_TREE_UUID,
                MOCK_USER_UUID,
            );

            expect(result).toEqual({
                lockedByUserUuid: MOCK_USER_UUID,
                lockedByUserName: 'John Doe',
                acquiredAt: MOCK_TIMESTAMP,
            });

            expect(tracker.history.insert).toHaveLength(1);
            // Verify the upsert uses onConflict merge
            const insertQuery = tracker.history.insert[0];
            expect(insertQuery.sql).toContain('on conflict');
        });

        test('should re-acquire lock when same user holds it', async () => {
            // Atomic upsert succeeds (same user matches WHERE condition)
            tracker.on
                .insert(({ sql }) => sql.includes(MetricsTreeLocksTableName))
                .responseOnce([MOCK_LOCK_ROW]);

            // SELECT user info
            tracker.on
                .select(({ sql }) => sql.includes('users'))
                .responseOnce([{ first_name: 'John', last_name: 'Doe' }]);

            const result = await model.acquireTreeLock(
                MOCK_TREE_UUID,
                MOCK_USER_UUID,
            );

            expect(result.lockedByUserUuid).toEqual(MOCK_USER_UUID);
            expect(tracker.history.insert).toHaveLength(1);
        });

        test('should acquire lock when existing lock is expired', async () => {
            // Atomic upsert succeeds (expired heartbeat matches WHERE condition)
            tracker.on
                .insert(({ sql }) => sql.includes(MetricsTreeLocksTableName))
                .responseOnce([MOCK_LOCK_ROW]);

            // SELECT user info
            tracker.on
                .select(({ sql }) => sql.includes('users'))
                .responseOnce([{ first_name: 'John', last_name: 'Doe' }]);

            const result = await model.acquireTreeLock(
                MOCK_TREE_UUID,
                MOCK_USER_UUID,
            );

            expect(result.lockedByUserUuid).toEqual(MOCK_USER_UUID);
            expect(tracker.history.insert).toHaveLength(1);
        });

        test('should throw when different user holds active lock', async () => {
            // Atomic upsert returns empty (WHERE conditions not met)
            tracker.on
                .insert(({ sql }) => sql.includes(MetricsTreeLocksTableName))
                .responseOnce([]);

            await expect(
                model.acquireTreeLock(MOCK_TREE_UUID, MOCK_USER_UUID),
            ).rejects.toThrow(AlreadyExistsError);

            // Only the failed upsert attempt, no user SELECT
            expect(tracker.history.insert).toHaveLength(1);
            expect(tracker.history.select).toHaveLength(0);
        });

        test('should format user name without last name', async () => {
            // Atomic upsert succeeds
            tracker.on
                .insert(({ sql }) => sql.includes(MetricsTreeLocksTableName))
                .responseOnce([MOCK_LOCK_ROW]);

            // SELECT user with null last name
            tracker.on
                .select(({ sql }) => sql.includes('users'))
                .responseOnce([{ first_name: 'John', last_name: null }]);

            const result = await model.acquireTreeLock(
                MOCK_TREE_UUID,
                MOCK_USER_UUID,
            );

            expect(result.lockedByUserName).toEqual('John');
        });
    });

    describe('refreshTreeLockHeartbeat', () => {
        test('should return true when lock is refreshed', async () => {
            // UPDATE returns 1 row affected
            tracker.on
                .update(({ sql }) => sql.includes(MetricsTreeLocksTableName))
                .responseOnce(1);

            const result = await model.refreshTreeLockHeartbeat(
                MOCK_TREE_UUID,
                MOCK_USER_UUID,
            );

            expect(result).toBe(true);

            // Verify update targets the correct tree + user
            const updateQuery = tracker.history.update[0];
            expect(updateQuery.bindings).toContain(MOCK_TREE_UUID);
            expect(updateQuery.bindings).toContain(MOCK_USER_UUID);
        });

        test('should return false when no matching lock exists', async () => {
            // UPDATE returns 0 rows affected (no lock found)
            tracker.on
                .update(({ sql }) => sql.includes(MetricsTreeLocksTableName))
                .responseOnce(0);

            const result = await model.refreshTreeLockHeartbeat(
                MOCK_TREE_UUID,
                MOCK_USER_UUID,
            );

            expect(result).toBe(false);
        });
    });

    describe('releaseTreeLock', () => {
        test('should delete lock for the given tree and user', async () => {
            tracker.on
                .delete(({ sql }) => sql.includes(MetricsTreeLocksTableName))
                .responseOnce([]);

            await model.releaseTreeLock(MOCK_TREE_UUID, MOCK_USER_UUID);

            expect(tracker.history.delete).toHaveLength(1);

            const deleteQuery = tracker.history.delete[0];
            expect(deleteQuery.bindings).toContain(MOCK_TREE_UUID);
            expect(deleteQuery.bindings).toContain(MOCK_USER_UUID);
        });
    });

    describe('getTreeLock', () => {
        test('should return lock info when active lock exists', async () => {
            tracker.on
                .select(
                    ({ sql }) =>
                        sql.includes(MetricsTreeLocksTableName) &&
                        sql.includes('users'),
                )
                .responseOnce([
                    {
                        metrics_tree_uuid: MOCK_TREE_UUID,
                        locked_by_user_uuid: MOCK_USER_UUID,
                        acquired_at: MOCK_TIMESTAMP,
                        last_heartbeat_at: new Date(),
                        first_name: 'John',
                        last_name: 'Doe',
                    },
                ]);

            const result = await model.getTreeLock(MOCK_TREE_UUID);

            expect(result).toEqual({
                lockedByUserUuid: MOCK_USER_UUID,
                lockedByUserName: 'John Doe',
                acquiredAt: MOCK_TIMESTAMP,
            });
        });

        test('should return null when no lock exists', async () => {
            tracker.on
                .select(
                    ({ sql }) =>
                        sql.includes(MetricsTreeLocksTableName) &&
                        sql.includes('users'),
                )
                .responseOnce([]);

            const result = await model.getTreeLock(MOCK_TREE_UUID);

            expect(result).toBeNull();
        });

        test('should include expiry condition in query', async () => {
            tracker.on
                .select(
                    ({ sql }) =>
                        sql.includes(MetricsTreeLocksTableName) &&
                        sql.includes('users'),
                )
                .responseOnce([]);

            await model.getTreeLock(MOCK_TREE_UUID);

            const selectQuery = tracker.history.select[0];
            // The query should include the heartbeat expiry check
            expect(selectQuery.sql).toContain('last_heartbeat_at');
        });
    });
});
