import { ChartKind, ProjectType } from '@lightdash/common';
import knex, { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { type DbDashboard } from '../../database/entities/dashboards';
import { type DbSavedChart } from '../../database/entities/savedCharts';
import { ProjectModel } from './ProjectModel';
import { encryptionUtilMock } from './ProjectModel.mock';

describe('ProjectModel preview copy (PostgreSQL)', () => {
    let database: Knex;
    let trx: Knex.Transaction;

    beforeAll(() => {
        if (!process.env.PGCONNECTIONURI && !process.env.PGDATABASE) {
            throw new Error(
                'Set PGCONNECTIONURI or PG connection variables to a migrated test database',
            );
        }
        database = knex({
            client: 'pg',
            connection: process.env.PGCONNECTIONURI ?? {
                host: process.env.PGHOST,
                port: Number(process.env.PGPORT ?? 5432),
                user: process.env.PGUSER,
                password: process.env.PGPASSWORD,
                database: process.env.PGDATABASE,
            },
        });
    });
    beforeEach(async () => {
        trx = await database.transaction();
    });
    afterEach(async () => {
        await trx.rollback();
    });
    afterAll(async () => {
        await database?.destroy();
    });

    const createFixture = async () => {
        const [organization] = await trx('organizations')
            .insert({ organization_name: 'Preview copy regression' })
            .returning('*');
        const [source, preview] = await trx('projects')
            .insert(
                [ProjectType.DEFAULT, ProjectType.PREVIEW].map(
                    (projectType) => ({
                        name: `Preview copy ${projectType}`,
                        slug: `preview-copy-${projectType}`,
                        organization_id: organization.organization_id,
                        project_type: projectType,
                        dbt_connection: null,
                        dbt_connection_type: null,
                        copied_from_project_uuid: null,
                        dbt_version: '1.7',
                        created_by_user_uuid: null,
                        organization_warehouse_credentials_uuid: null,
                    }),
                ),
            )
            .returning('*');
        const [space] = await trx('spaces')
            .insert({
                name: 'Copy me',
                slug: 'copy-me',
                path: 'copy_me',
                project_id: source.project_id,
                parent_space_uuid: null,
                inherit_parent_permissions: true,
                is_default_user_space: false,
            })
            .returning('*');
        const model = new ProjectModel({
            database: trx,
            lightdashConfig: lightdashConfigMock,
            encryptionUtil: encryptionUtilMock,
        });
        return { source, preview, space, model };
    };

    test('copies a project with more than 65,535 combined tile and version IDs', async () => {
        const { source, preview, space, model } = await createFixture();
        const [dashboard] = await trx('dashboards')
            .insert({
                name: 'Large dashboard',
                slug: 'large-dashboard',
                project_uuid: source.project_uuid,
                space_id: space.space_id,
            })
            .returning('*');
        const [version] = await trx('dashboard_versions')
            .insert({
                dashboard_id: dashboard.dashboard_id,
                updated_by_user_uuid: undefined,
                config: undefined,
            })
            .returning('*');

        // Each list fits alone, but together the old tile-content SELECT needs 65,536 binds.
        await trx.raw(
            `
            INSERT INTO dashboard_tiles
                (dashboard_version_id, dashboard_tile_uuid, type, x_offset, y_offset, height, width)
            SELECT ?, uuid_generate_v4(), 'saved_chart', 0, n, 1, 1
            FROM generate_series(1, 65535) AS n
        `,
            [version.dashboard_version_id],
        );
        await trx.raw(
            `
            INSERT INTO dashboard_tile_charts (dashboard_version_id, dashboard_tile_uuid, saved_chart_id)
            SELECT dashboard_version_id, dashboard_tile_uuid, NULL
            FROM dashboard_tiles WHERE dashboard_version_id = ?
        `,
            [version.dashboard_version_id],
        );

        const result = await model.duplicateContent(
            source.project_uuid,
            preview.project_uuid,
            [{ uuid: space.space_uuid }],
        );
        expect(result.spaceMapping).toEqual([
            {
                sourceSpaceUuid: space.space_uuid,
                previewSpaceUuid: expect.any(String),
            },
        ]);
        const copiedDashboard = await trx('dashboards')
            .where('project_uuid', preview.project_uuid)
            .first();
        expect(copiedDashboard).toBeDefined();
        const copiedVersion = await trx('dashboard_versions')
            .where('dashboard_id', copiedDashboard!.dashboard_id)
            .first();
        expect(copiedVersion).toBeDefined();
        expect(copiedVersion!.dashboard_version_id).not.toBe(
            version.dashboard_version_id,
        );
        const copiedTiles = await trx('dashboard_tiles').where(
            'dashboard_version_id',
            copiedVersion!.dashboard_version_id,
        );
        const copiedContent = await trx('dashboard_tile_charts').where(
            'dashboard_version_id',
            copiedVersion!.dashboard_version_id,
        );
        expect(copiedTiles).toHaveLength(65535);
        expect(copiedContent).toHaveLength(65535);
        expect(
            new Set(copiedContent.map((tile) => tile.dashboard_tile_uuid)),
        ).toEqual(new Set(copiedTiles.map((tile) => tile.dashboard_tile_uuid)));
        expect(
            await trx('dashboard_tile_charts')
                .where('dashboard_version_id', version.dashboard_version_id)
                .count('* as count')
                .first(),
        ).toEqual({ count: 65535n });
    });

    test.each(['chart', 'dashboard'] as const)(
        'copies only mapped %s aliases with more than 65,535 UUIDs',
        async (kind) => {
            const { source, preview, space, model } = await createFixture();
            const [previewSpace] = await trx('spaces')
                .insert({
                    name: 'Preview space',
                    slug: 'preview-space',
                    path: 'preview_space',
                    project_id: preview.project_id,
                    parent_space_uuid: null,
                    inherit_parent_permissions: true,
                    is_default_user_space: false,
                })
                .returning('*');
            const sourceUuid = randomUUID();
            const previewUuid = randomUUID();
            const excludedUuid = randomUUID();
            const aliasTable =
                kind === 'chart'
                    ? 'saved_query_slug_mappings'
                    : 'dashboard_slug_mappings';
            const uuidColumn =
                kind === 'chart' ? 'saved_query_uuid' : 'dashboard_uuid';
            const content = [
                {
                    uuid: sourceUuid,
                    project: source.project_uuid,
                    slug: 'mapped',
                },
                {
                    uuid: excludedUuid,
                    project: source.project_uuid,
                    slug: 'excluded',
                },
                {
                    uuid: previewUuid,
                    project: preview.project_uuid,
                    slug: 'mapped',
                },
            ];
            // The query needs a large mapping list, not 65,536 persisted aliases.
            const mappings = [
                { sourceUuid, previewUuid },
                ...Array.from({ length: 65535 }, () => ({
                    sourceUuid: randomUUID(),
                    previewUuid: randomUUID(),
                })),
            ];
            if (kind === 'chart') {
                await trx<DbSavedChart>('saved_queries').insert(
                    content.map((row) => ({
                        saved_query_uuid: row.uuid,
                        project_uuid: row.project,
                        space_id:
                            row.project === source.project_uuid
                                ? space.space_id
                                : previewSpace.space_id,
                        dashboard_uuid: null,
                        name: row.slug,
                        slug: row.slug,
                        description: undefined,
                        last_version_chart_kind: ChartKind.VERTICAL_BAR,
                        last_version_updated_by_user_uuid: undefined,
                        color_palette_uuid: null,
                    })),
                );
            } else {
                await trx<DbDashboard>('dashboards').insert(
                    content.map((row) => ({
                        dashboard_uuid: row.uuid,
                        project_uuid: row.project,
                        space_id:
                            row.project === source.project_uuid
                                ? space.space_id
                                : previewSpace.space_id,
                        name: row.slug,
                        slug: row.slug,
                    })),
                );
            }
            if (kind === 'chart') {
                await trx('saved_query_slug_mappings').insert([
                    {
                        project_uuid: source.project_uuid,
                        saved_query_uuid: sourceUuid,
                        slug: 'old-name',
                    },
                    {
                        project_uuid: source.project_uuid,
                        saved_query_uuid: excludedUuid,
                        slug: 'not-copied',
                    },
                ]);
                await model.copyChartSlugMappingsToPreview(
                    trx,
                    source.project_uuid,
                    preview.project_uuid,
                    mappings.map((mapping) => ({
                        sourceChartUuid: mapping.sourceUuid,
                        previewChartUuid: mapping.previewUuid,
                    })),
                );
            } else {
                await trx('dashboard_slug_mappings').insert([
                    {
                        project_uuid: source.project_uuid,
                        dashboard_uuid: sourceUuid,
                        slug: 'old-name',
                    },
                    {
                        project_uuid: source.project_uuid,
                        dashboard_uuid: excludedUuid,
                        slug: 'not-copied',
                    },
                ]);
                await model.copyDashboardSlugMappingsToPreview(
                    trx,
                    source.project_uuid,
                    preview.project_uuid,
                    mappings.map((mapping) => ({
                        sourceDashboardUuid: mapping.sourceUuid,
                        previewDashboardUuid: mapping.previewUuid,
                    })),
                );
            }
            expect(
                await trx(aliasTable)
                    .where('project_uuid', preview.project_uuid)
                    .select(uuidColumn, 'slug'),
            ).toEqual([{ [uuidColumn]: previewUuid, slug: 'old-name' }]);
        },
    );
});
