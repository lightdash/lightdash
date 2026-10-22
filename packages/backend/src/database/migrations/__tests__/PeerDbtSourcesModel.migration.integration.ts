import {
    ConflictError,
    DbtProjectType,
    defineUserAbility,
    FeatureFlags,
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
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import {
    PeerDbtSourcesModel,
    type DbPeerDbtSource,
} from '../../../models/PeerDbtSourcesModel';
import { ProjectDbtSourcesModel } from '../../../models/ProjectDbtSourcesModel';
import { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { WarehouseConnectionCompileModel } from '../../../models/WarehouseConnectionCompileModel/WarehouseConnectionCompileModel';
import { PeerDbtSourcesService } from '../../../services/PeerDbtSourcesService';
import { ProjectDbtSourcesService } from '../../../services/ProjectDbtSourcesService';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { EncryptionUtil } from '../../../utils/EncryptionUtil/EncryptionUtil';

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
    featureFlagModel.get.mockReset().mockResolvedValue({ enabled: true });
    model = new PeerDbtSourcesModel({
        database,
        encryptionUtil,
        featureFlagModel: featureFlagModel as never,
    });
    sources = new ProjectDbtSourcesModel({
        database,
        encryptionUtil,
        featureFlagModel: featureFlagModel as never,
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
        expect(featureFlagModel.get).toHaveBeenCalledWith({
            user: { organizationUuid },
            featureFlagId: FeatureFlags.PeerDbtSources,
        });
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

    test('does not learn names with the flag disabled and uses the compile organization-only flag scope', async () => {
        const source = await createSource(projectA);
        featureFlagModel.get.mockClear().mockResolvedValue({ enabled: false });
        await model.learnProjectName(
            projectA,
            source.projectDbtSourceUuid,
            'actual_a',
        );
        expect(
            (await sourceRow(source.projectDbtSourceUuid)).dbt_project_name,
        ).toBeNull();
        expect(featureFlagModel.get).toHaveBeenCalledExactlyOnceWith({
            user: { organizationUuid },
            featureFlagId: FeatureFlags.PeerDbtSources,
        });
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
                featureFlagModel.get.mockResolvedValue({ enabled: false });
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
                featureFlagModel: featureFlagModel as never,
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
    featureFlagModel.get.mockResolvedValue({ enabled: false });
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
    featureFlagModel.get.mockResolvedValue({ enabled: true });
    const settings = await model.getSettings(projectA);
    expect(
        settings.get(git.projectDbtSourceUuid)?.dbtRepositoryUuid,
    ).not.toBeNull();
    expect(settings.get(git.projectDbtSourceUuid)?.refreshPolicy).toBe(
        'git_refresh',
    );
    expect(settings.get(cli.projectDbtSourceUuid)?.refreshPolicy).toBe(
        'ci_managed',
    );
});

test.each(['batched', 'transaction'] as const)(
    'refuses %s project deletion before deleting content when another project consumes its credentials',
    async (mode) => {
        const owner = await createSource(projectA);
        const repository = await createRepository({
            credentialSourceUuid: owner.projectDbtSourceUuid,
        });
        await model.addShared(
            organizationUuid,
            projectB,
            sharedInput(repository),
        );
        const project = await database('projects')
            .where('project_uuid', projectA)
            .first();
        const [space] = await database('spaces')
            .insert({
                project_id: project!.project_id,
                name: 'space_a',
                slug: 'space-a',
                parent_space_uuid: null,
                path: 'space_a',
                inherit_parent_permissions: true,
                is_default_user_space: false,
            })
            .returning('space_uuid');
        const projectModel = new ProjectModel({
            database,
            lightdashConfig: lightdashConfigMock,
            encryptionUtil,
            featureFlagModel: featureFlagModel as never,
        });
        const contentDelete = vi.spyOn(projectModel, 'deleteContentInBatches');
        await expect(projectModel.assertCanDelete(projectA)).rejects.toThrow(
            /1 other project/,
        );
        const deletion =
            mode === 'transaction'
                ? database.transaction((trx) =>
                      projectModel.delete(projectA, trx),
                  )
                : projectModel.delete(projectA);
        await expect(deletion).rejects.toThrow(ConflictError);
        expect(contentDelete).not.toHaveBeenCalled();
        expect(
            await database('spaces')
                .where('space_uuid', space.space_uuid)
                .first(),
        ).toBeDefined();
        expect(await repositoryRow(repository)).toMatchObject({
            credential_source_uuid: owner.projectDbtSourceUuid,
            is_shared: true,
        });
        expect(await model.resolveConnection(projectB, repository)).toEqual(
            connection,
        );
    },
);

test.each(['source', 'project'] as const)(
    'reclaims the retained registry after deleting its credential %s and resolves the replacement credentials',
    async (kind) => {
        const owner = await createSource(projectA);
        const repository = await createRepository({
            credentialSourceUuid: owner.projectDbtSourceUuid,
        });
        if (kind === 'source') {
            await sources.deleteSource(owner.projectDbtSourceUuid);
        } else {
            await new ProjectModel({
                database,
                lightdashConfig: lightdashConfigMock,
                encryptionUtil,
                featureFlagModel: featureFlagModel as never,
            }).delete(projectA);
        }
        expect(await repositoryRow(repository)).toMatchObject({
            credential_source_uuid: null,
            credential_project_uuid: null,
            is_shared: false,
        });
        const replacement = await createSource(projectB);
        expect(await sourceRow(replacement.projectDbtSourceUuid)).toMatchObject(
            {
                dbt_repository_uuid: repository,
                dbt_project_name: 'actual_a',
            },
        );
        expect(await repositoryRow(repository)).toMatchObject({
            credential_source_uuid: replacement.projectDbtSourceUuid,
            created_by_project_uuid: projectB,
            provider: 'github',
            host: 'github.com',
            owner: 'fixture',
            name: 'repository_a',
        });
        const organization = await database('organizations')
            .where('organization_uuid', organizationUuid)
            .first();
        const consumerProject = await createProject(
            organization!.organization_id,
            'project_d',
        );
        await model.setShared(organizationUuid, projectB, repository, true);
        await model.addShared(
            organizationUuid,
            consumerProject,
            sharedInput(repository),
        );
        expect(
            await model.resolveConnection(consumerProject, repository),
        ).toEqual(connection);
        expect(
            await database('dbt_repositories').where({
                organization_uuid: organizationUuid,
                provider: 'github',
                host: 'github.com',
                owner: 'fixture',
                name: 'repository_a',
            }),
        ).toHaveLength(1);
    },
);

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
    featureFlagModel.get.mockResolvedValue({ enabled: false });
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
    featureFlagModel.get.mockResolvedValue({ enabled: true });
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
        featureFlagModel.get.mockResolvedValue({ enabled });
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
            featureFlagModel: featureFlagModel as never,
        });
        const heldPeers = new PeerDbtSourcesModel({
            database: holding,
            encryptionUtil,
            featureFlagModel: featureFlagModel as never,
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
    featureFlagModel.get.mockResolvedValue({ enabled: false });
    const later = await createSource(projectA, 'source_later');
    featureFlagModel.get.mockResolvedValue({ enabled: true });
    const settings = await model.getSettings(projectA);
    expect(settings.get(owner.projectDbtSourceUuid)?.dbtProjectName).toBe(
        'actual_a',
    );
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

test.each(['delete', 'rollback'] as const)(
    'holds registry locks during cleanup until %s completes',
    async (mode) => {
        const owner = await createSource(projectA);
        const repository = await createRepository({
            credentialSourceUuid: owner.projectDbtSourceUuid,
        });
        const projectModel = new ProjectModel({
            database,
            lightdashConfig: lightdashConfigMock,
            encryptionUtil,
            featureFlagModel: featureFlagModel as never,
        });
        let releaseCleanup!: () => void;
        const release = new Promise<void>((resolve) => {
            releaseCleanup = resolve;
        });
        let started!: (pid: number) => void;
        const entered = new Promise<number>((resolve) => {
            started = resolve;
        });
        const deletion = projectModel
            .withDeletionLock([projectA], async (trx) => {
                if (!trx) throw new Error('Missing peer deletion transaction');
                const {
                    rows: [{ pid }],
                } = await trx.raw<{ rows: { pid: number }[] }>(
                    'SELECT pg_backend_pid() AS pid',
                );
                started(pid);
                await release;
                if (mode === 'rollback')
                    throw new Error('Synthetic cleanup failed');
                await projectModel.delete(projectA, trx, [projectA]);
            })
            .then(
                () => ({}),
                (error: unknown) => ({ error }),
            );
        let pending: Promise<{ result?: string; error?: unknown }> | undefined;
        try {
            const pid = await Promise.race([
                entered,
                deletion.then(() => {
                    throw new Error('Deletion ended before cleanup');
                }),
            ]);
            pending = model
                .addShared(organizationUuid, projectB, sharedInput(repository))
                .then(
                    (result) => ({ result }),
                    (error: unknown) => ({ error }),
                );
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
            releaseCleanup();
            await deletion;
            const outcome = await pending;
            if (mode === 'delete') {
                expect(outcome.error).toBeInstanceOf(NotFoundError);
                expect(await sources.getSources(projectB)).toHaveLength(0);
            } else {
                expect(outcome.result).toEqual(expect.any(String));
                expect(
                    await model.resolveConnection(projectB, repository),
                ).toEqual(connection);
            }
        } finally {
            releaseCleanup();
            await deletion;
            await pending;
        }
    },
);
