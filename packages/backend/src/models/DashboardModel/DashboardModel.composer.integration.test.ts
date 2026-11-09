import {
    ChartKind,
    ChartType,
    DashboardTileTypes,
    DefaultSupportedDbtVersion,
    ProjectType,
    toTimezoneSetting,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { composerPipelineFixture } from '../../testing/composerSavedChartFixture';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../testing/migratedDatabase';
import { DashboardModel } from './DashboardModel';

type Fixture = {
    projectUuid: string;
    spaceId: number;
    userUuid: string;
};

const createFixture = async (database: Knex): Promise<Fixture> => {
    const [{ organization_id: organizationId }] = await database(
        'organizations',
    )
        .insert({ organization_name: `composer tiles ${randomUUID()}` })
        .returning('organization_id');
    const [{ user_uuid: userUuid }] = await database('users')
        .insert({
            first_name: 'Composer',
            last_name: 'Tiles',
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

describe('Dashboard tiles over composer charts on the real schema', () => {
    let migrated: MigratedDatabase;
    let database: Knex;
    let model: DashboardModel;
    let fixture: Fixture;

    beforeAll(async () => {
        migrated = await createMigratedDatabase();
        database = migrated.database;
        model = new DashboardModel({ database });
        fixture = await createFixture(database);
    });

    afterAll(async () => {
        await migrated?.destroy();
    });

    const createChart = async (
        name: string,
        dashboardUuid: string,
        version: { explore_name: string | null; pipeline: object | null },
    ): Promise<{ id: number; uuid: string }> => {
        const [{ saved_query_id: id, saved_query_uuid: uuid }] = await database(
            'saved_queries',
        )
            .insert({
                name,
                description: undefined,
                slug: `${name}-${randomUUID()}`,
                last_version_chart_kind: ChartKind.VERTICAL_BAR,
                last_version_updated_by_user_uuid: fixture.userUuid,
                color_palette_uuid: null,
                project_uuid: fixture.projectUuid,
                space_id: fixture.spaceId,
                dashboard_uuid: dashboardUuid,
            })
            .returning(['saved_query_id', 'saved_query_uuid']);
        await database('saved_queries_versions').insert({
            saved_query_id: id,
            ...version,
            filters: {},
            row_limit: 100,
            chart_type: ChartType.CARTESIAN,
            chart_config: {
                layout: { xField: 'composer_result_orders_status' },
                eChartsConfig: { series: [] },
            },
            pivot_dimensions: null,
            pivot_rows: null,
            metric_overrides: null,
            dimension_overrides: null,
            parameters: null,
            updated_by_user_uuid: fixture.userUuid,
            timezone: toTimezoneSetting(undefined),
            agent_identity: null,
        });
        return { id: id as number, uuid: uuid as string };
    };

    test('getByIdOrSlug tags each chart tile by the kind of query its latest version runs', async () => {
        const [{ dashboard_id: dashboardId, dashboard_uuid: dashboardUuid }] =
            await database('dashboards')
                .insert({
                    name: 'Revenue',
                    description: undefined,
                    slug: `revenue-${randomUUID()}`,
                    space_id: fixture.spaceId,
                    project_uuid: fixture.projectUuid,
                })
                .returning(['dashboard_id', 'dashboard_uuid']);
        const [{ dashboard_version_id: versionId }] = await database(
            'dashboard_versions',
        )
            .insert({
                dashboard_id: dashboardId,
                updated_by_user_uuid: fixture.userUuid,
                config: undefined,
                agent_identity: null,
            })
            .returning('dashboard_version_id');
        await database('dashboard_views').insert({
            dashboard_version_id: versionId,
            name: 'Default',
            filters: { dimensions: [], metrics: [], tableCalculations: [] },
            parameters: null,
        });
        const composer = await createChart('composer', dashboardUuid, {
            explore_name: null,
            pipeline: composerPipelineFixture,
        });
        const classic = await createChart('classic', dashboardUuid, {
            explore_name: 'orders',
            pipeline: null,
        });
        const tiles = [
            { tileUuid: randomUUID(), chart: composer, y: 0 },
            { tileUuid: randomUUID(), chart: classic, y: 1 },
        ];
        await database('dashboard_tiles').insert(
            tiles.map(({ tileUuid, y }) => ({
                dashboard_tile_uuid: tileUuid,
                dashboard_version_id: versionId,
                type: DashboardTileTypes.SAVED_CHART,
                x_offset: 0,
                y_offset: y,
                height: 3,
                width: 6,
                tab_uuid: null,
            })),
        );
        await database('dashboard_tile_charts').insert(
            tiles.map(({ tileUuid, chart }) => ({
                dashboard_version_id: versionId,
                dashboard_tile_uuid: tileUuid,
                saved_chart_id: chart.id,
            })),
        );

        const dashboard = await model.getByIdOrSlug(dashboardUuid);
        const byChart = Object.fromEntries(
            dashboard.tiles.map((tile) => [
                tile.type === DashboardTileTypes.SAVED_CHART
                    ? tile.properties.savedChartUuid
                    : tile.uuid,
                tile.properties,
            ]),
        );
        expect(byChart[composer.uuid]).toMatchObject({
            queryType: 'composer',
            belongsToDashboard: true,
        });
        expect(byChart[classic.uuid]).toMatchObject({
            queryType: 'semantic',
        });

        const version = await model.getVersionByUuid(
            dashboardUuid,
            dashboard.versionUuid,
        );
        expect(
            version.tiles.map((tile) =>
                tile.type === DashboardTileTypes.SAVED_CHART
                    ? tile.properties.queryType
                    : null,
            ),
        ).toEqual(['composer', 'semantic']);
    });
});
