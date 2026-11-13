import {
    DashboardTileTypes,
    DefaultSupportedDbtVersion,
    ProjectType,
    type DashboardDAO,
    type DashboardTile,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { DashboardModel } from '../../../models/DashboardModel/DashboardModel';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';

// Untyped on purpose: the test reads the raw schema.
const COMPOSER_CHARTS: string = 'composer_charts';

type Fixture = {
    projectUuid: string;
    spaceUuid: string;
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
                name: 'composer tiles',
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
    const [{ space_uuid: spaceUuid }] = await database('spaces')
        .insert({
            name: 'Reports',
            slug: 'reports',
            path: 'reports',
            project_id: projectId,
            parent_space_uuid: null,
            inherit_parent_permissions: true,
            is_default_user_space: false,
        })
        .returning('space_uuid');
    return { projectUuid, spaceUuid, userUuid };
};

const markdownTile = {
    type: DashboardTileTypes.MARKDOWN,
    x: 0,
    y: 0,
    h: 3,
    w: 6,
    tabUuid: undefined,
    properties: { title: 'Notes', content: 'Hello' },
} as const;

const toVersion = (dashboard: DashboardDAO, tiles: DashboardTile[]) => ({
    tiles,
    filters: dashboard.filters,
    tabs: dashboard.tabs,
});

describe('composer chart tiles in DashboardModel on the real schema', () => {
    let migrated: MigratedDatabase;
    let database: Knex;
    let model: DashboardModel;
    let fixture: Fixture;

    const createDashboardWithComposerTile = async () => {
        const created = await model.create(
            fixture.spaceUuid,
            {
                name: 'Composer dashboard',
                slug: `composer-dashboard-${randomUUID()}`,
                tiles: [markdownTile],
                tabs: [],
            },
            { userUuid: fixture.userUuid },
            fixture.projectUuid,
        );
        const [{ composer_chart_uuid: composerChartUuid }] = await database(
            COMPOSER_CHARTS,
        )
            .insert({
                project_uuid: fixture.projectUuid,
                dashboard_uuid: created.uuid,
                name: 'Orders by month',
                slug: `orders-by-month-${randomUUID()}`,
                created_by_user_uuid: fixture.userUuid,
            })
            .returning('composer_chart_uuid');
        const withComposerTile = await model.addVersion(
            created.uuid,
            toVersion(created, [
                ...created.tiles,
                {
                    uuid: randomUUID(),
                    type: DashboardTileTypes.COMPOSER_CHART,
                    x: 6,
                    y: 0,
                    h: 3,
                    w: 6,
                    tabUuid: null,
                    properties: { title: 'Orders', composerChartUuid },
                },
            ]),
            { userUuid: fixture.userUuid },
            fixture.projectUuid,
        );
        return { dashboard: withComposerTile, composerChartUuid };
    };

    beforeAll(async () => {
        migrated = await createMigratedDatabase();
        database = migrated.database;
        model = new DashboardModel({ database });
        fixture = await createFixture(database);
    });

    afterAll(async () => {
        await migrated?.destroy();
    });

    it('loads a composer tile beside a classic tile', async () => {
        const { dashboard, composerChartUuid } =
            await createDashboardWithComposerTile();

        expect(dashboard.tiles).toEqual([
            expect.objectContaining({
                type: DashboardTileTypes.MARKDOWN,
                properties: {
                    title: 'Notes',
                    content: 'Hello',
                    hideTitle: false,
                    hideFrame: false,
                },
            }),
            expect.objectContaining({
                type: DashboardTileTypes.COMPOSER_CHART,
                properties: {
                    title: 'Orders',
                    hideTitle: false,
                    composerChartUuid,
                    chartName: 'Orders by month',
                },
            }),
        ]);
    });

    it('keeps the chart link when the tile title is edited or hidden', async () => {
        const { dashboard, composerChartUuid } =
            await createDashboardWithComposerTile();

        const edited = await model.addVersion(
            dashboard.uuid,
            toVersion(
                dashboard,
                dashboard.tiles.map((tile) =>
                    tile.type === DashboardTileTypes.COMPOSER_CHART
                        ? {
                              ...tile,
                              properties: {
                                  ...tile.properties,
                                  title: 'Monthly orders',
                                  hideTitle: true,
                              },
                          }
                        : tile,
                ),
            ),
            { userUuid: fixture.userUuid },
            fixture.projectUuid,
        );

        expect(
            edited.tiles.find(
                (tile) => tile.type === DashboardTileTypes.COMPOSER_CHART,
            )?.properties,
        ).toEqual({
            title: 'Monthly orders',
            hideTitle: true,
            composerChartUuid,
            chartName: 'Orders by month',
        });
    });

    it('loads the composer tile in a past version', async () => {
        const { dashboard, composerChartUuid } =
            await createDashboardWithComposerTile();
        const [latest] = await model.getLatestVersionSummaries(dashboard.uuid);

        const version = await model.getVersionByUuid(
            dashboard.uuid,
            latest.versionUuid,
        );

        expect(
            version.tiles.find(
                (tile) => tile.type === DashboardTileTypes.COMPOSER_CHART,
            )?.properties,
        ).toEqual(expect.objectContaining({ composerChartUuid }));
    });
});
