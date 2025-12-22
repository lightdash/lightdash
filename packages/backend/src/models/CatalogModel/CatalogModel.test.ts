import knex from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { MetricsTreeEdgesTableName } from '../../database/entities/catalog';
import { CatalogModel } from './CatalogModel';

describe('CatalogModel', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });

    const model = new CatalogModel({
        database,
        lightdashConfig: lightdashConfigMock,
    });

    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
        jest.restoreAllMocks();
    });

    describe('getAllMetricsTreeEdges', () => {
        const projectUuid = 'test-project-uuid';
        const mockEdgeResult = [
            {
                source_metric_catalog_search_uuid: 'source-uuid',
                target_metric_catalog_search_uuid: 'target-uuid',
                created_at: new Date(),
                created_by_user_uuid: 'user-uuid',
                source_metric_name: 'source_metric',
                source_metric_table_name: 'source_table',
                target_metric_name: 'target_metric',
                target_metric_table_name: 'target_table',
            },
        ];

        test('should use new query when project_uuid column exists', async () => {
            // Mock hasProjectUuidColumn to return true (column exists)
            jest.spyOn(model, 'hasProjectUuidColumn').mockResolvedValue(true);

            tracker.on
                .select(MetricsTreeEdgesTableName)
                .responseOnce(mockEdgeResult);

            const result = await model.getAllMetricsTreeEdges(projectUuid);

            expect(result).toHaveLength(1);
            expect(result[0].source.name).toBe('source_metric');
            expect(result[0].target.name).toBe('target_metric');

            // Verify the query uses WHERE clause on metrics_tree_edges.project_uuid
            const selectQuery = tracker.history.select[0];
            expect(selectQuery.sql).toContain(
                `"${MetricsTreeEdgesTableName}"."project_uuid"`,
            );
            expect(selectQuery.bindings).toContain(projectUuid);
        });

        test('should use legacy query when project_uuid column does not exist', async () => {
            // Mock hasProjectUuidColumn to return false (column does not exist)
            jest.spyOn(model, 'hasProjectUuidColumn').mockResolvedValue(false);

            tracker.on
                .select(MetricsTreeEdgesTableName)
                .responseOnce(mockEdgeResult);

            const result = await model.getAllMetricsTreeEdges(projectUuid);

            expect(result).toHaveLength(1);
            expect(result[0].source.name).toBe('source_metric');
            expect(result[0].target.name).toBe('target_metric');

            // Verify the legacy query does NOT have WHERE on metrics_tree_edges.project_uuid
            // Instead it filters via join conditions on source_metric and target_metric
            const selectQuery = tracker.history.select[0];
            expect(selectQuery.sql).not.toContain(
                `"${MetricsTreeEdgesTableName}"."project_uuid"`,
            );
            // Verify it uses the join-based filtering pattern
            expect(selectQuery.sql).toContain('source_metric');
            expect(selectQuery.sql).toContain('target_metric');
        });
    });

    describe('createMetricsTreeEdge', () => {
        const projectUuid = 'test-project-uuid';
        const edgeInput = {
            source_metric_catalog_search_uuid: 'source-uuid',
            target_metric_catalog_search_uuid: 'target-uuid',
            created_by_user_uuid: 'user-uuid',
        };

        test('should include project_uuid when column exists', async () => {
            jest.spyOn(model, 'hasProjectUuidColumn').mockResolvedValue(true);

            tracker.on.insert(MetricsTreeEdgesTableName).responseOnce([]);

            await model.createMetricsTreeEdge(edgeInput, projectUuid);

            const insertQuery = tracker.history.insert[0];
            expect(insertQuery.bindings).toContain(projectUuid);
        });

        test('should not include project_uuid when column does not exist', async () => {
            jest.spyOn(model, 'hasProjectUuidColumn').mockResolvedValue(false);

            tracker.on.insert(MetricsTreeEdgesTableName).responseOnce([]);

            await model.createMetricsTreeEdge(edgeInput, projectUuid);

            const insertQuery = tracker.history.insert[0];
            expect(insertQuery.bindings).not.toContain(projectUuid);
        });
    });

    describe('migrateMetricsTreeEdges', () => {
        const projectUuid = 'test-project-uuid';
        const edgesInput = [
            {
                source_metric_catalog_search_uuid: 'source-uuid-1',
                target_metric_catalog_search_uuid: 'target-uuid-1',
                created_by_user_uuid: 'user-uuid',
            },
            {
                source_metric_catalog_search_uuid: 'source-uuid-2',
                target_metric_catalog_search_uuid: 'target-uuid-2',
                created_by_user_uuid: 'user-uuid',
            },
        ];

        test('should include project_uuid for all edges when column exists', async () => {
            jest.spyOn(model, 'hasProjectUuidColumn').mockResolvedValue(true);

            tracker.on.insert(MetricsTreeEdgesTableName).responseOnce([]);

            await model.migrateMetricsTreeEdges(edgesInput, projectUuid);

            const insertQuery = tracker.history.insert[0];
            // Should contain projectUuid twice (once per edge)
            const projectUuidCount = insertQuery.bindings.filter(
                (b: unknown) => b === projectUuid,
            ).length;
            expect(projectUuidCount).toBe(2);
        });

        test('should not include project_uuid when column does not exist', async () => {
            jest.spyOn(model, 'hasProjectUuidColumn').mockResolvedValue(false);

            tracker.on.insert(MetricsTreeEdgesTableName).responseOnce([]);

            await model.migrateMetricsTreeEdges(edgesInput, projectUuid);

            const insertQuery = tracker.history.insert[0];
            expect(insertQuery.bindings).not.toContain(projectUuid);
        });
    });
});
