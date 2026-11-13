import { DefaultSupportedDbtVersion, ProjectType } from '@lightdash/common';
import { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { down as downSavedComposerChartLink } from '../../../ee/database/migrations/20261113150000_add_saved_composer_chart_to_ai_artifact_versions';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { down, up } from '../20261113120000_add_composer_charts';

// Untyped on purpose: the test reads the raw schema.
const COMPOSER_CHARTS: string = 'composer_charts';
const COMPOSER_CHART_VERSIONS: string = 'composer_chart_versions';
const DASHBOARD_TILE_COMPOSER_CHARTS: string = 'dashboard_tile_composer_charts';
const DASHBOARD_TILES: string = 'dashboard_tiles';
const DASHBOARD_VERSIONS: string = 'dashboard_versions';

type Fixture = {
    projectUuid: string;
    spaceUuid: string;
    dashboardUuid: string;
    dashboardVersionId: number;
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
    const [{ space_id: spaceId, space_uuid: spaceUuid }] = await database(
        'spaces',
    )
        .insert({
            name: 'Reports',
            slug: 'reports',
            path: 'reports',
            project_id: projectId,
            parent_space_uuid: null,
            inherit_parent_permissions: true,
            is_default_user_space: false,
        })
        .returning(['space_id', 'space_uuid']);
    const [{ dashboard_id: dashboardId, dashboard_uuid: dashboardUuid }] =
        await database('dashboards')
            .insert({
                name: 'Composer dashboard',
                slug: `composer-dashboard-${randomUUID()}`,
                space_id: spaceId,
                project_uuid: projectUuid,
            })
            .returning(['dashboard_id', 'dashboard_uuid']);
    const [{ dashboard_version_id: dashboardVersionId }] = await database(
        DASHBOARD_VERSIONS,
    )
        .insert({ dashboard_id: dashboardId })
        .returning('dashboard_version_id');
    return {
        projectUuid,
        spaceUuid,
        dashboardUuid,
        dashboardVersionId,
        userUuid,
    };
};

const classicTileTypes = [
    'saved_chart',
    'sql_chart',
    'markdown',
    'loom',
    'heading',
    'data_app',
];

describe('composer charts migration on the real schema', () => {
    let migrated: MigratedDatabase;
    let database: Knex;
    let fixture: Fixture;

    const insertChart = (
        trx: Knex,
        overrides: Record<string, unknown> = {},
    ): Promise<{ composer_chart_uuid: string }[]> =>
        trx(COMPOSER_CHARTS)
            .insert({
                project_uuid: fixture.projectUuid,
                dashboard_uuid: fixture.dashboardUuid,
                name: 'Orders by month',
                slug: `orders-by-month-${randomUUID()}`,
                created_by_user_uuid: fixture.userUuid,
                ...overrides,
            })
            .returning('composer_chart_uuid');

    const expectRefused = async (
        trx: Knex.Transaction,
        write: (savepoint: Knex.Transaction) => Promise<unknown>,
    ) => {
        await expect(trx.transaction(write)).rejects.toThrow();
    };

    const inRolledBackTransaction = async (
        run: (trx: Knex.Transaction) => Promise<void>,
    ) => {
        const trx = await database.transaction();
        try {
            await run(trx);
        } finally {
            await trx.rollback();
        }
    };

    beforeAll(async () => {
        migrated = await createMigratedDatabase();
        database = migrated.database;
        fixture = await createFixture(database);
    });

    afterAll(async () => {
        await migrated?.destroy();
    });

    it('keeps every existing tile type insertable', async () => {
        const rows = classicTileTypes.map((type) => ({
            dashboard_version_id: fixture.dashboardVersionId,
            dashboard_tile_uuid: randomUUID(),
            type,
            x_offset: 0,
            y_offset: 0,
            height: 3,
            width: 6,
        }));
        await inRolledBackTransaction(async (trx) => {
            await trx(DASHBOARD_TILES).insert(rows);
            const types = await trx(DASHBOARD_TILES)
                .whereIn(
                    'dashboard_tile_uuid',
                    rows.map((row) => row.dashboard_tile_uuid),
                )
                .pluck('type');
            expect(types.sort()).toEqual([...classicTileTypes].sort());
        });
    });

    it('stores a dashboard-owned chart, its versions and its tile', async () => {
        await inRolledBackTransaction(async (trx) => {
            const [{ composer_chart_uuid: chartUuid }] = await insertChart(trx);
            await trx(COMPOSER_CHART_VERSIONS).insert({
                composer_chart_uuid: chartUuid,
                pipeline: JSON.stringify({ schemaVersion: 1 }),
                chart: JSON.stringify({ schemaVersion: 1 }),
                created_by_user_uuid: fixture.userUuid,
            });
            const tileUuid = randomUUID();
            await trx(DASHBOARD_TILES).insert({
                dashboard_version_id: fixture.dashboardVersionId,
                dashboard_tile_uuid: tileUuid,
                type: 'composer_chart',
                x_offset: 0,
                y_offset: 0,
                height: 3,
                width: 6,
            });
            await trx(DASHBOARD_TILE_COMPOSER_CHARTS).insert({
                dashboard_version_id: fixture.dashboardVersionId,
                dashboard_tile_uuid: tileUuid,
                composer_chart_uuid: chartUuid,
                title: 'Orders',
            });
            const tile = await trx(DASHBOARD_TILE_COMPOSER_CHARTS)
                .where('dashboard_tile_uuid', tileUuid)
                .first();
            expect(tile).toMatchObject({
                composer_chart_uuid: chartUuid,
                title: 'Orders',
                hide_title: false,
            });
        });
    });

    it('accepts a supplied chart uuid', async () => {
        const suppliedUuid = randomUUID();
        await inRolledBackTransaction(async (trx) => {
            const [{ composer_chart_uuid: chartUuid }] = await insertChart(
                trx,
                { composer_chart_uuid: suppliedUuid },
            );
            expect(chartUuid).toBe(suppliedUuid);
        });
    });

    it('requires exactly one owner', async () => {
        await inRolledBackTransaction(async (trx) => {
            await expectRefused(trx, (savepoint) =>
                insertChart(savepoint, { dashboard_uuid: null }),
            );
            await expectRefused(trx, (savepoint) =>
                insertChart(savepoint, { space_uuid: fixture.spaceUuid }),
            );
            await insertChart(trx, {
                dashboard_uuid: null,
                space_uuid: fixture.spaceUuid,
            });
        });
    });

    it('keeps slugs unique per project, deleted charts included', async () => {
        await inRolledBackTransaction(async (trx) => {
            await insertChart(trx, {
                slug: 'revenue',
                deleted_at: new Date(),
                deleted_by_user_uuid: fixture.userUuid,
            });
            await expectRefused(trx, (savepoint) =>
                insertChart(savepoint, { slug: 'revenue' }),
            );
        });
    });

    it('requires a chart on every composer tile', async () => {
        await inRolledBackTransaction(async (trx) => {
            const tileUuid = randomUUID();
            await trx(DASHBOARD_TILES).insert({
                dashboard_version_id: fixture.dashboardVersionId,
                dashboard_tile_uuid: tileUuid,
                type: 'composer_chart',
                x_offset: 0,
                y_offset: 0,
                height: 3,
                width: 6,
            });
            await expectRefused(trx, (savepoint) =>
                savepoint(DASHBOARD_TILE_COMPOSER_CHARTS).insert({
                    dashboard_version_id: fixture.dashboardVersionId,
                    dashboard_tile_uuid: tileUuid,
                    composer_chart_uuid: null,
                }),
            );
        });
    });

    it('down removes only what the migration added', async () => {
        await inRolledBackTransaction(async (trx) => {
            const classicTileUuid = randomUUID();
            await trx(DASHBOARD_TILES).insert({
                dashboard_version_id: fixture.dashboardVersionId,
                dashboard_tile_uuid: classicTileUuid,
                type: 'markdown',
                x_offset: 0,
                y_offset: 0,
                height: 3,
                width: 6,
            });

            // Later migrations roll back first; this one drops the AI answer link's FK.
            await downSavedComposerChartLink(trx);
            await down(trx);

            expect(
                await Promise.all(
                    [
                        COMPOSER_CHARTS,
                        COMPOSER_CHART_VERSIONS,
                        DASHBOARD_TILE_COMPOSER_CHARTS,
                    ].map((table) => trx.schema.hasTable(table)),
                ),
            ).toEqual([false, false, false]);
            const tileTypes = await trx('dashboard_tile_types').pluck(
                'dashboard_tile_type',
            );
            expect(tileTypes).not.toContain('composer_chart');
            expect(tileTypes).toEqual(expect.arrayContaining(classicTileTypes));
            expect(
                await trx(DASHBOARD_TILES)
                    .where('dashboard_tile_uuid', classicTileUuid)
                    .first(),
            ).toBeDefined();

            await up(trx);
            expect(await trx.schema.hasTable('composer_charts')).toBe(true);
        });
    });
});
