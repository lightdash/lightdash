import {
    convertExplores,
    DEFAULT_SPOTLIGHT_CONFIG,
    DimensionType,
    ProjectType,
    SupportedDbtAdapter,
    SupportedDbtVersions,
    type DbtModelNode,
    type Explore,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { rewriteAllocatedExplore } from '../../../models/ProjectModel/allocatedExploreReferences';
import { allocateStagedExploreNames } from '../../../models/ProjectModel/exploreNameAllocation';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { warehouseClientMock } from '../../../utils/QueryBuilder/MetricQueryBuilder.mock';

let migrated: MigratedDatabase;
let database: Knex;
beforeAll(async () => {
    migrated = await createMigratedDatabase();
    database = migrated.database;
    await database('organizations').insert({
        organization_name: 'Versioned allocation fixture',
    });
});
afterAll(async () => migrated?.destroy());

test.each(
    [
        [1, 2],
        [2, 1],
    ].flatMap((versions) =>
        [false, true].flatMap((additional) =>
            [false, true].map((legacyOwners) => ({
                versions,
                additional,
                legacyOwners,
            })),
        ),
    ),
)(
    'keeps versioned qualified joins and persisted allocation consistent across refreshes: %j',
    async ({ versions, additional, legacyOwners }) => {
        const organization = await database('organizations').first();
        if (!organization) throw new Error('Missing fixture organization');
        const [project] = await database('projects')
            .insert({
                name: 'Versioned join fixture',
                organization_id: organization.organization_id,
                project_type: ProjectType.DEFAULT,
                dbt_connection_type: null,
                dbt_connection: null,
                dbt_version: SupportedDbtVersions.V1_12,
                organization_warehouse_credentials_uuid: null,
                copied_from_project_uuid: null,
                created_by_user_uuid: null,
            })
            .returning(['project_uuid', 'dbt_source_uuid']);
        const primaryUuid = project.dbt_source_uuid ?? project.project_uuid;
        await database('projects')
            .where('project_uuid', project.project_uuid)
            .update({ dbt_source_name: 'analytics' });
        const [source] = await database('project_dbt_sources')
            .insert({
                project_uuid: project.project_uuid,
                name: 'shared_dimensions',
                is_primary: false,
                precedence: 1,
                dbt_connection_type: null,
                dbt_connection: null,
                warehouse_database: null,
                warehouse_schema: null,
            })
            .returning('project_dbt_source_uuid');
        const calendarId = 'model.pkg_b.dim_calendar';
        const node = (
            name: string,
            packageName: string,
            sourceName: string,
            sourceUuid: string,
        ): DbtModelNode => ({
            checksum: { name: '', checksum: '' },
            fqn: [],
            language: 'sql',
            raw_code: '',
            compiled: true,
            description: '',
            resource_type: 'model',
            database: 'analytics',
            schema: 'public',
            tags: [],
            depends_on: { nodes: [] },
            patch_path: null,
            name,
            alias: name,
            unique_id: `model.${packageName}.${name}`,
            package_name: packageName,
            path: `${name}.sql`,
            original_file_path: `models/${name}.sql`,
            lightdash_source_name: sourceName,
            lightdash_source_uuid: sourceUuid,
            relation_name: name,
            columns: {
                id: { name: 'id', data_type: DimensionType.NUMBER, meta: {} },
            },
            meta: {},
        });
        const orders = node('fct_orders', 'pkg_a', 'analytics', primaryUuid);
        const joins = [
            {
                join: 'shared_dimensions__dim_calendar',
                alias: 'calendar',
                sql_on: '${fct_orders.id} = ${calendar.id}',
            },
        ];
        orders.meta = additional
            ? { explores: { orders_trend: { joins } } }
            : { joins };
        const calendar = node(
            'dim_calendar',
            'pkg_b',
            'shared_dimensions',
            source.project_dbt_source_uuid,
        );
        const models = [
            orders,
            ...versions.map((version) => ({
                ...calendar,
                version,
                latest_version: 2,
                unique_id: `${calendarId}.v${version}`,
                relation_name: `calendar_v${version}`,
            })),
        ];
        try {
            if (legacyOwners)
                await database('explore_name_allocations').insert(
                    [1, 2].map((version) => ({
                        project_uuid: project.project_uuid,
                        name:
                            version === 1
                                ? 'dim_calendar'
                                : 'shared_dimensions__dim_calendar',
                        source_key: source.project_dbt_source_uuid,
                        source_name: 'shared_dimensions',
                        package_name: 'pkg_b',
                        model_unique_id: `${calendarId}.v${version}`,
                        model_name: 'dim_calendar',
                        is_reserved: false,
                    })),
                );
            if (legacyOwners) {
                const previous = await convertExplores(
                    structuredClone(models),
                    false,
                    SupportedDbtAdapter.POSTGRES,
                    warehouseClientMock,
                    { spotlight: DEFAULT_SPOTLIGHT_CONFIG },
                    { deferExploreNaming: true, allowPartialCompilation: true },
                );
                await database('cached_explore').insert(
                    [1, 2].map((version) => {
                        const explore = previous.find(
                            (item) =>
                                item.dbtModelIdentity?.uniqueId ===
                                `${calendarId}.v${version}`,
                        ) as Explore;
                        const restored = rewriteAllocatedExplore(
                            explore,
                            new Map([
                                [
                                    explore.name,
                                    version === 1
                                        ? 'dim_calendar'
                                        : 'shared_dimensions__dim_calendar',
                                ],
                            ]),
                        );
                        return {
                            project_uuid: project.project_uuid,
                            name: restored.name,
                            table_names: Object.keys(restored.tables ?? {}),
                            explore: JSON.stringify(restored),
                        };
                    }),
                );
            }
            await [1, 2, 3].reduce(async (previous) => {
                await previous;
                const compiled = await convertExplores(
                    structuredClone(models),
                    false,
                    SupportedDbtAdapter.POSTGRES,
                    warehouseClientMock,
                    { spotlight: DEFAULT_SPOTLIGHT_CONFIG },
                    { deferExploreNaming: true, allowPartialCompilation: true },
                );
                await database.transaction(async (trx) => {
                    const saveUuid = randomUUID();
                    await trx('cached_explore_staging').insert(
                        compiled.map((explore) => ({
                            project_uuid: project.project_uuid,
                            save_uuid: saveUuid,
                            name: explore.name,
                            table_names: Object.keys(explore.tables ?? {}),
                            explore: JSON.stringify(explore),
                        })),
                    );
                    const result = await allocateStagedExploreNames(
                        trx,
                        project.project_uuid,
                        saveUuid,
                        {
                            mode: 'refresh',
                            models: models.map((model) => ({
                                sourceUuid: model.lightdash_source_uuid ?? null,
                                sourceName: model.lightdash_source_name ?? null,
                                packageName: model.package_name,
                                uniqueId: model.unique_id,
                                modelName: model.name,
                                version: model.version,
                                latestVersion: model.latest_version,
                            })),
                            refreshedSourceUuids: [
                                primaryUuid,
                                source.project_dbt_source_uuid,
                            ],
                            warnings: [],
                        },
                    );
                    await trx('cached_explore')
                        .where('project_uuid', project.project_uuid)
                        .delete();
                    await trx('cached_explore').insert(
                        result.explores.map((explore) => ({
                            project_uuid: project.project_uuid,
                            name: explore.name,
                            table_names: Object.keys(explore.tables ?? {}),
                            explore: JSON.stringify(explore),
                        })),
                    );
                    await trx('cached_explore_staging')
                        .where({
                            project_uuid: project.project_uuid,
                            save_uuid: saveUuid,
                        })
                        .delete();
                    const allocated = await trx(
                        'explore_name_allocations',
                    ).where({
                        project_uuid: project.project_uuid,
                        model_name: 'dim_calendar',
                    });
                    expect(allocated).toHaveLength(1);
                    expect(allocated[0].model_unique_id).toBe(
                        `${calendarId}.v2`,
                    );
                    const explore = result.explores.find(
                        (item) =>
                            item.dbtModelIdentity?.modelName ===
                            (additional ? 'orders_trend' : 'fct_orders'),
                    ) as Explore;
                    expect(explore.tables.calendar.sqlTable).toContain(
                        'calendar_v2',
                    );
                });
            }, Promise.resolve());
        } finally {
            await database('projects')
                .where('project_uuid', project.project_uuid)
                .delete();
        }
    },
);
