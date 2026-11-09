import {
    ChartKind,
    ChartType,
    ComposerChartNotSupportedError,
    DefaultSupportedDbtVersion,
    NotFoundError,
    ProjectType,
    QuerySourceType,
    SAVED_COMPOSER_PIPELINE_SCHEMA_VERSION,
    toTimezoneSetting,
    type SavedComposerPipeline,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../testing/migratedDatabase';
import { SavedChartModel } from './SavedChartModel';

type Fixture = {
    projectUuid: string;
    spaceId: number;
    userUuid: string;
};

const createFixture = async (database: Knex): Promise<Fixture> => {
    const [{ organization_id: organizationId }] = await database(
        'organizations',
    )
        .insert({ organization_name: `composer charts ${randomUUID()}` })
        .returning('organization_id');
    const [{ user_uuid: userUuid }] = await database('users')
        .insert({
            first_name: 'Composer',
            last_name: 'Charts',
            is_active: true,
            is_marketing_opted_in: false,
            is_setup_complete: true,
            is_tracking_anonymized: false,
        })
        .returning('user_uuid');
    const [{ project_id: projectId, project_uuid: projectUuid }] =
        await database('projects')
            .insert({
                name: 'composer',
                organization_id: organizationId,
                project_type: ProjectType.DEFAULT,
                dbt_connection: null,
                dbt_connection_type: null,
                copied_from_project_uuid: null,
                dbt_version: DefaultSupportedDbtVersion,
                created_by_user_uuid: userUuid,
                organization_warehouse_credentials_uuid: null,
            })
            .returning(['project_id', 'project_uuid']);
    const [{ space_id: spaceId }] = await database('spaces')
        .insert({
            name: 'Reports',
            slug: `reports-${randomUUID()}`,
            path: `reports_${randomUUID().replaceAll('-', '_')}`,
            project_id: projectId,
            parent_space_uuid: null,
            inherit_parent_permissions: true,
            is_default_user_space: false,
        })
        .returning('space_id');
    return { projectUuid, spaceId, userUuid };
};

const pipeline: SavedComposerPipeline = {
    schemaVersion: SAVED_COMPOSER_PIPELINE_SCHEMA_VERSION,
    nodes: [
        {
            sourceType: QuerySourceType.SEMANTIC_LAYER,
            nodeId: 'orders',
            title: 'Orders',
            exploreName: 'orders',
            dimensions: ['orders_status'],
            metrics: ['orders_total_order_amount'],
            limit: 500,
        },
        {
            sourceType: QuerySourceType.DUCKDB,
            nodeId: 'by_status',
            title: 'Revenue by status',
            sql: 'SELECT orders_status, sum(orders_total_order_amount) AS revenue FROM orders GROUP BY 1',
            references: ['orders'],
            limit: 100,
        },
    ],
    terminalNodeId: 'by_status',
};

const barChartConfig = {
    layout: { xField: 'composer_result_orders_status' },
    eChartsConfig: { series: [] },
};

describe('Composer chart rows on the real schema', () => {
    let migrated: MigratedDatabase;
    let database: Knex;
    let model: SavedChartModel;
    let fixture: Fixture;

    const createChart = async (name: string) => {
        const [{ saved_query_id: id, saved_query_uuid: uuid }] = await database(
            'saved_queries',
        )
            .insert({
                name,
                description: null,
                slug: `${name}-${randomUUID()}`,
                last_version_chart_kind: ChartKind.VERTICAL_BAR,
                last_version_updated_by_user_uuid: fixture.userUuid,
                color_palette_uuid: null,
                project_uuid: fixture.projectUuid,
                space_id: fixture.spaceId,
                dashboard_uuid: null,
            })
            .returning(['saved_query_id', 'saved_query_uuid']);
        return { id: id as number, uuid: uuid as string };
    };

    // The row shape a composer chart version stores: no explore, no field or
    // sort child rows, no metric query; the pipeline column holds the query.
    const composerVersion = (savedQueryId: number) => ({
        saved_query_id: savedQueryId,
        explore_name: null,
        pipeline,
        filters: {},
        row_limit: 100,
        chart_type: ChartType.CARTESIAN,
        chart_config: barChartConfig,
        pivot_dimensions: null,
        pivot_rows: null,
        metric_overrides: null,
        dimension_overrides: null,
        parameters: null,
        updated_by_user_uuid: fixture.userUuid,
        timezone: toTimezoneSetting(undefined),
        agent_identity: null,
    });

    const semanticVersion = (savedQueryId: number) => ({
        ...composerVersion(savedQueryId),
        explore_name: 'orders',
        pipeline: null,
    });

    beforeAll(async () => {
        migrated = await createMigratedDatabase();
        database = migrated.database;
        model = new SavedChartModel({
            database,
            lightdashConfig: lightdashConfigMock,
        });
    });

    afterAll(async () => {
        await migrated?.destroy();
    });

    beforeEach(async () => {
        fixture = await createFixture(database);
    });

    describe('exactly one of explore_name and pipeline is set', () => {
        test('rejects a version with both set', async () => {
            const chart = await createChart('both');
            await expect(
                database('saved_queries_versions').insert({
                    ...composerVersion(chart.id),
                    explore_name: 'orders',
                }),
            ).rejects.toThrow('saved_queries_versions_query_source_check');
        });

        test('rejects a version with neither set', async () => {
            const chart = await createChart('neither');
            await expect(
                database('saved_queries_versions').insert({
                    ...composerVersion(chart.id),
                    pipeline: null,
                }),
            ).rejects.toThrow('saved_queries_versions_query_source_check');
        });
    });

    describe('reading a composer row', () => {
        test('get throws the typed error', async () => {
            const chart = await createChart('composer');
            await database('saved_queries_versions').insert(
                composerVersion(chart.id),
            );
            await expect(model.get(chart.uuid)).rejects.toBeInstanceOf(
                ComposerChartNotSupportedError,
            );
        });

        test('getVariant tags it composer with its pipeline and chart config', async () => {
            const chart = await createChart('composer');
            await database('saved_queries_versions').insert(
                composerVersion(chart.id),
            );
            const variant = await model.getVariant(chart.uuid);
            expect(variant.queryType).toBe('composer');
            if (variant.queryType !== 'composer') return;
            expect(variant.chart).toMatchObject({
                uuid: chart.uuid,
                name: 'composer',
                projectUuid: fixture.projectUuid,
                pipeline,
                chartConfig: {
                    type: ChartType.CARTESIAN,
                    config: barChartConfig,
                },
            });
            expect(variant.chart).not.toHaveProperty('metricQuery');
            expect(variant.chart).not.toHaveProperty('tableName');
        });

        test('getVariant throws on an unknown pipeline schema version', async () => {
            const chart = await createChart('future');
            await database('saved_queries_versions').insert({
                ...composerVersion(chart.id),
                pipeline: {
                    ...pipeline,
                    schemaVersion: 99,
                } as unknown as SavedComposerPipeline,
            });
            await expect(model.getVariant(chart.uuid)).rejects.toThrow(
                'schema version 99',
            );
        });

        test('softDelete works on a composer row', async () => {
            const chart = await createChart('deleted');
            await database('saved_queries_versions').insert(
                composerVersion(chart.id),
            );
            const deleted = await model.softDelete(
                chart.uuid,
                fixture.userUuid,
            );
            expect(deleted.queryType).toBe('composer');
            expect(deleted.chart.uuid).toBe(chart.uuid);
            await expect(model.getVariant(chart.uuid)).rejects.toBeInstanceOf(
                NotFoundError,
            );
        });

        test('permanentDelete works on a composer row', async () => {
            const chart = await createChart('purged');
            await database('saved_queries_versions').insert(
                composerVersion(chart.id),
            );
            const deleted = await model.permanentDelete(chart.uuid);
            expect(deleted.queryType).toBe('composer');
            await expect(
                model.getVariant(chart.uuid, undefined, { deleted: 'any' }),
            ).rejects.toBeInstanceOf(NotFoundError);
        });
    });

    describe('changing a composer row', () => {
        test('update retitles it and returns the composer variant', async () => {
            const chart = await createChart('old title');
            await database('saved_queries_versions').insert(
                composerVersion(chart.id),
            );
            const updated = await model.update(chart.uuid, {
                name: 'new title',
            });
            expect(updated.queryType).toBe('composer');
            expect(updated.chart.name).toBe('new title');
            const reread = await model.getVariant(chart.uuid);
            expect(reread.chart.name).toBe('new title');
        });
    });

    describe('writing composer rows', () => {
        const createDashboard = async () => {
            const [{ dashboard_uuid: dashboardUuid }] = await database(
                'dashboards',
            )
                .insert({
                    name: 'Revenue',
                    description: undefined,
                    project_uuid: fixture.projectUuid,
                    slug: `revenue-${randomUUID()}`,
                    space_id: fixture.spaceId,
                })
                .returning('dashboard_uuid');
            return dashboardUuid as string;
        };
        const chartConfig = {
            type: ChartType.CARTESIAN,
            config: barChartConfig,
        } as const;

        test('createComposerChart stores a null description as null', async () => {
            const created = await model.createComposerChart(
                fixture.projectUuid,
                fixture.userUuid,
                {
                    name: 'no description',
                    description: null,
                    dashboardUuid: await createDashboard(),
                    pipeline,
                    chartConfig,
                    pivotConfig: undefined,
                    slug: `no-description-${randomUUID()}`,
                },
            );
            expect(created.description).toBeNull();
            await expect(
                database('saved_queries')
                    .where('saved_query_uuid', created.uuid)
                    .first('description'),
            ).resolves.toEqual({ description: null });
        });

        test('createComposerChartVersion clears a stored description when given null', async () => {
            const created = await model.createComposerChart(
                fixture.projectUuid,
                fixture.userUuid,
                {
                    name: 'described',
                    description: 'Revenue by status',
                    dashboardUuid: await createDashboard(),
                    pipeline,
                    chartConfig,
                    pivotConfig: undefined,
                    slug: `described-${randomUUID()}`,
                },
            );
            expect(created.description).toBe('Revenue by status');
            const updated = await model.createComposerChartVersion(
                created.uuid,
                fixture.userUuid,
                {
                    name: 'described',
                    description: null,
                    pipeline,
                    chartConfig,
                    pivotConfig: undefined,
                },
            );
            expect(updated.description).toBeNull();
            await expect(
                database('saved_queries_versions')
                    .whereIn(
                        'saved_query_id',
                        database('saved_queries')
                            .select('saved_query_id')
                            .where('saved_query_uuid', created.uuid),
                    )
                    .count('* as versions')
                    .first(),
            ).resolves.toEqual({ versions: '2' });
        });
    });

    describe('finding composer rows in bulk', () => {
        test('findComposerCharts names the composer rows among the given charts', async () => {
            const composer = await createChart('pipeline');
            await database('saved_queries_versions').insert(
                composerVersion(composer.id),
            );
            const classic = await createChart('classic');
            await database('saved_queries_versions').insert(
                semanticVersion(classic.id),
            );
            await expect(
                model.findComposerCharts([composer.uuid, classic.uuid]),
            ).resolves.toEqual([
                expect.objectContaining({
                    uuid: composer.uuid,
                    name: 'pipeline',
                }),
            ]);
        });

        test('findComposerCharts leaves a soft-deleted composer row out', async () => {
            const live = await createChart('live-pipeline');
            await database('saved_queries_versions').insert(
                composerVersion(live.id),
            );
            const deleted = await createChart('deleted-pipeline');
            await database('saved_queries_versions').insert(
                composerVersion(deleted.id),
            );
            await database('saved_queries')
                .where('saved_query_uuid', deleted.uuid)
                .update({
                    deleted_at: new Date(),
                    deleted_by_user_uuid: fixture.userUuid,
                });
            await expect(
                model.findComposerCharts([live.uuid, deleted.uuid]),
            ).resolves.toEqual([expect.objectContaining({ uuid: live.uuid })]);
        });

        test('findComposerCharts names the row by its newest version, like get', async () => {
            const chart = await createChart('rolled-back');
            const setCreatedAt = (
                rows: { saved_queries_version_id: number }[],
                createdAt: string,
            ) =>
                database('saved_queries_versions')
                    .where(
                        'saved_queries_version_id',
                        rows[0].saved_queries_version_id,
                    )
                    .update({ created_at: new Date(createdAt) } as never);
            await setCreatedAt(
                await database('saved_queries_versions')
                    .insert(composerVersion(chart.id))
                    .returning('saved_queries_version_id'),
                '2026-01-01T00:00:00Z',
            );
            await setCreatedAt(
                await database('saved_queries_versions')
                    .insert(semanticVersion(chart.id))
                    .returning('saved_queries_version_id'),
                '2026-02-01T00:00:00Z',
            );
            await expect(
                model.findComposerCharts([chart.uuid]),
            ).resolves.toEqual([]);
            await expect(model.getVariant(chart.uuid)).resolves.toMatchObject({
                queryType: 'semantic',
            });
        });
    });

    describe('writing a composer row', () => {
        const createDashboard = async (deleted: boolean) => {
            const [{ dashboard_uuid: uuid }] = await database('dashboards')
                .insert({
                    project_uuid: fixture.projectUuid,
                    name: 'Revenue',
                    slug: `revenue-${randomUUID()}`,
                    space_id: fixture.spaceId,
                    ...(deleted && {
                        deleted_at: new Date(),
                        deleted_by_user_uuid: fixture.userUuid,
                    }),
                })
                .returning('dashboard_uuid');
            return uuid as string;
        };
        const composerChart = (dashboardUuid: string) => ({
            name: 'Revenue share',
            description: null,
            dashboardUuid,
            pipeline,
            chartConfig: {
                type: ChartType.CARTESIAN,
                config: barChartConfig,
            } as never,
            pivotConfig: undefined,
            slug: 'revenue-share',
        });

        test('createComposerChart writes a dashboard-owned composer row', async () => {
            const dashboardUuid = await createDashboard(false);
            const created = await model.createComposerChart(
                fixture.projectUuid,
                fixture.userUuid,
                composerChart(dashboardUuid),
            );
            expect(created).toMatchObject({ dashboardUuid, pipeline });
            await expect(
                model.findComposerCharts([created.uuid]),
            ).resolves.toEqual([
                expect.objectContaining({ uuid: created.uuid }),
            ]);
        });

        test('createComposerChart does not write into a soft-deleted dashboard', async () => {
            const dashboardUuid = await createDashboard(true);
            await expect(
                model.createComposerChart(
                    fixture.projectUuid,
                    fixture.userUuid,
                    composerChart(dashboardUuid),
                ),
            ).rejects.toBeInstanceOf(NotFoundError);
            await expect(
                database('saved_queries').where({
                    dashboard_uuid: dashboardUuid,
                }),
            ).resolves.toEqual([]);
        });
    });

    describe('bulk reads that used to assume an explore', () => {
        test('findChartsForValidation tags a composer row instead of inventing a table', async () => {
            const chart = await createChart('validated');
            await database('saved_queries_versions').insert(
                composerVersion(chart.id),
            );
            const [row] = await model.findChartsForValidation(
                fixture.projectUuid,
                chart.uuid,
            );
            expect(row).toMatchObject({
                uuid: chart.uuid,
                queryType: 'composer',
                tableName: null,
            });
        });

        test('getInfoForAvailableFilters leaves a composer row out instead of inventing a table', async () => {
            const chart = await createChart('filtered');
            await database('saved_queries_versions').insert(
                composerVersion(chart.id),
            );
            await expect(
                model.getInfoForAvailableFilters([chart.uuid]),
            ).resolves.toEqual([]);
        });
    });

    describe('reading a semantic row', () => {
        test('getVariant tags it semantic with the same chart get returns', async () => {
            const chart = await createChart('semantic');
            await database('saved_queries_versions').insert(
                semanticVersion(chart.id),
            );
            const variant = await model.getVariant(chart.uuid);
            expect(variant.queryType).toBe('semantic');
            expect(variant.chart).toEqual(await model.get(chart.uuid));
            if (variant.queryType !== 'semantic') return;
            expect(variant.chart.tableName).toBe('orders');
        });
    });
});
