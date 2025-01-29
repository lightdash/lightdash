import { knex } from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import { SavedChartsTableName } from '../../../database/entities/savedCharts';
import { generateUniqueSlugScopedToProject } from '../../../utils/SlugUtils';
import { getFixDuplicateSlugsScripts } from './fixDuplicateSlugs';
import { queryMatcher } from './testUtils';

jest.mock('../../../utils/SlugUtils', () => ({
    generateUniqueSlugScopedToProject: jest.fn(),
}));

describe('fixDuplicateSlugs', () => {
    let tracker: Tracker;
    const database = knex({ client: MockClient });
    const scripts = getFixDuplicateSlugsScripts(database);

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
        jest.clearAllMocks();
    });

    describe('fixDuplicateChartSlugsForProject', () => {
        const projectUuid = 'test-project-uuid';

        test('should not update anything when no duplicate slugs exist', async () => {
            // Mock the query that finds duplicate slugs
            tracker.on
                .select(queryMatcher(SavedChartsTableName, [projectUuid]))
                .response([]);

            await scripts.fixDuplicateChartSlugsForProject(projectUuid, {
                dryRun: false,
            });

            expect(tracker.history.select).toHaveLength(1);
            expect(generateUniqueSlugScopedToProject).not.toHaveBeenCalled();
            expect(tracker.history.update).toHaveLength(0);
        });

        test('should update charts with duplicate slugs', async () => {
            const duplicateSlug = 'duplicate-slug';

            // Mock finding duplicate slugs
            tracker.on
                .select(queryMatcher(SavedChartsTableName, [projectUuid]))
                .responseOnce([{ slug: duplicateSlug }]);

            // Mock finding charts with the duplicate slug
            tracker.on
                .select(
                    queryMatcher(SavedChartsTableName, [
                        projectUuid,
                        duplicateSlug,
                    ]),
                )
                .responseOnce([
                    {
                        saved_query_uuid: 'chart1',
                        slug: duplicateSlug,
                        name: 'Chart 1',
                        created_at: new Date('2024-01-01'),
                    },
                    {
                        saved_query_uuid: 'chart2',
                        slug: duplicateSlug,
                        name: 'Chart 2',
                        created_at: new Date('2024-01-02'),
                    },
                ]);

            // Mock generateUniqueSlugScopedToProject
            (
                generateUniqueSlugScopedToProject as jest.Mock
            ).mockResolvedValueOnce('unique-slug');

            // Mock the update query
            tracker.on
                .update(
                    queryMatcher(SavedChartsTableName, [
                        'unique-slug',
                        'chart2',
                    ]),
                )
                .response([1]);

            await scripts.fixDuplicateChartSlugsForProject(projectUuid, {
                dryRun: false,
            });

            expect(generateUniqueSlugScopedToProject).toHaveBeenCalledTimes(1);
            expect(generateUniqueSlugScopedToProject).toHaveBeenCalledWith(
                expect.anything(),
                projectUuid,
                SavedChartsTableName,
                duplicateSlug,
            );

            expect(tracker.history.update).toHaveLength(1);
            expect(tracker.history.transactions[0].state).toEqual('committed');
            expect(tracker.history.update[0].bindings).toContain('unique-slug');
            expect(tracker.history.update[0].bindings).toContain('chart2');
        });

        test('should not update anything when dry run is true', async () => {
            const duplicateSlug = 'duplicate-slug';

            // Mock finding duplicate slugs
            tracker.on
                .select(queryMatcher(SavedChartsTableName, [projectUuid]))
                .responseOnce([{ slug: duplicateSlug }]);

            // Mock finding charts with the duplicate slug
            tracker.on
                .select(
                    queryMatcher(SavedChartsTableName, [
                        projectUuid,
                        duplicateSlug,
                    ]),
                )
                .responseOnce([
                    {
                        saved_query_uuid: 'chart1',
                        slug: duplicateSlug,
                        name: 'Chart 1',
                        created_at: new Date('2024-01-01'),
                    },
                    {
                        saved_query_uuid: 'chart2',
                        slug: duplicateSlug,
                        name: 'Chart 2',
                        created_at: new Date('2024-01-02'),
                    },
                ]);

            // Mock generateUniqueSlugScopedToProject
            (
                generateUniqueSlugScopedToProject as jest.Mock
            ).mockResolvedValueOnce('unique-slug');

            // Mock the update query
            tracker.on
                .update(
                    queryMatcher(SavedChartsTableName, [
                        'unique-slug',
                        'chart2',
                    ]),
                )
                .response([1]);

            await scripts.fixDuplicateChartSlugsForProject(projectUuid, {
                dryRun: true,
            });

            expect(tracker.history.transactions[0].state).toEqual(
                'rolled back',
            );
        });

        test('should handle multiple charts with the same slug', async () => {
            const duplicateSlug = 'duplicate-slug';

            // Mock finding duplicate slugs
            tracker.on
                .select(queryMatcher(SavedChartsTableName, [projectUuid]))
                .responseOnce([{ slug: duplicateSlug }]);

            // Mock finding charts with the duplicate slug
            tracker.on
                .select(
                    queryMatcher(SavedChartsTableName, [
                        projectUuid,
                        duplicateSlug,
                    ]),
                )
                .responseOnce([
                    {
                        saved_query_uuid: 'chart1',
                        slug: duplicateSlug,
                        name: 'Chart 1',
                        created_at: new Date('2024-01-01'),
                    },
                    {
                        saved_query_uuid: 'chart2',
                        slug: duplicateSlug,
                        name: 'Chart 2',
                        created_at: new Date('2024-01-02'),
                    },
                    {
                        saved_query_uuid: 'chart3',
                        slug: duplicateSlug,
                        name: 'Chart 3',
                        created_at: new Date('2024-01-03'),
                    },
                ]);

            // Mock generateUniqueSlugScopedToProject for each duplicate
            (generateUniqueSlugScopedToProject as jest.Mock)
                .mockResolvedValueOnce('unique-slug-1')
                .mockResolvedValueOnce('unique-slug-2');

            // Mock the update queries
            tracker.on
                .update(
                    queryMatcher(SavedChartsTableName, [
                        'unique-slug-1',
                        'chart2',
                    ]),
                )
                .response([1]);

            tracker.on
                .update(
                    queryMatcher(SavedChartsTableName, [
                        'unique-slug-2',
                        'chart3',
                    ]),
                )
                .response([1]);

            await scripts.fixDuplicateChartSlugsForProject(projectUuid, {
                dryRun: false,
            });

            expect(generateUniqueSlugScopedToProject).toHaveBeenCalledTimes(2);
            expect(generateUniqueSlugScopedToProject).toHaveBeenCalledWith(
                expect.anything(),
                projectUuid,
                SavedChartsTableName,
                duplicateSlug,
            );
            expect(tracker.history.update).toHaveLength(2);
            expect(tracker.history.transactions[0].state).toEqual('committed');
            expect(tracker.history.update[0].bindings).toContain(
                'unique-slug-1',
            );
            expect(tracker.history.update[0].bindings).toContain('chart2');
            expect(tracker.history.update[1].bindings).toContain(
                'unique-slug-2',
            );
            expect(tracker.history.update[1].bindings).toContain('chart3');
        });

        test('should throw an error when dryRun is not provided', async () => {
            await expect(
                // @ts-expect-error - we are testing the error case because the repl runs in JS not TS
                scripts.fixDuplicateChartSlugsForProject(projectUuid),
            ).rejects.toThrow('Missing dryRun option!!');
        });
    });
});
