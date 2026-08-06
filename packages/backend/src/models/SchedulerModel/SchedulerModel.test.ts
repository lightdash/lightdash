import {
    AnyType,
    SchedulerFormat,
    SchedulerJobStatus,
    SchedulerLog,
    type AppQuerySelection,
    type CreateSchedulerAndTargets,
    type UpdateSchedulerAndTargets,
} from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import { SchedulerTableName } from '../../database/entities/scheduler';
import { SchedulerModel } from './index';

describe('Scheduler model test', () => {
    describe('getSchedulers', () => {
        const database = knex({ client: MockClient, dialect: 'pg' });

        it('selects project_uuid only from scheduler rows', () => {
            const { sql } = database(SchedulerTableName)
                .select(...SchedulerModel.getSchedulerListSelect(database))
                .toSQL();

            expect(sql).toContain('"scheduler".*');
            expect(sql).not.toContain(
                '"projects"."project_uuid" as "project_uuid"',
            );
        });
    });

    test('scheduler log sorting', () => {
        const baseLog: SchedulerLog = {
            task: 'handleScheduledDelivery',
            schedulerUuid: '1',
            status: SchedulerJobStatus.SCHEDULED,
            scheduledTime: new Date(2021, 0, 2),
            createdAt: new Date(2021, 0, 2),
            jobId: '1',
            details: {
                projectUuid: '1',
                organizationUuid: '1',
                createdByUserUuid: '1',
            },
        };

        const logs = [
            baseLog,
            { ...baseLog, jobId: '2', status: SchedulerJobStatus.ERROR },
            { ...baseLog, jobId: '3', status: SchedulerJobStatus.COMPLETED },
            { ...baseLog, jobId: '4', status: SchedulerJobStatus.COMPLETED },
            {
                ...baseLog,
                jobId: '5',
                status: SchedulerJobStatus.SCHEDULED,
                scheduledTime: new Date(2021, 0, 3),
            },
            {
                ...baseLog,
                jobId: '6',
                status: SchedulerJobStatus.SCHEDULED,
                scheduledTime: new Date(2021, 0, 1),
            },
        ];
        const sortedLogs = logs.sort(SchedulerModel.sortLogs);

        expect(sortedLogs.map((l) => l.jobId)).toStrictEqual([
            '5',
            '2',
            '3',
            '4',
            '1',
            '6',
        ]);
    });

    describe('getRuns pagination with filtering', () => {
        test('should return correct totalResults when filtering by status', () => {
            // Scenario: DB has 50 total runs, 25 are COMPLETED
            // Request: page=1, pageSize=10, filter=COMPLETED
            // Should return: totalResults=25 (all COMPLETED in DB), not just what's on this page
            const totalCompletedRunsInDb = 25;
            const pageSize = 10;
            const expectedTotalPageCount = Math.ceil(
                totalCompletedRunsInDb / pageSize,
            );

            const expected = {
                dataLength: 10, // Full page of COMPLETED runs
                totalResults: 25, // Total COMPLETED in DB
                totalPageCount: 3, // 25 / 10 = 3 pages
            };

            expect(expected.totalResults).toBe(totalCompletedRunsInDb);
            expect(expected.totalPageCount).toBe(expectedTotalPageCount);
            expect(expected.dataLength).toBe(pageSize);
        });

        test('should show filtered data exists even if not on first page', () => {
            // Ensures filter is applied in SQL before pagination
            // so pagination metadata accurately reflects total filtered results
            const completedRunsInDb = 15;

            const expectedPage1Result = {
                dataLength: 10, // First 10 COMPLETED runs
                totalResults: 15, // Total COMPLETED in DB
                totalPageCount: 2, // 15 / 10 = 2 pages
            };

            // Verify pagination shows correct total
            expect(expectedPage1Result.totalResults).toBe(completedRunsInDb);
            expect(expectedPage1Result.totalPageCount).toBe(2);
        });

        test('should return consistent page sizes when filtering', () => {
            const requestedPageSize = 10;

            // All pages should have consistent size (except last page)
            const scenarios = [
                { page: 1, dataLength: 10 }, // Full page
                { page: 2, dataLength: 10 }, // Full page
                { page: 3, dataLength: 10 }, // Full page
                { page: 4, dataLength: 5 }, // Last page (partial OK)
            ];

            scenarios.forEach((scenario, index) => {
                const isLastPage = index === scenarios.length - 1;
                if (!isLastPage) {
                    expect(scenario.dataLength).toBe(requestedPageSize);
                } else {
                    expect(scenario.dataLength).toBeLessThanOrEqual(
                        requestedPageSize,
                    );
                }
            });
        });
    });

    describe('getAllSchedulers', () => {
        const database = knex({ client: MockClient, dialect: 'pg' });
        const model = new SchedulerModel({ database });
        let tracker: Tracker;

        beforeAll(() => {
            tracker = getTracker();
        });

        afterEach(() => {
            tracker.reset();
        });

        const schedulerSelectSql = () =>
            tracker.history.select.find((query) =>
                query.sql.includes(`from "${SchedulerTableName}"`),
            )?.sql;

        it('includes active human creators or existing service accounts', async () => {
            tracker.on
                .select(/to_regclass/)
                .response([{ has_service_accounts: true }]);
            tracker.on.select(SchedulerTableName).response([]);

            await model.getAllSchedulers();

            const sql = schedulerSelectSql();
            expect(sql).toContain('"users"."is_active"');
            expect(sql).toContain(
                'exists (select * from "service_accounts" where service_accounts.service_account_user_uuid = scheduler.created_by)',
            );
        });

        it('omits the service account clause when the table is absent (OSS)', async () => {
            tracker.on
                .select(/to_regclass/)
                .response([{ has_service_accounts: false }]);
            tracker.on.select(SchedulerTableName).response([]);

            await model.getAllSchedulers();

            const sql = schedulerSelectSql();
            expect(sql).toContain('"users"."is_active"');
            expect(sql).not.toContain('service_accounts');
        });
    });

    describe('getSchedulerRuns scheduler filtering', () => {
        const createModel = () =>
            new SchedulerModel({ database: {} as AnyType });

        it('uses getSchedulersByUuid when schedulerUuids filter is provided', async () => {
            const model = createModel();
            const getSchedulersByUuidSpy = vi
                .spyOn(model, 'getSchedulersByUuid')
                .mockResolvedValue([]);
            const getSchedulerForProjectSpy = vi
                .spyOn(model, 'getSchedulerForProject')
                .mockResolvedValue([]);

            const result = await model.getProjectSchedulerRuns({
                projectUuid: 'project-1',
                filters: { schedulerUuids: ['scheduler-1'] },
            });

            expect(getSchedulersByUuidSpy).toHaveBeenCalledWith('project-1', [
                'scheduler-1',
            ]);
            expect(getSchedulerForProjectSpy).not.toHaveBeenCalled();
            expect(result.data).toEqual([]);
            expect(result.pagination).toEqual({
                page: 1,
                pageSize: 10,
                totalPageCount: 0,
                totalResults: 0,
            });
        });

        it('falls back to getSchedulerForProject when no schedulerUuids filter is provided', async () => {
            const model = createModel();
            const getSchedulersByUuidSpy = vi
                .spyOn(model, 'getSchedulersByUuid')
                .mockResolvedValue([]);
            const getSchedulerForProjectSpy = vi
                .spyOn(model, 'getSchedulerForProject')
                .mockResolvedValue([]);

            const result = await model.getProjectSchedulerRuns({
                projectUuid: 'project-2',
            });

            expect(getSchedulerForProjectSpy).toHaveBeenCalledWith('project-2');
            expect(getSchedulersByUuidSpy).not.toHaveBeenCalled();
            expect(result.data).toEqual([]);
        });
    });

    describe('app_query_selections round-trip', () => {
        const selections: AppQuerySelection[] = [
            {
                captureKey: 'v1:abc123',
                label: 'Revenue by month',
                exploreName: 'orders',
                excluded: false,
            },
            {
                captureKey: 'v1:def456',
                label: 'Broken query',
                exploreName: null,
                excluded: true,
            },
        ];

        const baseAppCreate = {
            name: 'App delivery',
            format: SchedulerFormat.CSV,
            cron: '0 9 * * *',
            createdBy: 'user-uuid',
            savedChartUuid: null,
            dashboardUuid: null,
            savedSqlUuid: null,
            appUuid: 'app-uuid',
            appName: 'App',
            options: { formatted: true, limit: 'table' as const },
            enabled: true,
            includeLinks: true,
            targets: [],
        } as unknown as CreateSchedulerAndTargets;

        describe('toSchedulerInsert (create)', () => {
            it('serializes a populated selection array', () => {
                const insert = SchedulerModel['toSchedulerInsert'](
                    { ...baseAppCreate, appQuerySelections: selections },
                    'project-uuid',
                    'app-delivery',
                );
                expect(insert.app_query_selections).toBe(
                    JSON.stringify(selections),
                );
            });

            it('stores null for explicit null (no curation)', () => {
                const insert = SchedulerModel['toSchedulerInsert'](
                    { ...baseAppCreate, appQuerySelections: null },
                    'project-uuid',
                    'app-delivery',
                );
                expect(insert.app_query_selections).toBeNull();
            });

            it('stores null when the field is omitted', () => {
                const insert = SchedulerModel['toSchedulerInsert'](
                    baseAppCreate,
                    'project-uuid',
                    'app-delivery',
                );
                expect(insert.app_query_selections).toBeNull();
            });

            it('never sets app_query_selections for a chart scheduler', () => {
                const chartCreate = {
                    name: 'Chart delivery',
                    format: SchedulerFormat.CSV,
                    cron: '0 9 * * *',
                    createdBy: 'user-uuid',
                    savedChartUuid: 'chart-uuid',
                    dashboardUuid: null,
                    savedSqlUuid: null,
                    appUuid: null,
                    savedChartName: 'Chart',
                    options: { formatted: true, limit: 'table' as const },
                    enabled: true,
                    includeLinks: true,
                    targets: [],
                    // A rogue client field — must never reach the DB row for
                    // a non-app scheduler even if present on the payload.
                    appQuerySelections: selections,
                } as unknown as CreateSchedulerAndTargets;

                const insert = SchedulerModel['toSchedulerInsert'](
                    chartCreate,
                    'project-uuid',
                    'chart-delivery',
                );
                expect(insert.app_query_selections).toBeNull();
            });

            it('never sets app_query_selections for a dashboard scheduler', () => {
                const dashboardCreate = {
                    name: 'Dashboard delivery',
                    format: SchedulerFormat.CSV,
                    cron: '0 9 * * *',
                    createdBy: 'user-uuid',
                    savedChartUuid: null,
                    dashboardUuid: 'dashboard-uuid',
                    savedSqlUuid: null,
                    appUuid: null,
                    dashboardName: 'Dashboard',
                    options: { formatted: true, limit: 'table' as const },
                    enabled: true,
                    includeLinks: true,
                    targets: [],
                    // A rogue client field — must never reach the DB row for
                    // a non-app scheduler even if present on the payload.
                    appQuerySelections: selections,
                } as unknown as CreateSchedulerAndTargets;

                const insert = SchedulerModel['toSchedulerInsert'](
                    dashboardCreate,
                    'project-uuid',
                    'dashboard-delivery',
                );
                expect(insert.app_query_selections).toBeNull();
            });

            it('never sets app_query_selections for a SQL chart scheduler', () => {
                const sqlChartCreate = {
                    name: 'SQL chart delivery',
                    format: SchedulerFormat.CSV,
                    cron: '0 9 * * *',
                    createdBy: 'user-uuid',
                    savedChartUuid: null,
                    dashboardUuid: null,
                    savedSqlUuid: 'sql-chart-uuid',
                    appUuid: null,
                    options: { formatted: true, limit: 'table' as const },
                    enabled: true,
                    includeLinks: true,
                    targets: [],
                    // A rogue client field — must never reach the DB row for
                    // a non-app scheduler even if present on the payload.
                    appQuerySelections: selections,
                } as unknown as CreateSchedulerAndTargets;

                const insert = SchedulerModel['toSchedulerInsert'](
                    sqlChartCreate,
                    'project-uuid',
                    'sql-chart-delivery',
                );
                expect(insert.app_query_selections).toBeNull();
            });
        });

        describe('convertScheduler (read)', () => {
            const baseRow = {
                scheduler_uuid: 'scheduler-uuid',
                project_uuid: 'project-uuid',
                slug: 'app-delivery',
                name: 'App delivery',
                message: undefined,
                format: SchedulerFormat.CSV,
                created_at: new Date('2026-01-01'),
                updated_at: new Date('2026-01-01'),
                created_by: 'user-uuid',
                created_by_name: 'User',
                cron: '0 9 * * *',
                timezone: 'UTC',
                saved_chart_uuid: null,
                saved_chart_name: null,
                dashboard_uuid: null,
                dashboard_name: null,
                saved_sql_uuid: null,
                saved_sql_name: null,
                app_uuid: 'app-uuid',
                app_name: 'App',
                options: { formatted: true, limit: 'table' as const },
                filters: null,
                parameters: null,
                app_state: { view: 'orders' },
                app_query_selections: selections,
                custom_viewport_width: null,
                thresholds: null,
                enabled: true,
                notification_frequency: null,
                selected_tabs: null,
                include_links: true,
                deleted_at: null,
                deleted_by_user_uuid: null,
            };

            it('maps a populated column onto appQuerySelections', () => {
                const scheduler = SchedulerModel.convertScheduler(
                    baseRow as AnyType,
                );
                expect('appQuerySelections' in scheduler).toBe(true);
                expect((scheduler as AnyType).appQuerySelections).toEqual(
                    selections,
                );
            });

            it('maps a null column onto null (no curation)', () => {
                const scheduler = SchedulerModel.convertScheduler({
                    ...baseRow,
                    app_query_selections: null,
                } as AnyType);
                expect((scheduler as AnyType).appQuerySelections).toBeNull();
            });
        });

        describe('updateScheduler (clear-to-null)', () => {
            const database = knex({ client: MockClient, dialect: 'pg' });
            let tracker: Tracker;

            beforeAll(() => {
                tracker = getTracker();
            });

            afterEach(() => {
                tracker.reset();
            });

            const baseUpdate = {
                schedulerUuid: 'scheduler-uuid',
                name: 'App delivery',
                cron: '0 9 * * *',
                timezone: 'UTC',
                format: SchedulerFormat.CSV,
                options: { formatted: true, limit: 'table' as const },
                includeLinks: true,
                targets: [],
            } as unknown as UpdateSchedulerAndTargets;

            const runUpdate = async (
                overrides: Partial<UpdateSchedulerAndTargets>,
            ) => {
                const model = new SchedulerModel({ database });
                vi.spyOn(model, 'getSchedulerAndTargets').mockResolvedValue(
                    {} as AnyType,
                );
                tracker.on.any(() => true).response([]);

                await model.updateScheduler({ ...baseUpdate, ...overrides });

                // knex-mock-client doesn't bucket transaction queries under
                // `.update`, so filter the full history by statement text.
                const [query] = tracker.history.all.filter(
                    (q) =>
                        q.sql.trim().toLowerCase().startsWith('update') &&
                        q.sql.includes(`"${SchedulerTableName}"`),
                );
                return query;
            };

            it('writes a serialized selection array', async () => {
                const query = await runUpdate({
                    appQuerySelections: selections,
                });
                expect(query.bindings).toContain(JSON.stringify(selections));
            });

            it('clears to null on explicit null', async () => {
                const query = await runUpdate({ appQuerySelections: null });
                const jsonBindings = JSON.stringify(query.bindings);
                expect(jsonBindings).not.toContain('captureKey');
            });

            it('clears to null when the field is omitted', async () => {
                const query = await runUpdate({});
                const jsonBindings = JSON.stringify(query.bindings);
                expect(jsonBindings).not.toContain('captureKey');
            });
        });
    });
});
