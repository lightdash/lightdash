import {
    ConflictError,
    convertExplores,
    DEFAULT_SPOTLIGHT_CONFIG,
    DimensionType,
    getItemId,
    InlineErrorType,
    isExploreError,
    ProjectType,
    SupportedDbtAdapter,
    SupportedDbtVersions,
    type DbtModelNode,
    type Explore,
    type ExploreError,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { rewriteAllocatedExplore } from '../../../models/ProjectModel/allocatedExploreReferences';
import {
    allocateStagedExploreNames,
    type ExploreNaming,
} from '../../../models/ProjectModel/exploreNameAllocation';
import { validateExplorePublication } from '../../../models/ProjectModel/explorePublication';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import {
    bigqueryClientMock,
    warehouseClientMock,
} from '../../../utils/QueryBuilder/MetricQueryBuilder.mock';

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
            [false, true].flatMap((legacyOwners) =>
                (['refresh', 'deploy'] as const).map((mode) => ({
                    versions,
                    additional,
                    legacyOwners,
                    mode,
                })),
            ),
        ),
    ),
)(
    'keeps versioned qualified joins and persisted allocation consistent across refreshes: %j',
    async ({ versions, additional, legacyOwners, mode }) => {
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
        const orders =
            mode === 'deploy'
                ? node(
                      'fct_orders',
                      'pkg_b',
                      'shared_dimensions',
                      source.project_dbt_source_uuid,
                  )
                : node('fct_orders', 'pkg_a', 'analytics', primaryUuid);
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
                if (mode === 'deploy')
                    compiled.forEach((explore) => {
                        const joined = explore.tables?.calendar;
                        if (joined)
                            joined.dbtModelUniqueId = `${calendarId}.v1`;
                    });
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
                            mode,
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
                    if (legacyOwners)
                        expect(
                            await trx('explore_name_allocations').where({
                                project_uuid: project.project_uuid,
                                name: 'dim_calendar',
                            }),
                        ).toHaveLength(0);
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

test('maps lineage of every model to allocated names when the project has no extra dbt sources', async () => {
    const organization = await database('organizations').first();
    if (!organization) throw new Error('Missing fixture organization');
    const [project] = await database('projects')
        .insert({
            name: 'Lineage fast path fixture',
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
    const node = (name: string, parents: string[]): DbtModelNode => ({
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
        depends_on: {
            nodes: parents.map((parent) => `model.jaffle.${parent}`),
        },
        patch_path: null,
        name,
        alias: name,
        unique_id: `model.jaffle.${name}`,
        package_name: 'jaffle',
        path: `${name}.sql`,
        original_file_path: `models/${name}.sql`,
        lightdash_source_name: 'analytics',
        lightdash_source_uuid: primaryUuid,
        relation_name: name,
        columns: {
            id: { name: 'id', data_type: DimensionType.NUMBER, meta: {} },
        },
        meta: {},
    });
    const models = [
        node('stg_orders', []),
        node('fct_orders', ['stg_orders']),
        node('rpt_revenue', ['fct_orders']),
        node('dim_customers', []),
    ];
    try {
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
                    })),
                    refreshedSourceUuids: [primaryUuid],
                    warnings: [],
                },
            );
            expect(
                result.explores
                    .map((explore) => validateExplorePublication(explore))
                    .filter(isExploreError)
                    .map(({ errors }) => errors[0].message),
            ).toEqual([]);
            const orders = result.explores.find(
                ({ name }) => name === 'fct_orders',
            ) as Explore;
            expect(orders.tables.fct_orders.lineageGraph).toEqual({
                stg_orders: [],
                fct_orders: [{ type: 'model', name: 'stg_orders' }],
                rpt_revenue: [{ type: 'model', name: 'fct_orders' }],
            });
        });
    } finally {
        await database('projects')
            .where('project_uuid', project.project_uuid)
            .delete();
    }
});

const createLineageProject = async () => {
    const organization = await database('organizations').first();
    if (!organization) throw new Error('Missing fixture organization');
    const [project] = await database('projects')
        .insert({
            name: 'Lineage fast path fixture',
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
    await database('projects')
        .where('project_uuid', project.project_uuid)
        .update({ dbt_source_name: 'analytics' });
    return {
        projectUuid: project.project_uuid,
        primaryUuid: project.dbt_source_uuid ?? project.project_uuid,
    };
};

const lineageModel = (
    primaryUuid: string,
    name: string,
    parents: string[],
    meta: DbtModelNode['meta'] = {},
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
    depends_on: { nodes: parents.map((parent) => `model.jaffle.${parent}`) },
    patch_path: null,
    name,
    alias: name,
    unique_id: `model.jaffle.${name}`,
    package_name: 'jaffle',
    path: `${name}.sql`,
    original_file_path: `models/${name}.sql`,
    lightdash_source_name: 'analytics',
    lightdash_source_uuid: primaryUuid,
    relation_name: name,
    columns: {
        id: { name: 'id', data_type: DimensionType.NUMBER, meta: {} },
    },
    meta,
});

const allocateLineageExplores = async (
    projectUuid: string,
    compiled: (Explore | ExploreError)[],
    naming: ExploreNaming,
) =>
    database.transaction(async (trx) => {
        const saveUuid = randomUUID();
        await trx('cached_explore_staging').insert(
            compiled.map((explore) => ({
                project_uuid: projectUuid,
                save_uuid: saveUuid,
                name: explore.name,
                table_names: Object.keys(explore.tables ?? {}),
                explore: JSON.stringify(explore),
            })),
        );
        return allocateStagedExploreNames(trx, projectUuid, saveUuid, naming);
    });

const publicationErrors = (explores: (Explore | ExploreError)[]) =>
    explores
        .map((explore) => validateExplorePublication(explore))
        .filter(isExploreError)
        .map(({ errors }) => errors[0].message);

test('maps lineage of joined and downstream models when the project has no extra dbt sources', async () => {
    const { projectUuid, primaryUuid } = await createLineageProject();
    const models = [
        lineageModel(primaryUuid, 'stg_orders', []),
        lineageModel(primaryUuid, 'dim_customers', []),
        lineageModel(
            primaryUuid,
            'fct_orders',
            ['stg_orders', 'dim_customers'],
            {
                joins: [
                    {
                        join: 'dim_customers',
                        sql_on: '${fct_orders.id} = ${dim_customers.id}',
                    },
                ],
            },
        ),
        lineageModel(primaryUuid, 'rpt_revenue', ['fct_orders']),
    ];
    try {
        const compiled = await convertExplores(
            structuredClone(models),
            false,
            SupportedDbtAdapter.POSTGRES,
            warehouseClientMock,
            { spotlight: DEFAULT_SPOTLIGHT_CONFIG },
            { deferExploreNaming: true, allowPartialCompilation: true },
        );
        const result = await allocateLineageExplores(projectUuid, compiled, {
            mode: 'refresh',
            models: models.map((model) => ({
                sourceUuid: model.lightdash_source_uuid ?? null,
                sourceName: model.lightdash_source_name ?? null,
                packageName: model.package_name,
                uniqueId: model.unique_id,
                modelName: model.name,
            })),
            refreshedSourceUuids: [primaryUuid],
            warnings: [],
        });
        expect(publicationErrors(result.explores)).toEqual([]);
        const orders = result.explores.find(
            ({ name }) => name === 'fct_orders',
        ) as Explore;
        expect(Object.keys(orders.tables).sort()).toEqual([
            'dim_customers',
            'fct_orders',
        ]);
        const ordersParents = [
            { type: 'model', name: 'stg_orders' },
            { type: 'model', name: 'dim_customers' },
        ];
        expect(orders.tables.fct_orders.lineageGraph).toEqual({
            stg_orders: [],
            dim_customers: [],
            fct_orders: ordersParents,
            rpt_revenue: [{ type: 'model', name: 'fct_orders' }],
        });
        expect(orders.tables.dim_customers.lineageGraph).toEqual({
            dim_customers: [],
            fct_orders: ordersParents,
            rpt_revenue: [{ type: 'model', name: 'fct_orders' }],
        });
    } finally {
        await database('projects').where('project_uuid', projectUuid).delete();
    }
});

test('leaves plain lineage unchanged in deploy mode when the project has no extra dbt sources', async () => {
    const { projectUuid, primaryUuid } = await createLineageProject();
    const models = [
        lineageModel(primaryUuid, 'stg_orders', []),
        lineageModel(primaryUuid, 'fct_orders', ['stg_orders']),
    ];
    try {
        const compiled = await convertExplores(
            structuredClone(models),
            false,
            SupportedDbtAdapter.POSTGRES,
            warehouseClientMock,
            { spotlight: DEFAULT_SPOTLIGHT_CONFIG },
            { allowPartialCompilation: true },
        );
        const result = await allocateLineageExplores(projectUuid, compiled, {
            mode: 'deploy',
            models: [],
            refreshedSourceUuids: [],
            warnings: [],
        });
        expect(publicationErrors(result.explores)).toEqual([]);
        const compiledOrders = compiled.find(
            ({ name }) => name === 'fct_orders',
        ) as Explore;
        const orders = result.explores.find(
            ({ name }) => name === 'fct_orders',
        ) as Explore;
        expect(orders.tables.fct_orders.lineageGraph).toEqual({
            stg_orders: [],
            fct_orders: [{ type: 'model', name: 'stg_orders' }],
        });
        expect(orders.tables.fct_orders.lineageGraph).toEqual(
            compiledOrders.tables.fct_orders.lineageGraph,
        );
    } finally {
        await database('projects').where('project_uuid', projectUuid).delete();
    }
});

const compileRepeatedColumnExplores = async (
    primaryUuid: string,
    sourceUuid: string,
    joined: boolean,
    collision: boolean,
) => {
    const orders = lineageModel(
        joined ? sourceUuid : primaryUuid,
        'orders',
        [],
    );
    orders.columns.items = {
        name: 'items',
        data_type: DimensionType.STRING,
        nested_shape: { repeated: true, record: false },
        meta: {},
    };
    if (joined) {
        orders.package_name = 'secondary';
        orders.unique_id = 'model.secondary.orders';
        orders.lightdash_source_name = 'secondary';
    }
    const models = [
        orders,
        ...(joined
            ? [
                  lineageModel(primaryUuid, 'reports', [], {
                      joins: [
                          {
                              join: 'secondary__orders',
                              alias: 'orders',
                              sql_on: '${reports.id} = ${orders.id}',
                          },
                      ],
                  }),
              ]
            : []),
        ...(collision
            ? [
                  {
                      ...lineageModel(
                          sourceUuid,
                          joined ? 'reports' : 'orders',
                          [],
                      ),
                      package_name: 'secondary',
                      unique_id: `model.secondary.${joined ? 'reports' : 'orders'}`,
                      lightdash_source_name: 'secondary',
                  },
              ]
            : []),
    ];
    return convertExplores(
        models,
        false,
        SupportedDbtAdapter.BIGQUERY,
        bigqueryClientMock,
        { spotlight: DEFAULT_SPOTLIGHT_CONFIG },
        {
            deferExploreNaming: collision,
            includeModelIdentity: true,
            allowPartialCompilation: true,
        },
    );
};

const createRepeatedColumnSource = async (projectUuid: string) => {
    const [source] = await database('project_dbt_sources')
        .insert({
            project_uuid: projectUuid,
            name: 'secondary',
            is_primary: false,
            precedence: 1,
            dbt_connection_type: null,
            dbt_connection: null,
            warehouse_database: null,
            warehouse_schema: null,
        })
        .returning('project_dbt_source_uuid');
    return source.project_dbt_source_uuid;
};

test.each([
    { joined: true, collision: false },
    { joined: true, collision: true },
    { joined: false, collision: false },
    { joined: false, collision: true },
])(
    'deploy allocation preserves repeated-column tables and rewrites parent references (joined $joined, collision $collision)',
    async ({ joined, collision }) => {
        const { projectUuid, primaryUuid } = await createLineageProject();
        try {
            const sourceUuid = await createRepeatedColumnSource(projectUuid);
            const compiled = await compileRepeatedColumnExplores(
                primaryUuid,
                sourceUuid,
                joined,
                collision,
            );
            expect(compiled.filter(isExploreError)).toEqual([]);
            const parentName = collision ? 'analytics__orders' : 'orders';
            const rootName = joined ? 'reports' : 'orders';
            const exploreName = collision ? `analytics__${rootName}` : rootName;
            const incoming = compiled.find(
                (explore) =>
                    explore.dbtModelIdentity?.sourceUuid === primaryUuid &&
                    explore.dbtModelIdentity?.modelName ===
                        (joined ? 'reports' : 'orders'),
            ) as Explore;
            const incomingNestedName = joined
                ? 'orders__items'
                : `${incoming.baseTable}__items`;
            const nestedName = joined
                ? 'orders__items'
                : `${parentName}__items`;
            expect(incoming.tables[incomingNestedName]).toMatchObject({
                name: incomingNestedName,
                dbtSourceUuid: joined ? sourceUuid : primaryUuid,
                nestedFrom: {
                    parentTable: joined ? 'orders' : incoming.baseTable,
                },
            });
            expect(
                incoming.tables[incomingNestedName].dbtModelUniqueId,
            ).toBeUndefined();
            const result = await allocateLineageExplores(
                projectUuid,
                compiled,
                {
                    mode: 'deploy',
                    models: [],
                    refreshedSourceUuids: [],
                    warnings: [],
                },
            );
            const allocated = result.explores.find(
                ({ name }) => name === exploreName,
            ) as Explore;
            expect(allocated).toBeDefined();
            expect(isExploreError(allocated)).toBe(false);
            expect(allocated.tables[nestedName]).toMatchObject({
                name: nestedName,
                nestedFrom: { parentTable: joined ? 'orders' : parentName },
            });
            expect(
                allocated.tables[nestedName].dbtModelUniqueId,
            ).toBeUndefined();
        } finally {
            await database('projects')
                .where('project_uuid', projectUuid)
                .delete();
        }
    },
);

test('deploy allocation rejects an unresolved joined dbt model with two sources', async () => {
    const { projectUuid, primaryUuid } = await createLineageProject();
    try {
        const sourceUuid = await createRepeatedColumnSource(projectUuid);
        const compiled = await compileRepeatedColumnExplores(
            primaryUuid,
            sourceUuid,
            true,
            false,
        );
        const reports = compiled.find(
            ({ name }) => name === 'reports',
        ) as Explore;
        delete reports.tables.orders__items;
        reports.tables.missing_orders = {
            ...reports.tables.orders,
            name: 'missing_orders',
            originalName: 'missing_orders',
            canonicalName: 'missing_orders',
            dbtModelUniqueId: 'model.secondary.missing_orders',
        };
        const allocation = allocateLineageExplores(projectUuid, compiled, {
            mode: 'deploy',
            models: [],
            refreshedSourceUuids: [],
            warnings: [],
        });
        await expect(allocation).rejects.toThrow(ConflictError);
        await expect(allocation).rejects.toThrow(
            'Cannot resolve joined model "missing_orders" in explore "reports": source "secondary" has no model with unique id "model.secondary.missing_orders". Deploy source "secondary" with that model first, or remove the join.',
        );
    } finally {
        await database('projects').where('project_uuid', projectUuid).delete();
    }
});

const unresolvedJoinedExplores = async (
    primaryUuid: string,
    sourceUuid: string,
) => {
    const compiled = await compileRepeatedColumnExplores(
        primaryUuid,
        sourceUuid,
        true,
        false,
    );
    const reports = compiled.find(({ name }) => name === 'reports') as Explore;
    delete reports.tables.orders__items;
    const renamed = rewriteAllocatedExplore(
        reports,
        new Map([['orders', 'missing_orders']]),
    );
    delete renamed.tables.missing_orders.originalName;
    delete renamed.tables.missing_orders.dbtModelUniqueId;
    delete renamed.tables.missing_orders.canonicalName;
    return compiled.map((explore) => (explore === reports ? renamed : explore));
};

const deployNaming = (): ExploreNaming => ({
    mode: 'deploy',
    models: [],
    refreshedSourceUuids: [],
    warnings: [],
});

test.each([
    { source: 'secondary', originalName: undefined },
    { source: 'secondary', originalName: 'missing_orders' },
    { source: 'unknown', originalName: undefined },
])(
    'deploy allocation warns once and keeps an unbound joined table from $source with originalName $originalName',
    async ({ source, originalName }) => {
        const { projectUuid, primaryUuid } = await createLineageProject();
        try {
            const sourceUuid = await createRepeatedColumnSource(projectUuid);
            const compiled = await unresolvedJoinedExplores(
                primaryUuid,
                sourceUuid,
            );
            const reports = compiled.find(
                ({ name }) => name === 'reports',
            ) as Explore;
            const table = reports.tables.missing_orders;
            if (originalName !== undefined) table.originalName = originalName;
            if (source === 'unknown') {
                table.dbtSourceUuid = randomUUID();
                table.canonicalName = 'missing_orders';
            }
            const uploaded = structuredClone(table);
            const result = await allocateLineageExplores(
                projectUuid,
                compiled,
                deployNaming(),
            );
            const allocated = result.explores.find(
                ({ name }) => name === 'reports',
            ) as Explore;
            expect(isExploreError(allocated)).toBe(false);
            expect(allocated.tables.missing_orders).toEqual(uploaded);
            const reason =
                source === 'unknown'
                    ? `source id "${table.dbtSourceUuid}" is not a source of this project`
                    : 'source "secondary" has no model "missing_orders"';
            const warning = `Joined table "missing_orders" in explore "reports" claims dbt source "${source === 'unknown' ? table.dbtSourceUuid : 'secondary'}", but ${reason}. The table keeps the name "missing_orders" and is not linked to a dbt model. If "missing_orders" is a dbt model, deploy the source that owns it and deploy again.`;
            expect(result.warnings).toEqual([warning]);
            expect(allocated.warnings).toEqual([
                { type: InlineErrorType.MISSING_TABLE, message: warning },
            ]);
            expect(
                await database('explore_name_allocations').where({
                    project_uuid: projectUuid,
                    model_name: 'missing_orders',
                }),
            ).toEqual([]);
        } finally {
            await database('projects')
                .where('project_uuid', projectUuid)
                .delete();
        }
    },
);

test('deploy allocation keeps unbound joined table keys and field ids across publishes', async () => {
    const { projectUuid, primaryUuid } = await createLineageProject();
    try {
        const sourceUuid = await createRepeatedColumnSource(projectUuid);
        const compiled = await unresolvedJoinedExplores(
            primaryUuid,
            sourceUuid,
        );
        const first = await allocateLineageExplores(
            projectUuid,
            structuredClone(compiled),
            deployNaming(),
        );
        await database('cached_explore').insert(
            first.explores.map((explore) => ({
                project_uuid: projectUuid,
                name: explore.name,
                table_names: Object.keys(explore.tables ?? {}),
                explore: JSON.stringify(explore),
            })),
        );
        const second = await allocateLineageExplores(
            projectUuid,
            structuredClone(compiled),
            deployNaming(),
        );
        const firstReports = first.explores.find(
            ({ name }) => name === 'reports',
        ) as Explore;
        const secondReports = second.explores.find(
            ({ name }) => name === 'reports',
        ) as Explore;
        expect(Object.keys(secondReports.tables)).toEqual(
            Object.keys(firstReports.tables),
        );
        expect(secondReports.tables.missing_orders).toEqual(
            firstReports.tables.missing_orders,
        );
        expect(
            Object.keys(firstReports.tables.missing_orders.dimensions),
        ).toContain('id');
        expect(
            getItemId(firstReports.tables.missing_orders.dimensions.id),
        ).toBe('missing_orders_id');
        expect(first.warnings).toHaveLength(1);
        expect(second.warnings).toEqual(first.warnings);
        expect(secondReports.warnings).toEqual(firstReports.warnings);
        expect(
            await database('explore_name_allocations').where({
                project_uuid: projectUuid,
                model_name: 'missing_orders',
            }),
        ).toEqual([]);
    } finally {
        await database('projects').where('project_uuid', projectUuid).delete();
    }
});

test('deploy allocation rejects ambiguous joined models and rolls back all deploy rows', async () => {
    const { projectUuid, primaryUuid } = await createLineageProject();
    try {
        const sourceUuid = await createRepeatedColumnSource(projectUuid);
        const compiled = await compileRepeatedColumnExplores(
            primaryUuid,
            sourceUuid,
            true,
            false,
        );
        const orders = compiled.find(
            ({ name }) => name === 'orders',
        ) as Explore;
        const reports = compiled.find(
            ({ name }) => name === 'reports',
        ) as Explore;
        delete reports.tables.orders.dbtModelUniqueId;
        delete reports.tables.orders.dbtPackageName;
        const duplicate = structuredClone(orders);
        duplicate.name = 'secondary_orders';
        duplicate.dbtModelIdentity = {
            ...orders.dbtModelIdentity!,
            packageName: 'analytics',
            uniqueId: 'model.analytics.orders',
        };
        compiled.push(duplicate);
        const allocation = allocateLineageExplores(
            projectUuid,
            compiled,
            deployNaming(),
        );
        await expect(allocation).rejects.toThrow(ConflictError);
        await expect(allocation).rejects.toThrow(
            'Cannot resolve joined model "orders" in explore "reports": 2 models match in source "secondary": "model.secondary.orders", "model.analytics.orders". Point the join at one model.',
        );
        const deployRows = await Promise.all(
            [
                'cached_explore',
                'explore_name_allocations',
                'cached_explore_staging',
            ].map((tableName) =>
                database(tableName).where('project_uuid', projectUuid),
            ),
        );
        expect(deployRows).toEqual([[], [], []]);
    } finally {
        await database('projects').where('project_uuid', projectUuid).delete();
    }
});

test('deploy allocation rejects a joined model that claims an unknown source', async () => {
    const { projectUuid, primaryUuid } = await createLineageProject();
    try {
        const sourceUuid = await createRepeatedColumnSource(projectUuid);
        const compiled = await compileRepeatedColumnExplores(
            primaryUuid,
            sourceUuid,
            true,
            false,
        );
        const reports = compiled.find(
            ({ name }) => name === 'reports',
        ) as Explore;
        const unknownUuid = randomUUID();
        reports.tables.orders.dbtSourceUuid = unknownUuid;
        const allocation = allocateLineageExplores(
            projectUuid,
            compiled,
            deployNaming(),
        );
        await expect(allocation).rejects.toThrow(ConflictError);
        await expect(allocation).rejects.toThrow(
            `Cannot resolve joined model "orders" in explore "reports": source id "${unknownUuid}" is not a source of this project. Project sources: "analytics", "secondary". Compile against this project and deploy again.`,
        );
    } finally {
        await database('projects').where('project_uuid', projectUuid).delete();
    }
});

test.each([
    { use: 'owned', keyInUse: false },
    { use: 'owned', keyInUse: true },
    { use: 'reserved', keyInUse: false },
    { use: 'reserved', keyInUse: true },
])(
    'deploy allocation rejects an unbound joined table with a newly $use name (key $keyInUse)',
    async ({ use, keyInUse }) => {
        const { projectUuid, primaryUuid } = await createLineageProject();
        try {
            const sourceUuid = await createRepeatedColumnSource(projectUuid);
            const compiled = await unresolvedJoinedExplores(
                primaryUuid,
                sourceUuid,
            );
            const reports = compiled.find(
                ({ name }) => name === 'reports',
            ) as Explore;
            reports.tables.missing_orders.canonicalName = 'orders';
            if (keyInUse) {
                const renamed = rewriteAllocatedExplore(
                    reports,
                    new Map([['missing_orders', 'orders']]),
                );
                renamed.tables.orders.originalName = 'missing_orders';
                renamed.tables.orders.canonicalName = 'missing_orders';
                compiled.splice(compiled.indexOf(reports), 1, renamed);
            }
            const orders = compiled.find(
                ({ name }) => name === 'orders',
            ) as Explore;
            const duplicate = structuredClone(orders);
            duplicate.name = 'analytics_orders';
            duplicate.dbtModelIdentity = {
                ...orders.dbtModelIdentity!,
                sourceUuid: primaryUuid,
                sourceName: 'analytics',
                uniqueId: 'model.jaffle.orders',
                packageName: 'jaffle',
            };
            duplicate.tables.orders.dbtSourceUuid = primaryUuid;
            duplicate.tables.orders.dbtSourceName = 'analytics';
            duplicate.tables.orders.dbtModelUniqueId = 'model.jaffle.orders';
            duplicate.tables.orders.dbtPackageName = 'jaffle';
            if (use === 'reserved') compiled.push(duplicate);
            else compiled.splice(compiled.indexOf(orders), 1, duplicate);
            const allocation = allocateLineageExplores(
                projectUuid,
                compiled,
                deployNaming(),
            );
            await expect(allocation).rejects.toThrow(ConflictError);
            await expect(allocation).rejects.toThrow(
                `Cannot resolve joined model "${keyInUse ? 'missing_orders' : 'orders'}" in explore "reports": name "orders" ${use === 'reserved' ? 'is reserved because of an unresolved collision' : 'is owned by model "orders" from source "analytics" (model.jaffle.orders)'}. Rename the join alias.`,
            );
        } finally {
            await database('projects')
                .where('project_uuid', projectUuid)
                .delete();
        }
    },
);

test('deploy allocation leaves unbound joined tables unchanged without extra sources or saved allocations', async () => {
    const { projectUuid, primaryUuid } = await createLineageProject();
    try {
        const compiled = await unresolvedJoinedExplores(
            primaryUuid,
            randomUUID(),
        );
        const reports = compiled.find(
            ({ name }) => name === 'reports',
        ) as Explore;
        const uploaded = structuredClone(reports.tables.missing_orders);
        const result = await allocateLineageExplores(
            projectUuid,
            compiled,
            deployNaming(),
        );
        const allocated = result.explores.find(
            ({ name }) => name === 'reports',
        ) as Explore;
        expect(allocated.tables.missing_orders).toEqual(uploaded);
        expect(result.warnings).toEqual([]);
        expect(allocated.warnings ?? []).toEqual([]);
    } finally {
        await database('projects').where('project_uuid', projectUuid).delete();
    }
});
