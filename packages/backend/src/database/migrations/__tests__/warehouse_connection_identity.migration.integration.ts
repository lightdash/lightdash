import { Ability } from '@casl/ability';
import {
    ChartKind,
    ConflictError,
    NotFoundError,
    ParameterError,
    QueryExecutionContext,
    type AllVizChartConfig,
    type ExecuteAsyncQueryRequestParams,
    type PossibleAbilities,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { fromSession } from '../../../auth/account/account';
import { defaultSessionUser } from '../../../auth/account/account.mock';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { QueryHistoryModel } from '../../../models/QueryHistoryModel/QueryHistoryModel';
import { SavedSqlModel } from '../../../models/SavedSqlModel';
import {
    WarehouseConnectionIdentityModel,
    WarehouseConnectionMap,
} from '../../../models/WarehouseConnectionIdentityModel/WarehouseConnectionIdentityModel';
import { EncryptionUtil } from '../../../utils/EncryptionUtil/EncryptionUtil';
import {
    createMigratedTestDatabase,
    type MigratedTestDatabase,
} from './migratedTestDatabase';

const tableConfig = {
    type: ChartKind.TABLE,
    metadata: { version: 1 },
    columns: {},
} as unknown as AllVizChartConfig;

const unmappedMessage = (name: string) =>
    `The preview has no copy of connection '${name}'. Connections are matched by name, so renaming a connection on the upstream project or on the preview breaks this mapping.`;

type Project = {
    organizationId: number;
    organizationUuid: string;
    projectId: number;
    projectUuid: string;
    userUuid: string;
    spaceUuid: string;
    originalUuid: string;
    extraUuid: string;
};

describe('Multi runtime identity on the real schema', () => {
    let migrated: MigratedTestDatabase;
    let database: Knex;
    let identity: WarehouseConnectionIdentityModel;
    let savedSqlModel: SavedSqlModel;
    let queryHistoryModel: QueryHistoryModel;
    let projectModel: ProjectModel;

    beforeAll(async () => {
        migrated = await createMigratedTestDatabase('connection_identity');
        database = migrated.database;
        identity = new WarehouseConnectionIdentityModel({ database });
        savedSqlModel = new SavedSqlModel({
            database,
            lightdashConfig: lightdashConfigMock,
        });
        queryHistoryModel = new QueryHistoryModel({ database });
        projectModel = new ProjectModel({
            database,
            lightdashConfig: lightdashConfigMock,
            encryptionUtil: new EncryptionUtil({
                lightdashConfig: lightdashConfigMock,
            }),
        });
    }, 600000);

    afterAll(async () => {
        await migrated?.destroy();
    });

    const createOrganization = async () => {
        const [organization] = await database('organizations')
            .insert({ organization_name: 'Identity test' })
            .returning(['organization_id', 'organization_uuid']);
        return organization as {
            organization_id: number;
            organization_uuid: string;
        };
    };

    const insertExtra = async (
        projectUuid: string,
        name: string,
    ): Promise<string> =>
        (
            await database('warehouse_connections')
                .insert({
                    project_uuid: projectUuid,
                    is_original: false,
                    name,
                    warehouse_type: 'postgres',
                    encrypted_credentials: Buffer.from(`ciphertext-${name}`),
                })
                .returning('warehouse_connection_uuid')
        )[0].warehouse_connection_uuid;

    const createMultiProject = async (
        organization?: { organization_id: number; organization_uuid: string },
        extraName = 'Warehouse B',
    ): Promise<Project> => {
        const org = organization ?? (await createOrganization());
        const [user] = await database('users')
            .insert({ first_name: 'Test', last_name: 'User' } as never)
            .returning('user_uuid');
        const [project] = await database('projects')
            .insert({
                name: 'Identity project',
                organization_id: org.organization_id,
                connection_mode: 'multi',
            } as never)
            .returning(['project_id', 'project_uuid']);
        const [space] = await database('spaces')
            .insert({
                name: 'Space',
                project_id: project.project_id,
                slug: `space-${randomUUID()}`,
            } as never)
            .returning('space_uuid');
        const [original] = await database('warehouse_connections')
            .insert({
                project_uuid: project.project_uuid,
                is_original: true,
                name: 'Original',
            })
            .returning('warehouse_connection_uuid');
        const extraUuid = await insertExtra(project.project_uuid, extraName);
        return {
            organizationId: org.organization_id,
            organizationUuid: org.organization_uuid,
            projectId: project.project_id,
            projectUuid: project.project_uuid,
            userUuid: user.user_uuid,
            spaceUuid: space.space_uuid,
            originalUuid: original.warehouse_connection_uuid,
            extraUuid,
        };
    };

    const createSqlChart = (
        project: Project,
        binding?: { warehouseConnectionUuid: string | null },
    ) =>
        savedSqlModel.create(
            project.userUuid,
            project.projectUuid,
            {
                name: `Chart ${randomUUID()}`,
                description: null,
                sql: 'select 1',
                limit: 10,
                config: tableConfig,
                spaceUuid: project.spaceUuid,
            },
            binding === undefined
                ? undefined
                : { kind: 'connection', ...binding },
        );

    const versionBinding = async (savedSqlVersionUuid: string) =>
        (
            await database('saved_sql_versions')
                .where('saved_sql_version_uuid', savedSqlVersionUuid)
                .first('warehouse_connection_uuid')
        ).warehouse_connection_uuid as string | null;

    const accountFor = (project: Project) =>
        fromSession(
            {
                ...defaultSessionUser,
                userUuid: project.userUuid,
                organizationUuid: project.organizationUuid,
                ability: new Ability<PossibleAbilities>([]),
            },
            'session-cookie',
        );

    const createQuery = async (
        project: Project,
        binding?: { warehouseConnectionUuid: string | null },
    ) =>
        (
            await queryHistoryModel.create(
                accountFor(project),
                {
                    organizationUuid: project.organizationUuid,
                    projectUuid: project.projectUuid,
                    context: QueryExecutionContext.SQL_RUNNER,
                    compiledSql: 'select 1',
                    metricQuery: {
                        exploreName: '',
                        dimensions: [],
                        metrics: [],
                        filters: {},
                        sorts: [],
                        limit: 10,
                        tableCalculations: [],
                    },
                    fields: {},
                    requestParameters: {} as ExecuteAsyncQueryRequestParams,
                    usedParameters: null,
                    cacheKey: randomUUID(),
                    pivotConfiguration: null,
                    originalColumns: null,
                },
                binding,
            )
        ).queryUuid;

    const queryBinding = async (queryUuid: string) =>
        (
            await database('query_history')
                .where('query_uuid', queryUuid)
                .first('warehouse_connection_uuid')
        ).warehouse_connection_uuid as string | null;

    describe('SQL chart save bindings', () => {
        test('a multi save writes the extra connection on the new version', async () => {
            const project = await createMultiProject();

            const created = await createSqlChart(project, {
                warehouseConnectionUuid: project.extraUuid,
            });

            expect(await versionBinding(created.savedSqlVersionUuid)).toBe(
                project.extraUuid,
            );
        });

        test('a multi save on the original writes NULL, never the original row', async () => {
            const project = await createMultiProject();

            const created = await createSqlChart(project, {
                warehouseConnectionUuid: null,
            });

            expect(
                await versionBinding(created.savedSqlVersionUuid),
            ).toBeNull();
        });

        test('a save with no binding is main: the version stays NULL', async () => {
            const project = await createMultiProject();

            const created = await createSqlChart(project);

            expect(
                await versionBinding(created.savedSqlVersionUuid),
            ).toBeNull();
        });

        test('an update writes the binding on the new version and leaves older versions alone', async () => {
            const project = await createMultiProject();
            const created = await createSqlChart(project, {
                warehouseConnectionUuid: null,
            });

            const updated = await savedSqlModel.update(
                {
                    userUuid: project.userUuid,
                    savedSqlUuid: created.savedSqlUuid,
                    sqlChart: {
                        versionedData: {
                            sql: 'select 2',
                            limit: 10,
                            config: tableConfig,
                        },
                    },
                },
                {
                    kind: 'connection',
                    warehouseConnectionUuid: project.extraUuid,
                },
            );

            expect(await versionBinding(updated.savedSqlVersionUuid!)).toBe(
                project.extraUuid,
            );
            expect(
                await versionBinding(created.savedSqlVersionUuid),
            ).toBeNull();
        });

        test.each([
            ['an extra connection', true],
            ['the original', false],
        ] as const)(
            'an old-client update with no connection field keeps %s',
            async (_label, bound) => {
                const project = await createMultiProject();
                const created = await createSqlChart(project, {
                    warehouseConnectionUuid: bound ? project.extraUuid : null,
                });

                const updated = await savedSqlModel.update(
                    {
                        userUuid: project.userUuid,
                        savedSqlUuid: created.savedSqlUuid,
                        sqlChart: {
                            versionedData: {
                                sql: 'select 2',
                                limit: 10,
                                config: tableConfig,
                            },
                        },
                    },
                    { kind: 'latest' },
                );

                expect(await versionBinding(updated.savedSqlVersionUuid!)).toBe(
                    bound ? project.extraUuid : null,
                );
            },
        );

        test('an old-client update carries the latest version, not the first', async () => {
            const project = await createMultiProject();
            const created = await createSqlChart(project, {
                warehouseConnectionUuid: null,
            });
            const versionedData = {
                sql: 'select 2',
                limit: 10,
                config: tableConfig,
            };
            await savedSqlModel.update(
                {
                    userUuid: project.userUuid,
                    savedSqlUuid: created.savedSqlUuid,
                    sqlChart: { versionedData },
                },
                {
                    kind: 'connection',
                    warehouseConnectionUuid: project.extraUuid,
                },
            );

            const updated = await savedSqlModel.update(
                {
                    userUuid: project.userUuid,
                    savedSqlUuid: created.savedSqlUuid,
                    sqlChart: { versionedData },
                },
                { kind: 'latest' },
            );

            expect(await versionBinding(updated.savedSqlVersionUuid!)).toBe(
                project.extraUuid,
            );
        });

        test('an old-client update refuses a latest binding planted across projects', async () => {
            const project = await createMultiProject();
            const other = await createMultiProject();
            const created = await createSqlChart(project, {
                warehouseConnectionUuid: null,
            });
            await database('saved_sql_versions')
                .where('saved_sql_version_uuid', created.savedSqlVersionUuid)
                .update({
                    warehouse_connection_uuid: other.extraUuid,
                } as never);

            await expect(
                savedSqlModel.update(
                    {
                        userUuid: project.userUuid,
                        savedSqlUuid: created.savedSqlUuid,
                        sqlChart: {
                            versionedData: {
                                sql: 'select 2',
                                limit: 10,
                                config: tableConfig,
                            },
                        },
                    },
                    { kind: 'latest' },
                ),
            ).rejects.toThrow(ParameterError);
        });

        test('a binding to another project connection is refused and nothing is written', async () => {
            const project = await createMultiProject();
            const other = await createMultiProject();
            const before = await database('saved_sql')
                .where('project_uuid', project.projectUuid)
                .count<{ count: string }[]>({ count: '*' });

            await expect(
                createSqlChart(project, {
                    warehouseConnectionUuid: other.extraUuid,
                }),
            ).rejects.toThrow(ParameterError);

            const after = await database('saved_sql')
                .where('project_uuid', project.projectUuid)
                .count<{ count: string }[]>({ count: '*' });
            expect(after[0].count).toBe(before[0].count);
        });
    });

    describe('SQL chart binding on read (K11)', () => {
        test('reads the latest version binding', async () => {
            const project = await createMultiProject();
            const created = await createSqlChart(project, {
                warehouseConnectionUuid: null,
            });
            await savedSqlModel.update(
                {
                    userUuid: project.userUuid,
                    savedSqlUuid: created.savedSqlUuid,
                    sqlChart: {
                        versionedData: {
                            sql: 'select 2',
                            limit: 10,
                            config: tableConfig,
                        },
                    },
                },
                {
                    kind: 'connection',
                    warehouseConnectionUuid: project.extraUuid,
                },
            );

            await expect(
                identity.getSqlChartWarehouseConnectionUuid(
                    project.projectUuid,
                    created.savedSqlUuid,
                ),
            ).resolves.toBe(project.extraUuid);
        });

        test('reads NULL as the original', async () => {
            const project = await createMultiProject();
            const created = await createSqlChart(project, {
                warehouseConnectionUuid: null,
            });

            await expect(
                identity.getSqlChartWarehouseConnectionUuid(
                    project.projectUuid,
                    created.savedSqlUuid,
                ),
            ).resolves.toBeNull();
        });

        test('a binding planted across projects in saved_sql_versions is refused on read', async () => {
            const project = await createMultiProject();
            const other = await createMultiProject();
            const created = await createSqlChart(project, {
                warehouseConnectionUuid: null,
            });
            await database('saved_sql_versions')
                .where('saved_sql_version_uuid', created.savedSqlVersionUuid)
                .update({
                    warehouse_connection_uuid: other.extraUuid,
                } as never);

            await expect(
                identity.getSqlChartWarehouseConnectionUuid(
                    project.projectUuid,
                    created.savedSqlUuid,
                ),
            ).rejects.toThrow(new NotFoundError('Connection not found'));
        });

        test('a chart of another project is not found', async () => {
            const project = await createMultiProject();
            const other = await createMultiProject();
            const created = await createSqlChart(other, {
                warehouseConnectionUuid: null,
            });

            await expect(
                identity.getSqlChartWarehouseConnectionUuid(
                    project.projectUuid,
                    created.savedSqlUuid,
                ),
            ).rejects.toThrow(new NotFoundError('Saved sql not found'));
        });
    });

    describe('query history identity', () => {
        test('a multi query records its extra connection, and main records nothing', async () => {
            const project = await createMultiProject();

            const extraQuery = await createQuery(project, {
                warehouseConnectionUuid: project.extraUuid,
            });
            const originalQuery = await createQuery(project, {
                warehouseConnectionUuid: null,
            });
            const mainQuery = await createQuery(project);

            expect(await queryBinding(extraQuery)).toBe(project.extraUuid);
            expect(await queryBinding(originalQuery)).toBeNull();
            expect(await queryBinding(mainQuery)).toBeNull();
        });

        test('a query from before an extra connection was added still resolves to the original', async () => {
            const project = await createMultiProject();
            await database('warehouse_connections')
                .where('warehouse_connection_uuid', project.extraUuid)
                .delete();
            const earlierQuery = await createQuery(project);
            await insertExtra(project.projectUuid, 'Warehouse C');

            await expect(
                identity.getQueryWarehouseConnectionUuid(
                    project.projectUuid,
                    earlierQuery,
                ),
            ).resolves.toBeNull();
        });

        test('a query on a removed connection fails with the removed name (K10)', async () => {
            const project = await createMultiProject();
            const queryUuid = await createQuery(project, {
                warehouseConnectionUuid: project.extraUuid,
            });
            await database('warehouse_connections')
                .where('warehouse_connection_uuid', project.extraUuid)
                .delete();
            await database('project_connection_mode_events').insert({
                project_uuid: project.projectUuid,
                actor_user_uuid: project.userUuid,
                event: 'connection_removed',
                plan: JSON.stringify({
                    warehouseConnectionUuid: project.extraUuid,
                    name: 'Warehouse B',
                    warehouseType: 'postgres',
                }),
            });

            await expect(
                identity.getQueryWarehouseConnectionUuid(
                    project.projectUuid,
                    queryUuid,
                ),
            ).rejects.toThrow(
                new NotFoundError("Connection 'Warehouse B' was removed"),
            );
        });

        test('a query bound to another project connection is refused (K11)', async () => {
            const project = await createMultiProject();
            const other = await createMultiProject();
            const queryUuid = await createQuery(project);
            await database('query_history')
                .where('query_uuid', queryUuid)
                .update({
                    warehouse_connection_uuid: other.extraUuid,
                } as never);

            await expect(
                identity.getQueryWarehouseConnectionUuid(
                    project.projectUuid,
                    queryUuid,
                ),
            ).rejects.toThrow(new NotFoundError('Connection not found'));
        });

        test('a query of another project is not found', async () => {
            const project = await createMultiProject();
            const other = await createMultiProject();
            const queryUuid = await createQuery(other);

            await expect(
                identity.getQueryWarehouseConnectionUuid(
                    project.projectUuid,
                    queryUuid,
                ),
            ).rejects.toThrow(NotFoundError);
        });
    });

    describe('preview connection copy', () => {
        const createPreviewProject = async (
            upstream: Project,
            organizationId = upstream.organizationId,
        ) =>
            (
                await database('projects')
                    .insert({
                        name: 'Preview',
                        organization_id: organizationId,
                        project_type: 'PREVIEW',
                    } as never)
                    .returning('project_uuid')
            )[0].project_uuid as string;

        test('copies the original row and every extra with new uuids, and makes the preview multi', async () => {
            const upstream = await createMultiProject();
            const secondExtra = await insertExtra(
                upstream.projectUuid,
                'Warehouse C',
            );
            const previewUuid = await createPreviewProject(upstream);

            const map = await identity.copyConnectionsToPreview(
                upstream.projectUuid,
                previewUuid,
            );

            const copies = await database('warehouse_connections')
                .where('project_uuid', previewUuid)
                .orderBy('name')
                .select(
                    'warehouse_connection_uuid',
                    'is_original',
                    'name',
                    'encrypted_credentials',
                );
            expect(
                copies.map(({ is_original, name, encrypted_credentials }) => ({
                    is_original,
                    name,
                    ciphertext: encrypted_credentials?.toString() ?? null,
                })),
            ).toEqual([
                { is_original: true, name: 'Original', ciphertext: null },
                {
                    is_original: false,
                    name: 'Warehouse B',
                    ciphertext: 'ciphertext-Warehouse B',
                },
                {
                    is_original: false,
                    name: 'Warehouse C',
                    ciphertext: 'ciphertext-Warehouse C',
                },
            ]);
            const byName = new Map(
                copies.map((copy) => [
                    copy.name,
                    copy.warehouse_connection_uuid,
                ]),
            );
            expect(map.remap(upstream.extraUuid)).toBe(
                byName.get('Warehouse B'),
            );
            expect(map.remap(secondExtra)).toBe(byName.get('Warehouse C'));
            expect(map.remap(null)).toBeNull();
            expect(map.remap(upstream.extraUuid)).not.toBe(upstream.extraUuid);
            const preview = await database('projects')
                .where('project_uuid', previewUuid)
                .first('connection_mode');
            expect(preview.connection_mode).toBe('multi');
        });

        test('copies the organization credential link and the listing settings of each extra', async () => {
            const upstream = await createMultiProject();
            const [orgCredential] = await database(
                'organization_warehouse_credentials',
            )
                .insert({
                    organization_uuid: upstream.organizationUuid,
                    name: `Shared ${randomUUID()}`,
                    warehouse_type: 'postgres',
                    warehouse_connection: Buffer.from('org-ciphertext'),
                } as never)
                .returning('organization_warehouse_credentials_uuid');
            await database('warehouse_connections').insert({
                project_uuid: upstream.projectUuid,
                is_original: false,
                name: 'Shared warehouse',
                warehouse_type: 'postgres',
                organization_warehouse_credentials_uuid:
                    orgCredential.organization_warehouse_credentials_uuid,
                list_all_databases: true,
                additional_databases: ['finance', 'ledger'],
            });
            await database('warehouse_connections')
                .where('warehouse_connection_uuid', upstream.extraUuid)
                .update({
                    list_all_databases: false,
                    additional_databases: ['archive'],
                });
            const previewUuid = await createPreviewProject(upstream);

            await identity.copyConnectionsToPreview(
                upstream.projectUuid,
                previewUuid,
            );

            const settings = (projectUuid: string) =>
                database('warehouse_connections')
                    .where('project_uuid', projectUuid)
                    .where('is_original', false)
                    .orderBy('name')
                    .select(
                        'name',
                        'encrypted_credentials',
                        'organization_warehouse_credentials_uuid',
                        'list_all_databases',
                        'additional_databases',
                    );
            const copied = await settings(previewUuid);
            expect(copied).toEqual(await settings(upstream.projectUuid));
            expect(copied).toEqual([
                expect.objectContaining({
                    name: 'Shared warehouse',
                    encrypted_credentials: null,
                    organization_warehouse_credentials_uuid:
                        orgCredential.organization_warehouse_credentials_uuid,
                    list_all_databases: true,
                    additional_databases: ['finance', 'ledger'],
                }),
                expect.objectContaining({
                    name: 'Warehouse B',
                    organization_warehouse_credentials_uuid: null,
                    list_all_databases: false,
                    additional_databases: ['archive'],
                }),
            ]);
        });

        test('refuses a second copy into the same preview', async () => {
            const upstream = await createMultiProject();
            const previewUuid = await createPreviewProject(upstream);
            await identity.copyConnectionsToPreview(
                upstream.projectUuid,
                previewUuid,
            );

            await expect(
                identity.copyConnectionsToPreview(
                    upstream.projectUuid,
                    previewUuid,
                ),
            ).rejects.toThrow(ConflictError);
        });

        test('refuses a preview in another organization', async () => {
            const upstream = await createMultiProject();
            const otherOrganization = await createOrganization();
            const previewUuid = await createPreviewProject(
                upstream,
                otherOrganization.organization_id,
            );

            await expect(
                identity.copyConnectionsToPreview(
                    upstream.projectUuid,
                    previewUuid,
                ),
            ).rejects.toThrow(ParameterError);
            expect(
                await database('warehouse_connections')
                    .where('project_uuid', previewUuid)
                    .select('warehouse_connection_uuid'),
            ).toEqual([]);
        });

        test('the lifetime map matches extras by name and refuses a connection the preview lacks', async () => {
            const upstream = await createMultiProject();
            const previewUuid = await createPreviewProject(upstream);
            await identity.copyConnectionsToPreview(
                upstream.projectUuid,
                previewUuid,
            );
            const addedLater = await insertExtra(
                upstream.projectUuid,
                'Warehouse D',
            );

            const map = await identity.getPreviewConnectionMap(
                upstream.projectUuid,
                previewUuid,
            );

            const previewExtra = await database('warehouse_connections')
                .where('project_uuid', previewUuid)
                .where('name', 'Warehouse B')
                .first('warehouse_connection_uuid');
            expect(map.remap(upstream.extraUuid)).toBe(
                previewExtra.warehouse_connection_uuid,
            );
            expect(map.remap(null)).toBeNull();
            expect(() => map.remap(addedLater)).toThrow(
                new ParameterError(unmappedMessage('Warehouse D')),
            );
        });

        test.each(['upstream', 'preview'] as const)(
            'a rename on the %s side breaks the name mapping and the remap refuses, naming the connection',
            async (renamedSide) => {
                const upstream = await createMultiProject();
                const previewUuid = await createPreviewProject(upstream);
                await identity.copyConnectionsToPreview(
                    upstream.projectUuid,
                    previewUuid,
                );
                await database('warehouse_connections')
                    .where(
                        'project_uuid',
                        renamedSide === 'upstream'
                            ? upstream.projectUuid
                            : previewUuid,
                    )
                    .where('name', 'Warehouse B')
                    .update({ name: 'Warehouse B renamed' });

                const map = await identity.getPreviewConnectionMap(
                    upstream.projectUuid,
                    previewUuid,
                );

                expect(() => map.remap(upstream.extraUuid)).toThrow(
                    new ParameterError(
                        unmappedMessage(
                            renamedSide === 'upstream'
                                ? 'Warehouse B renamed'
                                : 'Warehouse B',
                        ),
                    ),
                );
                expect(map.remap(null)).toBeNull();
            },
        );

        test('copied connections keep the upstream creator, as main keeps the upstream author on copied content', async () => {
            const upstream = await createMultiProject();
            const previewUuid = await createPreviewProject(upstream);
            await database('warehouse_connections')
                .where('project_uuid', upstream.projectUuid)
                .update({ created_by_user_uuid: upstream.userUuid });

            await identity.copyConnectionsToPreview(
                upstream.projectUuid,
                previewUuid,
            );

            expect(
                await database('warehouse_connections')
                    .where('project_uuid', previewUuid)
                    .orderBy('name')
                    .select('name', 'created_by_user_uuid'),
            ).toEqual([
                { name: 'Original', created_by_user_uuid: upstream.userUuid },
                {
                    name: 'Warehouse B',
                    created_by_user_uuid: upstream.userUuid,
                },
            ]);
        });

        test('a single preview of a multi upstream maps nothing, so an extra binding is refused (A-4)', async () => {
            const upstream = await createMultiProject();
            const previewUuid = await createPreviewProject(upstream);

            const map = await identity.getPreviewConnectionMap(
                upstream.projectUuid,
                previewUuid,
            );

            expect(map.remap(null)).toBeNull();
            expect(() => map.remap(upstream.extraUuid)).toThrow(
                new ParameterError(unmappedMessage('Warehouse B')),
            );
        });
    });

    describe('content copy into a preview (preview matrix: content copy, A-3)', () => {
        const createPreviewOf = async (upstream: Project) =>
            (
                await database('projects')
                    .insert({
                        name: 'Preview',
                        organization_id: upstream.organizationId,
                        project_type: 'PREVIEW',
                    } as never)
                    .returning('project_uuid')
            )[0].project_uuid as string;

        const insertCachedExplore = (
            project: Project,
            name: string,
            type: 'virtual' | 'external_source',
            warehouseConnectionUuid: string | null,
        ) =>
            database('cached_explore').insert({
                project_uuid: project.projectUuid,
                name,
                table_names: [name],
                explore: JSON.stringify({ name, type }),
                warehouse_connection_uuid: warehouseConnectionUuid,
            } as never);

        const previewSqlChartBindings = async (previewProjectUuid: string) =>
            database('saved_sql_versions')
                .innerJoin(
                    'saved_sql',
                    'saved_sql.saved_sql_uuid',
                    'saved_sql_versions.saved_sql_uuid',
                )
                .where('saved_sql.project_uuid', previewProjectUuid)
                .orderBy('saved_sql.name')
                .select(
                    'saved_sql.name',
                    'saved_sql_versions.warehouse_connection_uuid',
                );

        const previewExploreBindings = async (previewProjectUuid: string) =>
            database('cached_explore')
                .where('project_uuid', previewProjectUuid)
                .orderBy('name')
                .select('name', 'warehouse_connection_uuid');

        test('every copied binding maps to the preview connection and NULL stays NULL', async () => {
            const upstream = await createMultiProject();
            const previewUuid = await createPreviewOf(upstream);
            const map = await identity.copyConnectionsToPreview(
                upstream.projectUuid,
                previewUuid,
            );
            const boundChart = await createSqlChart(upstream, {
                warehouseConnectionUuid: upstream.extraUuid,
            });
            const originalChart = await createSqlChart(upstream, {
                warehouseConnectionUuid: null,
            });
            await database('saved_sql')
                .where('saved_sql_uuid', boundChart.savedSqlUuid)
                .update({ name: 'bound chart' });
            await database('saved_sql')
                .where('saved_sql_uuid', originalChart.savedSqlUuid)
                .update({ name: 'original chart' });
            await insertCachedExplore(
                upstream,
                'bound_view',
                'virtual',
                upstream.extraUuid,
            );
            await insertCachedExplore(
                upstream,
                'original_view',
                'virtual',
                null,
            );
            await insertCachedExplore(
                upstream,
                'bound_external',
                'external_source',
                upstream.extraUuid,
            );
            const previewExtra = map.remap(upstream.extraUuid);

            await projectModel.duplicateContent(
                upstream.projectUuid,
                previewUuid,
                [{ uuid: upstream.spaceUuid }],
                map,
            );

            expect(await previewSqlChartBindings(previewUuid)).toEqual([
                {
                    name: 'bound chart',
                    warehouse_connection_uuid: previewExtra,
                },
                { name: 'original chart', warehouse_connection_uuid: null },
            ]);
            expect(await previewExploreBindings(previewUuid)).toEqual([
                {
                    name: 'bound_external',
                    warehouse_connection_uuid: previewExtra,
                },
                { name: 'bound_view', warehouse_connection_uuid: previewExtra },
                { name: 'original_view', warehouse_connection_uuid: null },
            ]);
        });

        test('an unmapped binding throws and copies nothing', async () => {
            const upstream = await createMultiProject();
            const previewUuid = await createPreviewOf(upstream);
            await identity.copyConnectionsToPreview(
                upstream.projectUuid,
                previewUuid,
            );
            const addedLater = await insertExtra(
                upstream.projectUuid,
                'Warehouse C',
            );
            await createSqlChart(upstream, {
                warehouseConnectionUuid: addedLater,
            });
            const map = await identity.getPreviewConnectionMap(
                upstream.projectUuid,
                previewUuid,
            );

            await expect(
                projectModel.duplicateContent(
                    upstream.projectUuid,
                    previewUuid,
                    [{ uuid: upstream.spaceUuid }],
                    map,
                ),
            ).rejects.toThrow(
                new ParameterError(unmappedMessage('Warehouse C')),
            );
            expect(await previewSqlChartBindings(previewUuid)).toEqual([]);
        });

        test('an unmapped virtual view binding throws', async () => {
            const upstream = await createMultiProject();
            const previewUuid = await createPreviewOf(upstream);
            await insertCachedExplore(
                upstream,
                'bound_view',
                'virtual',
                upstream.extraUuid,
            );
            const map = await identity.getPreviewConnectionMap(
                upstream.projectUuid,
                previewUuid,
            );

            await expect(
                projectModel.duplicateContent(
                    upstream.projectUuid,
                    previewUuid,
                    [{ uuid: upstream.spaceUuid }],
                    map,
                ),
            ).rejects.toThrow(
                new ParameterError(unmappedMessage('Warehouse B')),
            );
            expect(await previewExploreBindings(previewUuid)).toEqual([]);
        });

        test('without a map the copy is main: unbound content copies as it is', async () => {
            const upstream = await createMultiProject();
            const previewUuid = await createPreviewOf(upstream);
            await createSqlChart(upstream);
            await insertCachedExplore(
                upstream,
                'original_view',
                'virtual',
                null,
            );

            await projectModel.duplicateContent(
                upstream.projectUuid,
                previewUuid,
                [{ uuid: upstream.spaceUuid }],
                null,
            );

            expect(
                (await previewSqlChartBindings(previewUuid)).map(
                    (row) => row.warehouse_connection_uuid,
                ),
            ).toEqual([null]);
            expect(await previewExploreBindings(previewUuid)).toEqual([
                { name: 'original_view', warehouse_connection_uuid: null },
            ]);
        });
    });

    describe('explores with bindings', () => {
        test('reads each cached explore with its binding', async () => {
            const project = await createMultiProject();
            await database('cached_explore').insert([
                {
                    project_uuid: project.projectUuid,
                    name: 'orders',
                    table_names: ['orders'],
                    explore: JSON.stringify({ name: 'orders' }),
                    warehouse_connection_uuid: null,
                },
                {
                    project_uuid: project.projectUuid,
                    name: 'payments',
                    table_names: ['payments'],
                    explore: JSON.stringify({ name: 'payments' }),
                    warehouse_connection_uuid: project.extraUuid,
                },
            ] as never);

            await expect(
                identity.getExploresWithBindings(project.projectUuid),
            ).resolves.toEqual([
                {
                    explore: { name: 'orders' },
                    warehouseConnectionUuid: null,
                },
                {
                    explore: { name: 'payments' },
                    warehouseConnectionUuid: project.extraUuid,
                },
            ]);
        });
    });

    describe('WarehouseConnectionMap', () => {
        test('NULL stays NULL and an unknown uuid is refused', () => {
            const map = new WarehouseConnectionMap(
                new Map([['upstream', 'preview']]),
                new Map([['upstream', 'Warehouse B']]),
            );

            expect(map.remap(null)).toBeNull();
            expect(map.remap('upstream')).toBe('preview');
            expect(() => map.remap('unknown')).toThrow(ParameterError);
        });
    });
});
