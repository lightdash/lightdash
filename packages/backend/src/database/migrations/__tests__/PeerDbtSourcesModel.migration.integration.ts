import {
    ConflictError,
    DbtProjectType,
    defineUserAbility,
    ForbiddenError,
    NotFoundError,
    OrganizationMemberRole,
    ParameterError,
    ProjectMemberRole,
    type AddSharedDbtSource,
    type CreateProjectDbtSource,
    type DbtProjectConfig,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { fromSession } from '../../../auth/account/account';
import { defaultSessionUser } from '../../../auth/account/account.mock';
import Logger from '../../../logging/logger';
import {
    PeerDbtSourcesModel,
    type DbPeerDbtSource,
} from '../../../models/PeerDbtSourcesModel';
import { ProjectDbtSourcesModel } from '../../../models/ProjectDbtSourcesModel';
import { WarehouseConnectionCompileModel } from '../../../models/WarehouseConnectionCompileModel/WarehouseConnectionCompileModel';
import { PeerDbtSourcesService } from '../../../services/PeerDbtSourcesService';
import { ProjectDbtSourcesService } from '../../../services/ProjectDbtSourcesService';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { EncryptionUtil } from '../../../utils/EncryptionUtil/EncryptionUtil';
import * as peerOperation from '../../../utils/peerDbtSourcesOperation';

const secret = 'peer-model-synthetic-encryption-secret';
const encryptionUtil = new EncryptionUtil({
    lightdashConfig: {
        lightdashSecret: secret,
        lightdashSecrets: { active: secret, fallbacks: [], all: [secret] },
    },
});
const connection: DbtProjectConfig = {
    type: DbtProjectType.GITHUB,
    authorization_method: 'personal_access_token',
    repository: 'fixture/repository_a',
    branch: 'main',
    project_sub_path: '/',
    personal_access_token: 'synthetic-owner-token',
    environment: [{ key: 'FIXTURE_ENV', value: 'synthetic-environment-value' }],
};
const featureFlagModel = { get: vi.fn(async () => ({ enabled: true })) };
const setPeerEnabled = (enabled: boolean) => {
    featureFlagModel.get.mockResolvedValue({ enabled });
    vi.spyOn(peerOperation, 'getPeerDbtSourcesEnabled').mockReturnValue(
        enabled,
    );
};
let migrated: MigratedDatabase;
let database: Knex;
let model: PeerDbtSourcesModel;
let sources: ProjectDbtSourcesModel;
let organizationUuid: string;
let otherOrganizationUuid: string;
let projectA: string;
let projectB: string;
let otherProject: string;

const createProject = async (organizationId: number, name: string) => {
    const [row] = await database<{
        project_uuid: string;
        organization_id: number;
        name: string;
        dbt_connection_type: DbtProjectType;
        connection_mode: string;
    }>('projects')
        .insert({
            organization_id: organizationId,
            name,
            dbt_connection_type: DbtProjectType.NONE,
            connection_mode: 'multi',
        })
        .returning('project_uuid');
    return row.project_uuid as string;
};

const createSource = async (
    projectUuid: string,
    name = 'source_a',
    values: Pick<CreateProjectDbtSource, 'dbtProjectName'> = {},
) =>
    sources.createSource(projectUuid, {
        name,
        isPrimary: false,
        precedence: 1,
        dbtConnection: connection,
        warehouseLocation: { database: null, schema: null },
        ...values,
    });

const createWarehouse = async (projectUuid = projectA, isOriginal = false) => {
    const [row] = await database('warehouse_connections')
        .insert({
            project_uuid: projectUuid,
            name: `connection_${randomUUID()}`,
            warehouse_type: 'postgres',
            encrypted_credentials: Buffer.from(
                'synthetic-warehouse-credentials',
            ),
            is_original: isOriginal,
        })
        .returning('warehouse_connection_uuid');
    return row.warehouse_connection_uuid as string;
};

const createRepository = async ({
    isShared = true,
    actualName = 'actual_a',
    ownerProjectUuid = projectA,
    orgUuid = organizationUuid,
    credentialSourceUuid = null,
}: {
    isShared?: boolean;
    actualName?: string | null;
    ownerProjectUuid?: string;
    orgUuid?: string;
    credentialSourceUuid?: string | null;
} = {}) => {
    if (credentialSourceUuid !== null) {
        const source = await database<DbPeerDbtSource>('project_dbt_sources')
            .where('project_dbt_source_uuid', credentialSourceUuid)
            .first();
        if (!source?.dbt_repository_uuid)
            throw new Error('Missing registered source fixture');
        await database('dbt_repositories')
            .where('dbt_repository_uuid', source.dbt_repository_uuid)
            .update({
                dbt_project_name: actualName,
                is_shared: isShared,
            });
        return source.dbt_repository_uuid;
    }
    const owner = await database('projects')
        .where('project_uuid', ownerProjectUuid)
        .first();
    const uuid = randomUUID();
    if (!owner?.dbt_connection)
        await database('projects')
            .where('project_uuid', ownerProjectUuid)
            .update({
                dbt_connection_type: DbtProjectType.GITHUB,
                dbt_connection: encryptionUtil.encrypt(
                    JSON.stringify({
                        ...connection,
                        host_domain: 'git.example.test',
                        repository: `fixture/repository_${uuid}`,
                    }),
                ),
            });
    await database('dbt_repositories').insert({
        dbt_repository_uuid: uuid,
        organization_uuid: orgUuid,
        provider: 'github',
        host: owner?.dbt_connection ? 'github.com' : 'git.example.test',
        owner: 'fixture',
        name: owner?.dbt_connection ? 'repository_a' : `repository_${uuid}`,
        default_branch: 'main',
        dbt_project_name: actualName,
        created_by_project_uuid: ownerProjectUuid,
        credential_source_uuid: credentialSourceUuid,
        credential_project_uuid:
            credentialSourceUuid === null ? ownerProjectUuid : null,
        is_shared: isShared,
    });
    return uuid;
};

const sharedInput = (
    dbtRepositoryUuid: string,
    overrides: Partial<AddSharedDbtSource> = {},
): AddSharedDbtSource => ({
    dbtRepositoryUuid,
    name: 'source_b',
    warehouseConnectionUuid: null,
    membershipRole: 'publish',
    refreshPolicy: 'git_refresh',
    ...overrides,
});

const sourceRow = (uuid: string) =>
    database<DbPeerDbtSource>('project_dbt_sources')
        .where('project_dbt_source_uuid', uuid)
        .first()
        .then((row) => {
            if (!row) throw new Error('Missing source fixture');
            return row;
        });

const repositoryRow = (uuid: string) =>
    database('dbt_repositories').where('dbt_repository_uuid', uuid).first();

const pendingSource = async (
    projectUuid = projectA,
    overrides: Partial<DbPeerDbtSource> = {},
): Promise<string> => {
    const uuid = randomUUID();
    await database<DbPeerDbtSource>('project_dbt_sources').insert({
        project_dbt_source_uuid: uuid,
        project_uuid: projectUuid,
        name: `source_${uuid}`,
        is_primary: false,
        precedence: 1,
        dbt_connection_type: connection.type,
        dbt_connection: encryptionUtil.encrypt(JSON.stringify(connection)),
        warehouse_database: null,
        warehouse_schema: null,
        ...overrides,
    });
    return uuid;
};

const nameEvidence = (
    projectUuid: string,
    sourceUuid: string,
    name: string,
    group = 'original',
) =>
    database('dbt_source_ref_catalogs').insert({
        project_uuid: projectUuid,
        dbt_source_uuid: sourceUuid,
        project_name: name,
        connection_group: group,
        dbt_version: 'v1.9',
        status: 'confirmed',
        nodes: '[]',
        nodes_digest: 'synthetic-digest',
        compile_job_uuid: null,
    });

const expectNameConflict = async (
    operation: Promise<unknown>,
    sourceName = 'source_a',
) => {
    await expect(operation).rejects.toBeInstanceOf(ConflictError);
    await expect(operation).rejects.toMatchObject({
        message: expect.stringContaining(`Source "${sourceName}"`),
    });
};

beforeAll(async () => {
    migrated = await createMigratedDatabase(undefined, { min: 0, max: 5 });
    database = migrated.database;
});

beforeEach(async () => {
    featureFlagModel.get.mockReset();
    setPeerEnabled(true);
    model = new PeerDbtSourcesModel({
        database,
        encryptionUtil,
    });
    sources = new ProjectDbtSourcesModel({
        database,
        encryptionUtil,
    });
    const [organization] = await database('organizations')
        .insert({ organization_name: 'organization_a' })
        .returning(['organization_id', 'organization_uuid']);
    const [otherOrganization] = await database('organizations')
        .insert({ organization_name: 'organization_b' })
        .returning(['organization_id', 'organization_uuid']);
    organizationUuid = organization.organization_uuid;
    otherOrganizationUuid = otherOrganization.organization_uuid;
    projectA = await createProject(organization!.organization_id, 'project_a');
    projectB = await createProject(organization!.organization_id, 'project_b');
    otherProject = await createProject(
        otherOrganization.organization_id,
        'project_c',
    );
});

afterEach(async () => {
    vi.restoreAllMocks();
    await database('organizations')
        .whereIn('organization_uuid', [organizationUuid, otherOrganizationUuid])
        .delete();
});

afterAll(async () => migrated?.destroy());

describe('PeerDbtSourcesModel on the migrated schema', () => {
    test('does not store synthetic primary sources while primary peer rollout is pending', async () => {
        expect(await sources.getSources(projectA)).toEqual([]);
        expect(await model.getSettings(projectA)).toEqual(new Map());
        expect(await sources.hasSources(projectA)).toBe(false);
    });

    test('creates independent source labels and learns normalized actual names without changing the labels', async () => {
        const source = await createSource(projectA);
        await model.learnProjectName(
            projectA,
            source.projectDbtSourceUuid,
            '  Actual_A  ',
        );
        expect(await sourceRow(source.projectDbtSourceUuid)).toMatchObject({
            name: 'source_a',
            dbt_project_name: 'actual_a',
            is_primary: false,
        });
        expect(featureFlagModel.get).not.toHaveBeenCalled();
    });

    test('createSource rejects a known repository actual-name collision and leaves no partial source', async () => {
        const first = await createSource(projectA);
        await model.updatePeer(projectA, first.projectDbtSourceUuid, {
            dbtProjectName: 'ACTUAL_A',
        });
        const registered = await sourceRow(first.projectDbtSourceUuid);
        expect(registered.dbt_repository_uuid).not.toBeNull();
        await database('dbt_repositories')
            .where('dbt_repository_uuid', registered.dbt_repository_uuid)
            .update({ dbt_project_name: 'actual_a' });
        await expectNameConflict(createSource(projectA, 'source_b'));
        expect(await sources.getSources(projectA)).toHaveLength(1);
    });

    test('createSource can use a known repository actual name in another project', async () => {
        const first = await createSource(projectA);
        const registered = await sourceRow(first.projectDbtSourceUuid);
        expect(registered.dbt_repository_uuid).not.toBeNull();
        await database('dbt_repositories')
            .where('dbt_repository_uuid', registered.dbt_repository_uuid)
            .update({ dbt_project_name: 'actual_a' });
        const added = await createSource(projectB);
        expect(await sourceRow(added.projectDbtSourceUuid)).toMatchObject({
            dbt_project_name: 'actual_a',
            dbt_repository_uuid: registered.dbt_repository_uuid,
            warehouse_connection_uuid: null,
        });
    });

    test('createSource normalizes an explicit actual name and rejects a duplicate without a partial insert', async () => {
        const first = await createSource(projectA, 'source_a', {
            dbtProjectName: '  Actual_A  ',
        });
        expect(await sourceRow(first.projectDbtSourceUuid)).toMatchObject({
            dbt_project_name: 'actual_a',
        });
        await expectNameConflict(
            createSource(projectA, 'source_b', { dbtProjectName: 'ACTUAL_A' }),
        );
        expect(await sources.getSources(projectA)).toHaveLength(1);
    });

    test.each(['updatePeer', 'learnProjectName'] as const)(
        '%s rejects a case-insensitive actual-name collision on the null connection and names the existing source',
        async (method) => {
            const first = await createSource(projectA);
            const second = await createSource(projectA, 'source_b');
            await model.updatePeer(projectA, first.projectDbtSourceUuid, {
                dbtProjectName: 'Actual_A',
            });
            const operation =
                method === 'updatePeer'
                    ? model.updatePeer(projectA, second.projectDbtSourceUuid, {
                          dbtProjectName: ' ACTUAL_A ',
                      })
                    : model.learnProjectName(
                          projectA,
                          second.projectDbtSourceUuid,
                          ' ACTUAL_A ',
                      );
            await expectNameConflict(operation);
            expect(
                (await sourceRow(second.projectDbtSourceUuid)).dbt_project_name,
            ).toBeNull();
        },
    );

    test.each(['updatePeer', 'learnProjectName'] as const)(
        '%s allows the same actual name on a different warehouse connection',
        async (method) => {
            const first = await createSource(projectA);
            const second = await createSource(projectA, 'source_b');
            const warehouse = await createWarehouse();
            await new WarehouseConnectionCompileModel({
                database,
            }).bindDbtSource(projectA, second.projectDbtSourceUuid, warehouse);
            await model.updatePeer(projectA, first.projectDbtSourceUuid, {
                dbtProjectName: 'actual_a',
            });
            if (method === 'updatePeer') {
                await model.updatePeer(projectA, second.projectDbtSourceUuid, {
                    dbtProjectName: 'ACTUAL_A',
                });
            } else {
                await model.learnProjectName(
                    projectA,
                    second.projectDbtSourceUuid,
                    'ACTUAL_A',
                );
            }
            expect(await sourceRow(second.projectDbtSourceUuid)).toMatchObject({
                dbt_project_name: 'actual_a',
                warehouse_connection_uuid: warehouse,
            });
        },
    );

    test.each(['updatePeer', 'learnProjectName'] as const)(
        '%s rejects the same actual name on the same explicit warehouse connection',
        async (method) => {
            const first = await createSource(projectA);
            const second = await createSource(projectA, 'source_b');
            const warehouse = await createWarehouse();
            const bindings = new WarehouseConnectionCompileModel({ database });
            await bindings.bindDbtSource(
                projectA,
                first.projectDbtSourceUuid,
                warehouse,
            );
            await bindings.bindDbtSource(
                projectA,
                second.projectDbtSourceUuid,
                warehouse,
            );
            await model.updatePeer(projectA, first.projectDbtSourceUuid, {
                dbtProjectName: 'Actual_A',
            });
            const operation =
                method === 'updatePeer'
                    ? model.updatePeer(projectA, second.projectDbtSourceUuid, {
                          dbtProjectName: 'ACTUAL_A',
                      })
                    : model.learnProjectName(
                          projectA,
                          second.projectDbtSourceUuid,
                          'ACTUAL_A',
                      );
            await expectNameConflict(operation);
        },
    );

    test('does not learn names with the frozen operation flag disabled', async () => {
        const source = await createSource(projectA);
        featureFlagModel.get.mockClear();
        setPeerEnabled(false);
        await model.learnProjectName(
            projectA,
            source.projectDbtSourceUuid,
            'actual_a',
        );
        expect(
            (await sourceRow(source.projectDbtSourceUuid)).dbt_project_name,
        ).toBeNull();
        expect(featureFlagModel.get).not.toHaveBeenCalled();
    });

    test('rejects renaming a source from another project and preserves both rows', async () => {
        const source = await createSource(projectA);
        await expect(
            model.updatePeer(projectB, source.projectDbtSourceUuid, {
                dbtProjectName: 'actual_a',
            }),
        ).rejects.toThrow(NotFoundError);
        expect(
            (await sourceRow(source.projectDbtSourceUuid)).dbt_project_name,
        ).toBeNull();
    });

    test('clears actual-name conflict evidence after a successful explicit name update', async () => {
        const source = await createSource(projectA);
        await database<DbPeerDbtSource>('project_dbt_sources')
            .where('project_dbt_source_uuid', source.projectDbtSourceUuid)
            .update({ dbt_project_name_conflict: 'old_a' });
        await model.updatePeer(projectA, source.projectDbtSourceUuid, {
            dbtProjectName: 'new_a',
            membershipRole: 'dependency_only',
            refreshPolicy: 'ci_managed',
        });
        expect(await sourceRow(source.projectDbtSourceUuid)).toMatchObject({
            dbt_project_name: 'new_a',
            dbt_project_name_conflict: null,
            membership_role: 'dependency_only',
            refresh_policy: 'ci_managed',
        });
    });

    test('adds a shared source in the same organization without copying credentials', async () => {
        const owner = await createSource(projectA);
        const repository = await createRepository({
            credentialSourceUuid: owner.projectDbtSourceUuid,
        });
        const added = await model.addShared(
            organizationUuid,
            projectB,
            sharedInput(repository),
        );
        expect(await sourceRow(added)).toMatchObject({
            project_uuid: projectB,
            dbt_repository_uuid: repository,
            dbt_project_name: 'actual_a',
            dbt_connection: null,
            warehouse_connection_uuid: null,
            is_primary: false,
        });
        expect(await model.resolveConnection(projectB, repository)).toEqual(
            connection,
        );
        const changed = {
            ...connection,
            personal_access_token: 'synthetic-rotated-owner-token',
        };
        await sources.updateSource(owner.projectDbtSourceUuid, {
            dbtConnection: changed,
        });
        expect(await model.resolveConnection(projectB, repository)).toEqual(
            changed,
        );
        expect((await sourceRow(added)).dbt_connection).toBeNull();
    });

    test('resolves a shared repository through the owning project credential reference', async () => {
        await database('projects')
            .where('project_uuid', projectA)
            .update({
                dbt_connection: encryptionUtil.encrypt(
                    JSON.stringify(connection),
                ),
                dbt_connection_type: DbtProjectType.GITHUB,
            });
        const repository = await createRepository();
        expect(await model.resolveConnection(projectB, repository)).toEqual(
            connection,
        );
        await expect(
            model.resolveConnection(otherProject, repository),
        ).rejects.toThrow(ForbiddenError);
    });

    test('requires the owner to reconnect when the referenced credential is missing', async () => {
        const repository = await createRepository();
        await database('dbt_repositories')
            .where('dbt_repository_uuid', repository)
            .update({
                credential_project_uuid: null,
                credential_source_uuid: null,
            });
        await expect(
            model.resolveConnection(projectB, repository),
        ).rejects.toThrow(ParameterError);
    });

    test('denies connection resolution for an unshared repository in another project', async () => {
        const owner = await createSource(projectA);
        const repository = await createRepository({
            isShared: false,
            credentialSourceUuid: owner.projectDbtSourceUuid,
        });
        await expect(
            model.resolveConnection(projectB, repository),
        ).rejects.toThrow(ForbiddenError);
        expect(await model.resolveConnection(projectA, repository)).toEqual(
            connection,
        );
    });

    test('returns only safe repository fields in registry and peer summaries', async () => {
        const owner = await createSource(projectA);
        const repository = await createRepository({
            credentialSourceUuid: owner.projectDbtSourceUuid,
        });
        const added = await model.addShared(
            organizationUuid,
            projectB,
            sharedInput(repository),
        );
        const expected = {
            dbtRepositoryUuid: repository,
            provider: 'github',
            host: 'github.com',
            owner: 'fixture',
            name: (await repositoryRow(repository)).name,
            defaultBranch: 'main',
            dbtProjectName: 'actual_a',
            createdByProjectUuid: projectA,
            isShared: true,
        };
        expect(await model.listShared(organizationUuid)).toEqual([expected]);
        const settings = await model.getSettings(projectB);
        expect(settings.get(added)?.repository).toEqual(expected);
        const serialized = JSON.stringify({
            registry: await model.listShared(organizationUuid),
            settings: [...settings.values()],
        });
        expect(serialized).not.toMatch(
            /credential_source_uuid|credentialSourceUuid|credential_project_uuid|credentialProjectUuid|personal_access_token|synthetic-owner-token|environment|synthetic-environment-value|dbt_connection/,
        );
    });

    test('legacy source detail hides owner credentials and rejects credential edits by a consuming project admin', async () => {
        const owner = await createSource(projectA);
        const repository = await createRepository({
            credentialSourceUuid: owner.projectDbtSourceUuid,
        });
        const added = await model.addShared(
            organizationUuid,
            projectB,
            sharedInput(repository),
        );
        const user = {
            ...defaultSessionUser,
            organizationUuid,
            role: OrganizationMemberRole.MEMBER,
            roleUuid: undefined,
        };
        const account = fromSession(
            {
                ...user,
                ability: defineUserAbility(user, [
                    {
                        projectUuid: projectB,
                        userUuid: user.userUuid,
                        role: ProjectMemberRole.ADMIN,
                        roleUuid: undefined,
                    },
                ]),
            },
            'session-cookie',
        );
        const service = new ProjectDbtSourcesService({
            lightdashConfig: {} as never,
            analytics: { track: vi.fn() } as never,
            projectModel: {
                getSummary: vi.fn(async () => ({
                    organizationUuid,
                    name: 'project_b',
                })),
                getDbtSourceIdentity: vi.fn(async () => ({
                    dbtSourceUuid: randomUUID(),
                    dbtSourceName: 'primary_b',
                })),
            } as never,
            projectDbtSourcesModel: sources,
            featureFlagModel: featureFlagModel as never,
            dbtSourceRefCatalogModel: { deleteForSource: vi.fn() } as never,
            githubAppInstallationsModel: {
                findInstallationId: vi.fn(async () => '123'),
            } as never,
            featureFlagService: {
                get: vi.fn(async () => ({ enabled: false })),
            } as never,
        });
        expect(await model.resolveConnection(projectB, repository)).toEqual(
            connection,
        );
        const detail = await service.getProjectDbtSource(
            account,
            projectB,
            added,
        );
        expect(detail.dbtConnection).toBeNull();
        expect(JSON.stringify(detail)).not.toMatch(
            /personal_access_token|synthetic-owner-token|environment|synthetic-environment-value|credentialSourceUuid|credential_source_uuid/,
        );
        await expect(
            service.updateProjectDbtSource(account, projectB, added, {
                dbtConnection: {
                    type: DbtProjectType.GITHUB,
                    authorization_method: 'installation_id',
                    installation_id: '123',
                    repository: 'fixture/repository_b',
                    branch: 'main',
                    project_sub_path: '/',
                },
            }),
        ).rejects.toThrow(ForbiddenError);
        expect((await sourceRow(added)).dbt_connection).toBeNull();
        expect(await model.resolveConnection(projectB, repository)).toEqual(
            connection,
        );
        const getSourceForApi = sources.getSourceForApi.bind(sources);
        const storedRead = vi
            .spyOn(sources, 'getSourceForApi')
            .mockImplementationOnce(async (sourceUuid) => {
                const stored = await getSourceForApi(sourceUuid);
                await database('project_dbt_sources')
                    .where('project_dbt_source_uuid', sourceUuid)
                    .delete();
                setPeerEnabled(false);
                return stored;
            });
        try {
            const racedDetail = await service.getProjectDbtSource(
                account,
                projectB,
                added,
            );
            expect(racedDetail.dbtConnection).toBeNull();
            expect(JSON.stringify(racedDetail)).not.toMatch(
                /synthetic-owner-token|environment|synthetic-environment-value/,
            );
        } finally {
            storedRead.mockRestore();
        }
    });

    test.each(['missing', 'unshared', 'other_organization'] as const)(
        'rejects adding a %s registry entry without inserting a source',
        async (visibility) => {
            const repository =
                visibility === 'missing'
                    ? randomUUID()
                    : await createRepository({
                          isShared: visibility !== 'unshared',
                          ...(visibility === 'other_organization'
                              ? {
                                    orgUuid: otherOrganizationUuid,
                                    ownerProjectUuid: otherProject,
                                }
                              : {}),
                      });
            await expect(
                model.addShared(
                    organizationUuid,
                    projectB,
                    sharedInput(repository),
                ),
            ).rejects.toThrow(NotFoundError);
            expect(await sources.getSources(projectB)).toEqual([]);
        },
    );

    test('rejects an organization argument that differs from the consuming project organization', async () => {
        const repository = await createRepository();
        await expect(
            model.addShared(
                organizationUuid,
                otherProject,
                sharedInput(repository),
            ),
        ).rejects.toThrow();
        expect(await sources.getSources(otherProject)).toEqual([]);
    });

    test('rejects binding a shared source to another project warehouse', async () => {
        const repository = await createRepository();
        const warehouse = await createWarehouse(projectA);
        await expect(
            model.addShared(
                organizationUuid,
                projectB,
                sharedInput(repository, { warehouseConnectionUuid: warehouse }),
            ),
        ).rejects.toThrow(ParameterError);
        expect(await sources.getSources(projectB)).toEqual([]);
    });

    test('rejects addShared actual-name collisions on the null connection but allows another connection', async () => {
        const existing = await createSource(projectB);
        await model.updatePeer(projectB, existing.projectDbtSourceUuid, {
            dbtProjectName: 'ACTUAL_A',
        });
        const repository = await createRepository();
        await expectNameConflict(
            model.addShared(
                organizationUuid,
                projectB,
                sharedInput(repository),
            ),
        );
        const warehouse = await createWarehouse(projectB);
        const added = await model.addShared(
            organizationUuid,
            projectB,
            sharedInput(repository, { warehouseConnectionUuid: warehouse }),
        );
        expect(await sourceRow(added)).toMatchObject({
            dbt_project_name: 'actual_a',
            warehouse_connection_uuid: warehouse,
            dbt_connection: null,
        });
        await expectNameConflict(
            model.addShared(
                organizationUuid,
                projectB,
                sharedInput(repository, {
                    name: 'source_c',
                    warehouseConnectionUuid: warehouse,
                }),
            ),
            'source_b',
        );
    });

    test('rejects duplicate display labels even when the actual names differ', async () => {
        await createSource(projectB);
        const repository = await createRepository();
        await expect(
            model.addShared(
                organizationUuid,
                projectB,
                sharedInput(repository, { name: 'source_a' }),
            ),
        ).rejects.toThrow(ConflictError);
    });

    test('counts consuming projects once and retains sharing when unshare fails', async () => {
        const repository = await createRepository({ actualName: null });
        await model.addShared(
            organizationUuid,
            projectB,
            sharedInput(repository),
        );
        await model.addShared(
            organizationUuid,
            projectB,
            sharedInput(repository, { name: 'source_c' }),
        );
        const [org] = await database('organizations').where(
            'organization_uuid',
            organizationUuid,
        );
        const projectC = await createProject(org.organization_id, 'project_d');
        await model.addShared(
            organizationUuid,
            projectC,
            sharedInput(repository),
        );
        await expect(
            model.setShared(organizationUuid, projectA, repository, false),
        ).rejects.toMatchObject({
            name: new ConflictError('').name,
            message: expect.stringContaining('2 other projects'),
        });
        expect((await repositoryRow(repository)).is_shared).toBe(true);
        await database('project_dbt_sources')
            .where('dbt_repository_uuid', repository)
            .delete();
        await model.setShared(organizationUuid, projectA, repository, false);
        expect((await repositoryRow(repository)).is_shared).toBe(false);
    });

    test('only the owning project can change registry sharing', async () => {
        const repository = await createRepository();
        await expect(
            model.setShared(organizationUuid, projectB, repository, false),
        ).rejects.toThrow(ForbiddenError);
        await expect(
            model.setShared(otherOrganizationUuid, projectA, repository, false),
        ).rejects.toThrow(ForbiddenError);
        expect((await repositoryRow(repository)).is_shared).toBe(true);
    });

    test('enforces actual-name uniqueness when rebind moves a source to the null connection', async () => {
        const first = await createSource(projectA);
        const second = await createSource(projectA, 'source_b');
        const warehouse = await createWarehouse();
        const bindings = new WarehouseConnectionCompileModel({ database });
        await bindings.bindDbtSource(
            projectA,
            second.projectDbtSourceUuid,
            warehouse,
        );
        await model.updatePeer(projectA, first.projectDbtSourceUuid, {
            dbtProjectName: 'actual_a',
        });
        await model.updatePeer(projectA, second.projectDbtSourceUuid, {
            dbtProjectName: 'actual_a',
        });
        await expect(
            bindings.bindDbtSource(projectA, second.projectDbtSourceUuid, null),
        ).rejects.toThrow();
        await expect(
            database<DbPeerDbtSource>('project_dbt_sources')
                .where('project_dbt_source_uuid', second.projectDbtSourceUuid)
                .update({ warehouse_connection_uuid: null }),
        ).rejects.toMatchObject({ code: '23505' });
        expect(
            (await sourceRow(second.projectDbtSourceUuid))
                .warehouse_connection_uuid,
        ).toBe(warehouse);
    });

    test.each(['unshare_first', 'add_first'] as const)(
        'serializes registry consumers and sharing changes with a row lock: %s',
        async (order) => {
            const repository = await createRepository();
            const holding = await database.transaction();
            const heldModel = new PeerDbtSourcesModel({
                database: holding,
                encryptionUtil,
            });
            let pending:
                | Promise<{ error: unknown } | { result: unknown }>
                | undefined;
            try {
                const {
                    rows: [{ pid }],
                } = await holding.raw<{ rows: { pid: number }[] }>(
                    'SELECT pg_backend_pid() AS pid',
                );
                if (order === 'unshare_first') {
                    await heldModel.setShared(
                        organizationUuid,
                        projectA,
                        repository,
                        false,
                    );
                    pending = model
                        .addShared(
                            organizationUuid,
                            projectB,
                            sharedInput(repository),
                        )
                        .then(
                            (result) => ({ result }),
                            (error: unknown) => ({ error }),
                        );
                } else {
                    await heldModel.addShared(
                        organizationUuid,
                        projectB,
                        sharedInput(repository),
                    );
                    pending = model
                        .setShared(
                            organizationUuid,
                            projectA,
                            repository,
                            false,
                        )
                        .then(
                            (result) => ({ result }),
                            (error: unknown) => ({ error }),
                        );
                }
                await expect
                    .poll(
                        async () => {
                            const blocked = await database.raw<{
                                rows: { count: string }[];
                            }>(
                                `SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND ?::int = ANY(pg_blocking_pids(pid)) AND query LIKE '%dbt_repositories%' AND wait_event_type = 'Lock'`,
                                [pid],
                            );
                            return Number(blocked.rows[0].count);
                        },
                        { timeout: 5000 },
                    )
                    .toBe(1);
                await holding.commit();
                const outcome = await pending;
                expect(outcome).toHaveProperty('error');
                if ('error' in outcome) {
                    expect(outcome.error).toBeInstanceOf(
                        order === 'unshare_first'
                            ? NotFoundError
                            : ConflictError,
                    );
                }
                expect((await repositoryRow(repository)).is_shared).toBe(
                    order === 'add_first',
                );
                expect(await sources.getSources(projectB)).toHaveLength(
                    order === 'add_first' ? 1 : 0,
                );
            } finally {
                if (!holding.isCompleted()) await holding.rollback();
                await pending;
            }
        },
    );
});

test.each(['default', 'mapped'] as const)(
    'copies %s peer memberships without copying credentials',
    async (mode) => {
        const owner = await createSource(projectA);
        const repository = await createRepository({
            credentialSourceUuid: owner.projectDbtSourceUuid,
        });
        const consumer = await model.addShared(
            organizationUuid,
            projectB,
            sharedInput(repository),
        );
        await model.updatePeer(projectB, consumer, {
            membershipRole: 'dependency_only',
            refreshPolicy: 'ci_managed',
        });
        const project = await database('projects')
            .where('project_uuid', projectB)
            .first();
        const target = await createProject(
            project!.organization_id,
            'preview_a',
        );
        let targetConnection: string | null = null;
        if (mode === 'mapped') {
            const from = await createWarehouse(projectB);
            targetConnection = await createWarehouse(target);
            await new WarehouseConnectionCompileModel({
                database,
            }).bindDbtSource(projectB, consumer, from);
            await sources.copySourcesWithConnectionMap(
                projectB,
                target,
                new Map([[from, targetConnection]]),
            );
        } else {
            await sources.copySources(projectB, target);
        }
        const copied = await database<DbPeerDbtSource>(
            'project_dbt_sources',
        ).where('project_uuid', target);
        expect(copied).toHaveLength(1);
        expect(copied[0]).toMatchObject({
            dbt_repository_uuid: repository,
            dbt_connection: null,
            dbt_project_name: 'actual_a',
            membership_role: 'dependency_only',
            refresh_policy: 'ci_managed',
            warehouse_connection_uuid: targetConnection,
        });
        expect((await sources.getSources(target))[0].dbtConnection).toEqual(
            connection,
        );
        await expect(
            sources.copySources(projectB, otherProject),
        ).rejects.toThrow(ForbiddenError);
        expect(await sources.getSources(otherProject)).toEqual([]);
    },
);

test('keeps registry consumers on the registered repository when the owner edits or removes a source', async () => {
    const owner = await createSource(projectA);
    const repository = await createRepository({
        credentialSourceUuid: owner.projectDbtSourceUuid,
    });
    await model.addShared(organizationUuid, projectB, sharedInput(repository));
    await expect(
        sources.updateSource(owner.projectDbtSourceUuid, {
            dbtConnection: {
                ...connection,
                repository: 'fixture/repository_b',
            },
        }),
    ).rejects.toThrow(ConflictError);
    expect(
        (await sourceRow(owner.projectDbtSourceUuid)).dbt_connection,
    ).not.toBeNull();
    expect(await model.resolveConnection(projectB, repository)).toEqual(
        connection,
    );
    await expect(
        sources.deleteSource(owner.projectDbtSourceUuid),
    ).rejects.toThrow(/1 project/);
    expect(await model.resolveConnection(projectB, repository)).toEqual(
        connection,
    );
    await sources.updateSource(owner.projectDbtSourceUuid, {
        dbtConnection: {
            ...connection,
            personal_access_token: 'synthetic-rotated-token',
        },
    });
    expect(
        (
            (await model.resolveConnection(
                projectB,
                repository,
            )) as typeof connection
        ).personal_access_token,
    ).toBe('synthetic-rotated-token');
});

test('initializes registry metadata for sources added while the flag is off', async () => {
    setPeerEnabled(false);
    const git = await createSource(projectA);
    const cli = await sources.createSource(projectA, {
        name: 'source_cli',
        isPrimary: false,
        precedence: 2,
        dbtConnection: null,
        warehouseLocation: { database: null, schema: null },
    });
    expect(
        (await sourceRow(git.projectDbtSourceUuid)).dbt_repository_uuid,
    ).toBeNull();
    setPeerEnabled(true);
    const settings = await model.getSettings(projectA);
    expect(
        settings.get(git.projectDbtSourceUuid)?.dbtRepositoryUuid,
    ).not.toBeNull();
    expect(settings.get(git.projectDbtSourceUuid)?.refreshPolicy).toBe(
        'ci_managed',
    );
    expect(settings.get(cli.projectDbtSourceUuid)?.refreshPolicy).toBe(
        'ci_managed',
    );
});

test('retains the live credential owner when another project registers the same normalized repository', async () => {
    const owner = await createSource(projectA);
    const repository = (await sourceRow(owner.projectDbtSourceUuid))
        .dbt_repository_uuid!;
    const second = await sources.createSource(projectB, {
        name: 'source_b',
        isPrimary: false,
        precedence: 1,
        dbtConnection: {
            ...connection,
            repository: 'FIXTURE/REPOSITORY_A.git',
            personal_access_token: 'synthetic-other-owner-token',
        },
        warehouseLocation: { database: null, schema: null },
    });
    expect(
        (await sourceRow(second.projectDbtSourceUuid)).dbt_repository_uuid,
    ).toBe(repository);
    expect(await repositoryRow(repository)).toMatchObject({
        credential_source_uuid: owner.projectDbtSourceUuid,
        created_by_project_uuid: projectA,
    });
    await model.setShared(organizationUuid, projectA, repository, true);
    expect(await model.resolveConnection(projectB, repository)).toEqual(
        connection,
    );
});

test('allows a legacy flag-off repository edit but refuses mismatched shared credentials after re-enable until the owner reconnects', async () => {
    const owner = await createSource(projectA);
    const repository = await createRepository({
        credentialSourceUuid: owner.projectDbtSourceUuid,
    });
    const consumer = await model.addShared(
        organizationUuid,
        projectB,
        sharedInput(repository),
    );
    setPeerEnabled(false);
    const queries: string[] = [];
    const capture = (query: { sql: string }) => queries.push(query.sql);
    database.on('query', capture);
    try {
        await sources.updateSource(owner.projectDbtSourceUuid, {
            dbtConnection: {
                ...connection,
                repository: 'fixture/repository_b',
            },
        });
    } finally {
        database.removeListener('query', capture);
    }
    expect(queries.join('\n')).not.toMatch(
        /dbt_repositories|dbt_repository_uuid|dbt_project_name|membership_role|refresh_policy/,
    );
    expect(
        (await sourceRow(owner.projectDbtSourceUuid)).dbt_repository_uuid,
    ).toBe(repository);
    setPeerEnabled(true);
    await expect(model.resolveConnection(projectB, repository)).rejects.toThrow(
        ParameterError,
    );
    await expect(model.resolveConnection(projectB, repository)).rejects.toThrow(
        /owner must reconnect/,
    );
    expect(await sources.getSource(consumer)).toMatchObject({
        dbtConnection: null,
        hasCredentialError: true,
    });
    expect(
        (await model.getSettings(projectB)).get(consumer)?.repository,
    ).toMatchObject({ name: 'repository_a' });
    await sources.updateSource(owner.projectDbtSourceUuid, {
        dbtConnection: connection,
    });
    expect(await model.resolveConnection(projectB, repository)).toEqual(
        connection,
    );
});

test('rolls back a connection update when registration inherits a conflicting known project name', async () => {
    const owner = await createSource(projectA);
    await model.updatePeer(projectA, owner.projectDbtSourceUuid, {
        dbtProjectName: 'actual_a',
    });
    const cli = await sources.createSource(projectA, {
        name: 'source_b',
        isPrimary: false,
        precedence: 2,
        dbtConnection: null,
        warehouseLocation: { database: null, schema: null },
    });
    const before = await sourceRow(cli.projectDbtSourceUuid);
    await expectNameConflict(
        sources.updateSource(cli.projectDbtSourceUuid, {
            name: 'source_c',
            dbtConnection: connection,
            warehouseLocation: { database: 'database_b', schema: 'schema_b' },
        }),
    );
    expect(await sourceRow(cli.projectDbtSourceUuid)).toEqual(before);
    const warehouse = await createWarehouse();
    await new WarehouseConnectionCompileModel({ database }).bindDbtSource(
        projectA,
        cli.projectDbtSourceUuid,
        warehouse,
    );
    await sources.updateSource(cli.projectDbtSourceUuid, {
        dbtConnection: connection,
    });
    expect(await sourceRow(cli.projectDbtSourceUuid)).toMatchObject({
        dbt_project_name: 'actual_a',
        dbt_repository_uuid: (await sourceRow(owner.projectDbtSourceUuid))
            .dbt_repository_uuid,
        warehouse_connection_uuid: warehouse,
    });
});

test('preserves an admin refresh policy when rotating registered source credentials', async () => {
    const owner = await createSource(projectA);
    await model.updatePeer(projectA, owner.projectDbtSourceUuid, {
        refreshPolicy: 'ci_managed',
    });
    await sources.updateSource(owner.projectDbtSourceUuid, {
        dbtConnection: {
            ...connection,
            personal_access_token: 'synthetic-rotated-token',
        },
    });
    expect((await sourceRow(owner.projectDbtSourceUuid)).refresh_policy).toBe(
        'ci_managed',
    );
});

test.each([true, false])(
    'API source reads keep consumer credentials null with the flag enabled=%s',
    async (enabled) => {
        const owner = await createSource(projectA);
        const repository = await createRepository({
            credentialSourceUuid: owner.projectDbtSourceUuid,
        });
        const consumer = await model.addShared(
            organizationUuid,
            projectB,
            sharedInput(repository),
        );
        const hydrate = vi
            .spyOn(sources.peers, 'resolveConnection')
            .mockRejectedValue(
                new Error('API must not resolve owner credentials'),
            );
        setPeerEnabled(enabled);
        const detail = await sources.getSourceForApi(consumer);
        expect(detail.dbtConnection).toBeNull();
        expect(hydrate).not.toHaveBeenCalled();
        expect(JSON.stringify(detail)).not.toMatch(
            /synthetic-owner-token|environment|synthetic-environment-value/,
        );
    },
);

test('refuses a shared membership when the owner credential is unavailable', async () => {
    const repository = await createRepository();
    await database('dbt_repositories')
        .where('dbt_repository_uuid', repository)
        .update({
            credential_source_uuid: null,
            credential_project_uuid: null,
        });
    await expect(
        model.addShared(organizationUuid, projectB, sharedInput(repository)),
    ).rejects.toThrow(/owner must reconnect/);
    expect(await sources.getSources(projectB)).toHaveLength(0);
});

test.each(['copy_first', 'remove_first'] as const)(
    'serializes membership copies with removal and unsharing: %s',
    async (order) => {
        const owner = await createSource(projectA);
        const repository = await createRepository({
            credentialSourceUuid: owner.projectDbtSourceUuid,
        });
        const consumer = await model.addShared(
            organizationUuid,
            projectB,
            sharedInput(repository),
        );
        const project = await database('projects')
            .where('project_uuid', projectB)
            .first();
        const target = await createProject(
            project!.organization_id,
            'preview_copy',
        );
        const holding = await database.transaction();
        const heldSources = new ProjectDbtSourcesModel({
            database: holding,
            encryptionUtil,
        });
        const heldPeers = new PeerDbtSourcesModel({
            database: holding,
            encryptionUtil,
        });
        let pending: Promise<{ error?: unknown }> | undefined;
        try {
            const {
                rows: [{ pid }],
            } = await holding.raw<{ rows: { pid: number }[] }>(
                'SELECT pg_backend_pid() AS pid',
            );
            if (order === 'copy_first') {
                await heldSources.copySources(projectB, target);
                pending = (async () => {
                    await sources.deleteSource(consumer);
                    await model.setShared(
                        organizationUuid,
                        projectA,
                        repository,
                        false,
                    );
                })().then(
                    () => ({}),
                    (error: unknown) => ({ error }),
                );
            } else {
                await heldSources.deleteSource(consumer);
                await heldPeers.setShared(
                    organizationUuid,
                    projectA,
                    repository,
                    false,
                );
                pending = sources.copySources(projectB, target).then(
                    () => ({}),
                    (error: unknown) => ({ error }),
                );
            }
            await expect
                .poll(
                    async () => {
                        const blocked = await database.raw<{
                            rows: { count: string }[];
                        }>(
                            'SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND ?::int = ANY(pg_blocking_pids(pid)) AND wait_event_type = ?',
                            [pid, 'Lock'],
                        );
                        return Number(blocked.rows[0].count);
                    },
                    { timeout: 5000 },
                )
                .toBe(1);
            await holding.commit();
            const outcome = await pending;
            if (order === 'copy_first')
                expect(outcome.error).toBeInstanceOf(ConflictError);
            else expect(outcome.error).toBeUndefined();
            expect(await sources.getSources(target)).toHaveLength(
                order === 'copy_first' ? 1 : 0,
            );
            expect((await repositoryRow(repository)).is_shared).toBe(
                order === 'copy_first',
            );
        } finally {
            if (!holding.isCompleted()) await holding.rollback();
            await pending;
        }
    },
);

test('reports a known-name conflict for a source added while disabled without breaking peer listing', async () => {
    const owner = await createSource(projectA, 'source_owner', {
        dbtProjectName: 'actual_a',
    });
    setPeerEnabled(false);
    const later = await createSource(projectA, 'source_later');
    await nameEvidence(projectA, later.projectDbtSourceUuid, 'actual_a');
    setPeerEnabled(true);
    const settings = await model.getSettings(projectA);
    expect(settings.get(owner.projectDbtSourceUuid)).toMatchObject({
        dbtProjectName: null,
        dbtProjectNameConflict: 'actual_a',
        dbtProjectNameState: 'conflict',
    });
    expect(settings.get(later.projectDbtSourceUuid)).toMatchObject({
        dbtProjectName: null,
        dbtProjectNameConflict: 'actual_a',
    });
    expect(await sources.getSources(projectA)).toHaveLength(2);
});

test('source and peer lists expose canonical repository coordinates without owner URL credentials', async () => {
    const owner = await sources.createSource(projectA, {
        name: 'source_url',
        isPrimary: false,
        precedence: 1,
        dbtConnection: {
            ...connection,
            repository:
                'https://synthetic-user:synthetic-url-token@git.example.test/fixture/repository_url.git?token=synthetic-query-token',
        },
        warehouseLocation: { database: null, schema: null },
    });
    const repository = (await sourceRow(owner.projectDbtSourceUuid))
        .dbt_repository_uuid!;
    await model.setShared(organizationUuid, projectA, repository, true);
    const consumer = await model.addShared(
        organizationUuid,
        projectB,
        sharedInput(repository),
    );
    const user = {
        ...defaultSessionUser,
        organizationUuid,
        role: OrganizationMemberRole.MEMBER,
        roleUuid: undefined,
    };
    const account = fromSession(
        {
            ...user,
            ability: defineUserAbility(user, [
                {
                    projectUuid: projectB,
                    userUuid: user.userUuid,
                    role: ProjectMemberRole.VIEWER,
                    roleUuid: undefined,
                },
            ]),
        },
        'session-cookie',
    );
    const projectModel = {
        getSummary: async () => ({ organizationUuid, name: 'project_b' }),
        get: async () => ({ dbtConnection: { type: DbtProjectType.NONE } }),
        getDbtSourceIdentity: async () => ({
            dbtSourceUuid: randomUUID(),
            dbtSourceName: 'primary_b',
        }),
    };
    const service = new ProjectDbtSourcesService({
        lightdashConfig: {} as never,
        analytics: { track: vi.fn() } as never,
        projectModel: projectModel as never,
        projectDbtSourcesModel: sources,
        featureFlagModel: featureFlagModel as never,
        dbtSourceRefCatalogModel: { deleteForSource: vi.fn() } as never,
        githubAppInstallationsModel: {} as never,
        featureFlagService: { get: featureFlagModel.get } as never,
    });
    const peers = new PeerDbtSourcesService({
        projectModel: projectModel as never,
        projectDbtSourcesModel: sources,
        projectDbtSourcesService: service,
        featureFlagModel: featureFlagModel as never,
    });
    const ownerAccount = fromSession(
        {
            ...user,
            ability: defineUserAbility(user, [
                {
                    projectUuid: projectA,
                    userUuid: user.userUuid,
                    role: ProjectMemberRole.VIEWER,
                    roleUuid: undefined,
                },
            ]),
        },
        'session-cookie',
    );
    const lists = await Promise.all([
        service.getProjectDbtSources(account, projectB),
        peers.listPeers(account, projectB),
        peers.listPeers(ownerAccount, projectA),
    ]);
    expect(JSON.stringify(lists)).not.toMatch(
        /synthetic-user|synthetic-url-token|synthetic-query-token|synthetic-owner-token|synthetic-environment-value/,
    );
    expect(
        lists[0].find((source) => source.projectDbtSourceUuid === consumer)
            ?.repository,
    ).toBe('fixture/repository_url');
    const resolve = vi.spyOn(sources.peers, 'resolveConnection');
    await service.getProjectDbtSources(account, projectB);
    await peers.listPeers(account, projectB);
    expect(resolve).not.toHaveBeenCalled();
});

describe('runtime repository fill', () => {
    test.each([
        [
            'registered',
            (): Buffer => encryptionUtil.encrypt(JSON.stringify(connection)),
        ],
        [
            'cannot_decrypt',
            (): Buffer => Buffer.from('synthetic-invalid-ciphertext'),
        ],
        ['cannot_parse', (): Buffer => encryptionUtil.encrypt('{invalid-json')],
        ['cannot_parse', (): Buffer => encryptionUtil.encrypt('null')],
        [
            'cannot_parse',
            (): Buffer =>
                encryptionUtil.encrypt(
                    JSON.stringify({ ...connection, repository: 42 }),
                ),
        ],
        [
            'not_git',
            (): Buffer =>
                encryptionUtil.encrypt(
                    JSON.stringify({ type: DbtProjectType.NONE }),
                ),
        ],
        ['not_git', (): null => null],
    ] as const)(
        'persists %s as a terminal row outcome',
        async (outcome, ciphertext) => {
            const uuid = await pendingSource(projectA, {
                dbt_connection: ciphertext(),
            });
            await expect(
                model.ensureRepositories(projectA),
            ).resolves.toBeUndefined();
            const first = await sourceRow(uuid);
            expect(first).toMatchObject({
                repository_fill_state: outcome,
                repository_fill_attempted_at: expect.any(Date),
                refresh_policy: 'ci_managed',
            });
            expect(first.dbt_repository_uuid !== null).toBe(
                outcome === 'registered',
            );
            await model.ensureRepositories(projectA);
            expect(
                (await sourceRow(uuid)).repository_fill_attempted_at,
            ).toEqual(first.repository_fill_attempted_at);
            if (outcome === 'not_git' || outcome === 'cannot_parse') {
                const decrypt = vi.spyOn(encryptionUtil, 'decrypt');
                await model.ensureRepositories(projectA, { retry: true });
                expect(decrypt.mock.calls.length).toBe(0);
                expect(
                    (await sourceRow(uuid)).repository_fill_attempted_at,
                ).toEqual(first.repository_fill_attempted_at);
            }
        },
    );

    test('enabled getters return healthy local credentials and mark corrupt credentials without exposing them', async () => {
        const healthy = await pendingSource();
        const corrupt = await pendingSource(projectA, {
            dbt_connection: Buffer.from('synthetic-invalid-ciphertext'),
        });
        const listed = await sources.getSources(projectA);
        expect(
            listed.find((source) => source.projectDbtSourceUuid === healthy),
        ).toMatchObject({
            dbtConnection: connection,
            hasCredentialError: false,
        });
        expect(
            listed.find((source) => source.projectDbtSourceUuid === corrupt),
        ).toMatchObject({
            dbtConnection: null,
            hasCredentialError: true,
        });
        expect(await sources.getSource(healthy)).toMatchObject({
            dbtConnection: connection,
            hasCredentialError: false,
        });
        const detail = await sources.getSourceForApi(corrupt);
        expect(detail).toMatchObject({
            dbtConnection: null,
            hasCredentialError: true,
        });
        expect(JSON.stringify(detail)).not.toContain(
            'synthetic-invalid-ciphertext',
        );
        const settings = await model.getSettings(projectA);
        expect(settings.has(corrupt)).toBe(true);
        expect(settings.get(corrupt)).toMatchObject({
            dbtRepositoryUuid: null,
            dbtProjectNameState: 'unknown',
        });
        expect(await sourceRow(corrupt)).toMatchObject({
            repository_fill_state: 'cannot_decrypt',
        });
    });

    test('keeps decoded local credentials when only repository identity cannot be parsed', async () => {
        const local = {
            ...connection,
            repository: 'ssh://git@git.example.test/fixture/repository_a.git',
        };
        const uuid = await pendingSource(projectA, {
            dbt_connection: encryptionUtil.encrypt(JSON.stringify(local)),
        });
        const listed = await sources.getSources(projectA);
        expect(listed).toEqual([
            expect.objectContaining({
                projectDbtSourceUuid: uuid,
                dbtConnection: local,
                hasCredentialError: false,
            }),
        ]);
        expect(await sources.getSource(uuid)).toMatchObject({
            dbtConnection: local,
            hasCredentialError: false,
        });
        expect(await sourceRow(uuid)).toMatchObject({
            repository_fill_state: 'cannot_parse',
            dbt_repository_uuid: null,
        });
    });

    test('rolls registry writes back when a row fill fails and keeps healthy local reads available', async () => {
        const uuid = await pendingSource();
        await database.raw(
            "CREATE FUNCTION reject_peer_fill_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic fill failure'; END; $$",
        );
        await database.raw(
            'CREATE TRIGGER reject_peer_fill_fixture BEFORE UPDATE OF dbt_repository_uuid ON project_dbt_sources FOR EACH ROW EXECUTE FUNCTION reject_peer_fill_fixture()',
        );
        try {
            const listed = await sources.getSources(projectA);
            expect(listed).toEqual([
                expect.objectContaining({
                    projectDbtSourceUuid: uuid,
                    dbtConnection: connection,
                    hasCredentialError: false,
                }),
            ]);
            const first = await sourceRow(uuid);
            expect(first).toMatchObject({
                repository_fill_state: 'failed',
                dbt_repository_uuid: null,
            });
            expect(
                await database('dbt_repositories').where(
                    'organization_uuid',
                    organizationUuid,
                ),
            ).toHaveLength(0);
            await model.ensureRepositories(projectA);
            expect(
                (await sourceRow(uuid)).repository_fill_attempted_at,
            ).toEqual(first.repository_fill_attempted_at);
        } finally {
            await database.raw(
                'DROP TRIGGER reject_peer_fill_fixture ON project_dbt_sources',
            );
            await database.raw('DROP FUNCTION reject_peer_fill_fixture()');
        }
        await model.ensureRepositories(projectA, { retry: true });
        expect(await sourceRow(uuid)).toMatchObject({
            repository_fill_state: 'registered',
            dbt_repository_uuid: expect.any(String),
        });
    });

    test('does not retry a terminal decrypt failure until explicitly requested', async () => {
        const uuid = await pendingSource();
        const decrypt = vi
            .spyOn(encryptionUtil, 'decrypt')
            .mockImplementationOnce(() => {
                throw new Error('Synthetic unavailable key');
            });
        try {
            await model.ensureRepositories(projectA);
            expect(await sourceRow(uuid)).toMatchObject({
                repository_fill_state: 'cannot_decrypt',
            });
            expect(decrypt).toHaveBeenCalledTimes(1);
            await model.ensureRepositories(projectA);
            expect(decrypt).toHaveBeenCalledTimes(1);
            await model.ensureRepositories(projectA, { retry: true });
            expect(decrypt).toHaveBeenCalledTimes(2);
            expect(await sourceRow(uuid)).toMatchObject({
                repository_fill_state: 'registered',
            });
        } finally {
            decrypt.mockRestore();
        }
    });

    test('retries a terminal failure after a connection update and preserves an admin policy', async () => {
        const uuid = await pendingSource(projectA, {
            dbt_connection: Buffer.from('synthetic-invalid-ciphertext'),
        });
        await model.ensureRepositories(projectA);
        await model.updatePeer(projectA, uuid, { refreshPolicy: 'ci_managed' });
        await sources.updateSource(uuid, { dbtConnection: connection });
        expect(await sourceRow(uuid)).toMatchObject({
            repository_fill_state: 'registered',
            refresh_policy: 'ci_managed',
            dbt_repository_uuid: expect.any(String),
        });
    });

    test('concurrent ensures fill one source only once', async () => {
        const uuid = await pendingSource();
        const info = vi.spyOn(Logger, 'info');
        const queries: string[] = [];
        const capture = (query: { sql: string }) => queries.push(query.sql);
        database.on('query', capture);
        try {
            await Promise.all([
                model.ensureRepositories(projectA),
                model.ensureRepositories(projectA),
            ]);
        } finally {
            database.removeListener('query', capture);
        }
        expect(info).toHaveBeenCalledWith('peer_dbt_source_repository_fill', {
            projectUuid: projectA,
            sourceUuid: uuid,
            outcome: 'registered',
            stateRecorded: true,
        });
        expect(info).toHaveBeenCalledWith(
            'peer_dbt_source_repository_fill_summary',
            {
                projectUuid: projectA,
                counts: { registered: 1 },
                unrecordedFailures: 0,
            },
        );
        expect(JSON.stringify(info.mock.calls)).not.toContain(
            'synthetic-owner-token',
        );
        expect(await sourceRow(uuid)).toMatchObject({
            repository_fill_state: 'registered',
        });
        expect(
            queries.filter((sql) =>
                sql.startsWith('insert into "dbt_repositories"'),
            ),
        ).toHaveLength(1);
        expect(
            await database('dbt_repositories').where(
                'organization_uuid',
                organizationUuid,
            ),
        ).toHaveLength(1);
    });

    test('concurrent first registrations use conflict-ignore and keep one repository owner', async () => {
        const first = await pendingSource(projectA);
        const second = await pendingSource(projectB);
        const queries: string[] = [];
        const capture = (query: { sql: string }) => queries.push(query.sql);
        database.on('query', capture);
        try {
            await Promise.all([
                model.ensureRepositories(projectA),
                model.ensureRepositories(projectB),
            ]);
        } finally {
            database.removeListener('query', capture);
        }
        const inserts = queries.filter((sql) =>
            sql.startsWith('insert into "dbt_repositories"'),
        );
        expect(inserts).toHaveLength(2);
        inserts.forEach((sql) => {
            expect(sql).toContain('do nothing');
            expect(sql).not.toContain('do update');
        });
        const a = await sourceRow(first);
        const b = await sourceRow(second);
        expect(a.dbt_repository_uuid).toBe(b.dbt_repository_uuid);
        const repository = await repositoryRow(a.dbt_repository_uuid!);
        expect([first, second]).toContain(repository.credential_source_uuid);
        expect(repository.created_by_project_uuid).toBe(
            repository.credential_source_uuid === first ? projectA : projectB,
        );
        const initialOwner = repository.credential_source_uuid;
        await Promise.all([
            model.ensureRepositories(projectA, { retry: true }),
            model.ensureRepositories(projectB, { retry: true }),
        ]);
        expect(
            await repositoryRow(repository.dbt_repository_uuid),
        ).toMatchObject({
            credential_source_uuid: initialOwner,
            created_by_project_uuid: repository.created_by_project_uuid,
        });
    });

    test('does not take ownership of a retained registry on retry', async () => {
        const owner = await pendingSource(projectA);
        await model.ensureRepositories(projectA);
        const repository = (await sourceRow(owner)).dbt_repository_uuid!;
        await database('dbt_repositories')
            .where('dbt_repository_uuid', repository)
            .update({ credential_source_uuid: null });
        const other = await pendingSource(projectB);
        await model.ensureRepositories(projectB);
        await model.ensureRepositories(projectB, { retry: true });
        expect((await sourceRow(other)).dbt_repository_uuid).toBe(repository);
        expect(await repositoryRow(repository)).toMatchObject({
            credential_source_uuid: null,
            created_by_project_uuid: projectA,
        });
    });

    test('uses current ciphertext after waiting for the project lock', async () => {
        const uuid = await pendingSource();
        const holding = await database.transaction();
        let pending: Promise<void> | undefined;
        try {
            await holding('projects')
                .where('project_uuid', projectA)
                .forUpdate()
                .first();
            const {
                rows: [{ pid }],
            } = await holding.raw<{ rows: { pid: number }[] }>(
                'SELECT pg_backend_pid() AS pid',
            );
            pending = model.ensureRepositories(projectA);
            await expect
                .poll(
                    async () => {
                        const result = await database.raw<{
                            rows: { count: string }[];
                        }>(
                            'SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND ?::int = ANY(pg_blocking_pids(pid)) AND wait_event_type = ?',
                            [pid, 'Lock'],
                        );
                        return Number(result.rows[0].count);
                    },
                    { timeout: 1500 },
                )
                .toBe(1);
            await holding('project_dbt_sources')
                .where('project_dbt_source_uuid', uuid)
                .update({
                    dbt_connection: encryptionUtil.encrypt(
                        JSON.stringify({
                            ...connection,
                            repository: 'fixture/current_repository',
                        }),
                    ),
                });
            await holding.commit();
            await pending;
            const source = await sourceRow(uuid);
            expect(
                await repositoryRow(source.dbt_repository_uuid!),
            ).toMatchObject({ name: 'current_repository' });
        } finally {
            if (!holding.isCompleted()) await holding.rollback();
            await pending;
        }
    });

    test('a finite project lock wait does not fail source reads', async () => {
        const uuid = await pendingSource();
        const holding = await database.transaction();
        try {
            await holding('projects')
                .where('project_uuid', projectA)
                .forUpdate()
                .first();
            await expect(sources.getSources(projectA)).resolves.toEqual([
                expect.objectContaining({
                    projectDbtSourceUuid: uuid,
                    dbtConnection: connection,
                    hasCredentialError: false,
                }),
            ]);
            expect((await sourceRow(uuid)).repository_fill_state).toBe(
                'failed',
            );
        } finally {
            await holding.rollback();
        }
        await model.ensureRepositories(projectA);
        expect((await sourceRow(uuid)).repository_fill_state).toBe('failed');
        await model.ensureRepositories(projectA, { retry: true });
        expect((await sourceRow(uuid)).repository_fill_state).toBe(
            'registered',
        );
    });

    test('a failure-state lock error stays isolated and a changed connection can fill later', async () => {
        const uuid = await pendingSource();
        const info = vi.spyOn(Logger, 'info');
        const holding = await database.transaction();
        try {
            await holding('projects')
                .where('project_uuid', projectA)
                .forUpdate()
                .first();
            await holding('project_dbt_sources')
                .where('project_dbt_source_uuid', uuid)
                .update({
                    dbt_connection: encryptionUtil.encrypt(
                        JSON.stringify({
                            ...connection,
                            repository: 'fixture/changed_after_failure',
                        }),
                    ),
                });
            await expect(sources.getSources(projectA)).resolves.toEqual([
                expect.objectContaining({
                    projectDbtSourceUuid: uuid,
                    dbtConnection: connection,
                    hasCredentialError: false,
                }),
            ]);
            expect(info).toHaveBeenCalledWith(
                'peer_dbt_source_repository_fill',
                {
                    projectUuid: projectA,
                    sourceUuid: uuid,
                    outcome: 'failed',
                    stateRecorded: false,
                },
            );
            expect(info).toHaveBeenCalledWith(
                'peer_dbt_source_repository_fill_summary',
                {
                    projectUuid: projectA,
                    counts: { failed: 1 },
                    unrecordedFailures: 1,
                },
            );
            expect((await sourceRow(uuid)).repository_fill_state).toBe(
                'pending',
            );
            await holding.commit();
        } finally {
            if (!holding.isCompleted()) await holding.rollback();
        }
        await model.ensureRepositories(projectA);
        const row = await sourceRow(uuid);
        expect(row.repository_fill_state).toBe('registered');
        expect(await repositoryRow(row.dbt_repository_uuid!)).toMatchObject({
            name: 'changed_after_failure',
        });
    });

    test.each(['source', 'project'] as const)(
        'rejects cross-organization credential %s pointers on write and resolve',
        async (kind) => {
            const foreign = await pendingSource(otherProject);
            const repository = await createRepository();
            await database('projects')
                .where('project_uuid', otherProject)
                .update({
                    dbt_connection: encryptionUtil.encrypt(
                        JSON.stringify(connection),
                    ),
                    dbt_connection_type: connection.type,
                });
            await database('dbt_repositories')
                .where('dbt_repository_uuid', repository)
                .update({
                    credential_source_uuid: kind === 'source' ? foreign : null,
                    credential_project_uuid:
                        kind === 'project' ? otherProject : null,
                });
            await expect(
                model.resolveConnection(projectB, repository),
            ).rejects.toBeInstanceOf(ForbiddenError);
            await expect(
                model.addShared(
                    organizationUuid,
                    projectB,
                    sharedInput(repository),
                ),
            ).rejects.toBeInstanceOf(ForbiddenError);
            await expect(
                model.setShared(organizationUuid, projectA, repository, true),
            ).rejects.toBeInstanceOf(ForbiddenError);
            expect(await sources.getSources(projectB)).toHaveLength(0);
        },
    );

    test('a foreign credential source cannot be accepted during registration', async () => {
        const uuid = await pendingSource(projectA);
        await model.ensureRepositories(projectA);
        const repository = (await sourceRow(uuid)).dbt_repository_uuid!;
        const foreign = await pendingSource(otherProject);
        await database('dbt_repositories')
            .where('dbt_repository_uuid', repository)
            .update({ credential_source_uuid: foreign });
        await model.ensureRepositories(projectA, { retry: true });
        expect((await sourceRow(uuid)).repository_fill_state).toBe('failed');
        await expect(
            model.registerSource(projectA, uuid, connection),
        ).rejects.toBeInstanceOf(ForbiddenError);
    });

    test('an unshared repository with no consumers permits an identity edit', async () => {
        const source = await createSource(projectA);
        const original = (await sourceRow(source.projectDbtSourceUuid))
            .dbt_repository_uuid!;
        await sources.updateSource(source.projectDbtSourceUuid, {
            dbtConnection: {
                ...connection,
                repository: 'fixture/repository_b',
            },
        });
        const updated = await sourceRow(source.projectDbtSourceUuid);
        expect(updated.dbt_repository_uuid).not.toBe(original);
        expect(await repositoryRow(updated.dbt_repository_uuid!)).toMatchObject(
            { name: 'repository_b' },
        );
        expect(await repositoryRow(original)).toMatchObject({
            created_by_project_uuid: projectA,
        });
    });

    test.each([true, false])(
        'excludes main rows from extra-source reads when enabled=%s',
        async (enabled) => {
            const main = await pendingSource(projectA, { role: 'main' });
            setPeerEnabled(enabled);
            expect(await model.getSettings(projectA)).toEqual(new Map());
            expect(await model.isSharedConsumer(projectA, main)).toBe(false);
            expect((await sourceRow(main)).repository_fill_state).toBe(
                'pending',
            );
            await expect(
                model.updatePeer(projectA, main, {
                    dbtProjectName: 'main_name',
                }),
            ).rejects.toBeInstanceOf(NotFoundError);
        },
    );
});

describe('project name initialization barrier', () => {
    test('marks every duplicate before assignment and keeps missing and ambiguous evidence unknown', async () => {
        const warning = vi.spyOn(Logger, 'warn');
        const a = await pendingSource();
        const b = await pendingSource();
        const unknown = await pendingSource();
        const ambiguous = await pendingSource();
        await nameEvidence(projectA, a, '  Actual_A ');
        await nameEvidence(projectA, b, 'actual_a');
        await nameEvidence(projectA, ambiguous, 'choice_a');
        await nameEvidence(projectA, ambiguous, 'choice_b', 'other_group');
        await model.initializeProjectNames(projectA);
        await Promise.all(
            [a, b].map(async (uuid) => {
                expect(await sourceRow(uuid)).toMatchObject({
                    dbt_project_name: null,
                    dbt_project_name_conflict: 'actual_a',
                    dbt_project_name_initialized_at: expect.any(Date),
                });
            }),
        );
        await Promise.all(
            [unknown, ambiguous].map(async (uuid) => {
                expect(await sourceRow(uuid)).toMatchObject({
                    dbt_project_name: null,
                    dbt_project_name_conflict: null,
                    dbt_project_name_initialized_at: expect.any(Date),
                });
            }),
        );
        expect(warning).toHaveBeenCalledWith(
            'peer_dbt_source_project_name_conflicts',
            {
                projectUuid: projectA,
                count: 2,
                sourceUuids: expect.arrayContaining([a, b]),
            },
        );
        expect(JSON.stringify(warning.mock.calls)).not.toContain('actual_a');
        const settings = await model.getSettings(projectA);
        expect(settings.get(a)?.dbtProjectNameState).toBe('conflict');
        expect(settings.get(b)?.dbtProjectNameState).toBe('conflict');
        expect(settings.get(unknown)?.dbtProjectNameState).toBe('unknown');
        expect(settings.get(ambiguous)?.dbtProjectNameState).toBe('unknown');
    });

    test('uses only the project and source base-table evidence and preserves names on other connections', async () => {
        const a = await pendingSource();
        const b = await pendingSource(projectA, {
            warehouse_connection_uuid: await createWarehouse(),
        });
        const unknown = await pendingSource();
        const foreign = await pendingSource(otherProject);
        await nameEvidence(projectA, a, 'actual_a');
        await nameEvidence(projectA, b, 'actual_a');
        await nameEvidence(otherProject, unknown, 'foreign_name');
        await nameEvidence(otherProject, foreign, 'actual_a');
        await database('cached_explore').insert({
            project_uuid: projectA,
            name: 'orders',
            table_names: ['orders'],
            explore: {
                baseTable: 'orders',
                tables: {
                    orders: { dbtSourceUuid: b, dbtPackageName: 'actual_a' },
                    joined: {
                        dbtSourceUuid: unknown,
                        dbtPackageName: 'joined_dependency',
                    },
                },
            },
        });
        await model.initializeProjectNames(projectA);
        await Promise.all(
            [a, b].map(async (uuid) => {
                expect(await sourceRow(uuid)).toMatchObject({
                    dbt_project_name: 'actual_a',
                    dbt_project_name_conflict: null,
                });
            }),
        );
        expect(await sourceRow(unknown)).toMatchObject({
            dbt_project_name: null,
            dbt_project_name_conflict: null,
        });
        expect(
            (await sourceRow(foreign)).dbt_project_name_initialized_at,
        ).toBeNull();
    });

    test.each(['create', 'update', 'addShared'] as const)(
        'initializes all legacy candidates before a name-dependent %s',
        async (method) => {
            const legacy = await pendingSource();
            await nameEvidence(projectA, legacy, 'reserved_name');
            if (method === 'create') {
                await expect(
                    model.createSource(projectA, {
                        name: 'new_source',
                        isPrimary: false,
                        precedence: 2,
                        dbtConnection: connection,
                        warehouseLocation: { database: null, schema: null },
                        dbtProjectName: 'reserved_name',
                    }),
                ).rejects.toBeInstanceOf(ConflictError);
            } else if (method === 'update') {
                const target = await pendingSource();
                await expect(
                    model.updatePeer(projectA, target, {
                        dbtProjectName: 'reserved_name',
                    }),
                ).rejects.toBeInstanceOf(ConflictError);
            } else {
                const repository = await createRepository({
                    ownerProjectUuid: projectB,
                    actualName: 'reserved_name',
                });
                await expect(
                    model.addShared(
                        organizationUuid,
                        projectA,
                        sharedInput(repository),
                    ),
                ).rejects.toBeInstanceOf(ConflictError);
            }
            expect(
                await database<DbPeerDbtSource>('project_dbt_sources').where({
                    project_uuid: projectA,
                    dbt_project_name: 'reserved_name',
                }),
            ).toHaveLength(0);
            await model.initializeProjectNames(projectA);
            expect((await sourceRow(legacy)).dbt_project_name).toBe(
                'reserved_name',
            );
        },
    );

    test('concurrent name-dependent writes cannot win ahead of legacy name evidence', async () => {
        const legacy = await pendingSource();
        const a = await pendingSource();
        const b = await pendingSource();
        await nameEvidence(projectA, legacy, 'reserved_name');
        const results = await Promise.allSettled([
            model.updatePeer(projectA, a, { dbtProjectName: 'reserved_name' }),
            model.updatePeer(projectA, b, { dbtProjectName: 'reserved_name' }),
        ]);
        expect(results).toEqual([
            { status: 'rejected', reason: expect.any(ConflictError) },
            { status: 'rejected', reason: expect.any(ConflictError) },
        ]);
        await model.initializeProjectNames(projectA);
        expect((await sourceRow(legacy)).dbt_project_name).toBe(
            'reserved_name',
        );
    });
});
