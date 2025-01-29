import { deepEqual, type AnyType } from '@lightdash/common';
import { knex } from 'knex';
import {
    getTracker,
    MockClient,
    Tracker,
    type FunctionQueryMatcher,
    type RawQuery,
} from 'knex-mock-client';
import { SavedChartsTableName } from '../../../database/entities/savedCharts';
import { generateUniqueSlug } from '../../../utils/SlugUtils';
import { getFixDuplicateSlugsScripts } from './fixDuplicateSlugs';

jest.mock('../../../utils/SlugUtils', () => ({
    generateUniqueSlug: jest.fn(),
}));

function queryMatcher(
    tableName: string,
    params: AnyType[] = [],
): FunctionQueryMatcher {
    return ({ sql, bindings }: RawQuery) =>
        sql.includes(tableName) &&
        params.length === bindings.length &&
        params.reduce(
            (valid, arg, index) => valid && deepEqual(bindings[index], arg),
            true,
        );
}

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
            expect(generateUniqueSlug).not.toHaveBeenCalled();
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

            // Mock generateUniqueSlug
            (generateUniqueSlug as jest.Mock).mockResolvedValueOnce(
                'unique-slug',
            );

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

            expect(generateUniqueSlug).toHaveBeenCalledTimes(1);
            expect(generateUniqueSlug).toHaveBeenCalledWith(
                expect.anything(),
                SavedChartsTableName,
                duplicateSlug,
            );

            expect(tracker.history.update).toHaveLength(1);
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

            // Mock generateUniqueSlug
            (generateUniqueSlug as jest.Mock).mockResolvedValueOnce(
                'unique-slug',
            );

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

            expect(tracker.history.update).toHaveLength(0);
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

            // Mock generateUniqueSlug for each duplicate
            (generateUniqueSlug as jest.Mock)
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

            expect(generateUniqueSlug).toHaveBeenCalledTimes(2);
            expect(generateUniqueSlug).toHaveBeenCalledWith(
                expect.anything(),
                SavedChartsTableName,
                duplicateSlug,
            );
            expect(tracker.history.update).toHaveLength(2);
            expect(tracker.history.update[0].bindings).toContain(
                'unique-slug-1',
            );
            expect(tracker.history.update[0].bindings).toContain('chart2');
            expect(tracker.history.update[1].bindings).toContain(
                'unique-slug-2',
            );
            expect(tracker.history.update[1].bindings).toContain('chart3');
        });
    });
});
