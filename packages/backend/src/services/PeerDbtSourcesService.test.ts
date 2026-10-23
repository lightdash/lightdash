import {
    ConflictError,
    DbtProjectType,
    defineUserAbility,
    FeatureFlags,
    ForbiddenError,
    OrganizationMemberRole,
    ParameterError,
    ProjectMemberRole,
    type Account,
    type AddSharedDbtSource,
    type PeerDbtSourceSettings,
    type ProjectDbtSourceSummary,
} from '@lightdash/common';
import { fromSession } from '../auth/account/account';
import { defaultSessionUser } from '../auth/account/account.mock';
import {
    getPeerDbtSourcesEnabled,
    withPeerDbtSourcesOperation,
} from '../utils/peerDbtSourcesOperation';
import { PeerDbtSourcesService } from './PeerDbtSourcesService';
import { ProjectDbtSourcesService } from './ProjectDbtSourcesService';

const organizationUuid = 'organization_a';
const projectUuid = 'project_a';
const sourceUuid = 'source_a';
const repositoryUuid = 'repository_a';
const sharedSource: AddSharedDbtSource = {
    dbtRepositoryUuid: repositoryUuid,
    name: 'source_b',
    warehouseConnectionUuid: null,
    membershipRole: 'publish',
    refreshPolicy: 'git_refresh',
};

const accountFor = (
    role: ProjectMemberRole,
    memberProjectUuid = projectUuid,
    memberOrganizationUuid = organizationUuid,
    organizationRole = OrganizationMemberRole.MEMBER,
): Account => {
    const user = {
        ...defaultSessionUser,
        role: organizationRole,
        roleUuid: undefined,
        organizationUuid: memberOrganizationUuid,
    };
    return fromSession(
        {
            ...user,
            ability: defineUserAbility(user, [
                {
                    projectUuid: memberProjectUuid,
                    userUuid: user.userUuid,
                    role,
                    roleUuid: undefined,
                },
            ]),
        },
        'session-cookie',
    );
};

const admin = accountFor(ProjectMemberRole.ADMIN);
const viewer = accountFor(ProjectMemberRole.VIEWER);
const source: ProjectDbtSourceSummary = {
    projectDbtSourceUuid: sourceUuid,
    name: 'source_a',
    isPrimary: false,
    precedence: 1,
    type: DbtProjectType.GITHUB,
    repository: 'fixture/repository_a',
    branch: 'main',
    projectSubPath: '/',
    warehouseLocation: { database: null, schema: null },
    hasCredentialError: false,
};
const settings: PeerDbtSourceSettings = {
    usesSharedCredentials: false,
    dbtRepositoryUuid: repositoryUuid,
    dbtProjectName: 'project_a',
    dbtProjectNameConflict: null,
    dbtProjectNameState: 'known',
    warehouseConnectionUuid: null,
    membershipRole: 'publish',
    refreshPolicy: 'git_refresh',
    repository: {
        dbtRepositoryUuid: repositoryUuid,
        provider: 'github',
        host: 'git.example.test',
        owner: 'fixture',
        name: 'repository_a',
        defaultBranch: 'main',
        dbtProjectName: 'project_a',
        createdByProjectUuid: projectUuid,
        isShared: true,
    },
};

const fixture = () => {
    const peers = {
        getSettings: vi.fn(async () => new Map([[sourceUuid, settings]])),
        updatePeer: vi.fn(async () => undefined),
        setShared: vi.fn(async () => undefined),
        listShared: vi.fn(async () => [settings.repository!]),
        addShared: vi.fn(async () => sourceUuid),
    };
    const projectModel = {
        getSummary: vi.fn(async () => ({ organizationUuid })),
        getDbtSourceIdentity: vi.fn(async () => ({
            dbtSourceUuid: 'primary_a',
            dbtSourceName: 'primary_a',
        })),
    };
    const projectDbtSourcesService = {
        getProjectDbtSources: vi.fn(
            async (_account: Account, _projectUuid: string) => [source],
        ),
    };
    const featureFlagModel = {
        get: vi.fn(async () => ({ enabled: true })),
    };
    const service = new PeerDbtSourcesService({
        projectModel: projectModel as never,
        projectDbtSourcesModel: { peers } as never,
        projectDbtSourcesService,
        featureFlagModel: featureFlagModel as never,
    });
    return {
        service,
        peers,
        projectModel,
        featureFlagModel,
        projectDbtSourcesService,
    };
};

type Fixture = ReturnType<typeof fixture>;
const actions: {
    name: string;
    invoke: (
        service: PeerDbtSourcesService,
        account: Account,
    ) => Promise<unknown>;
}[] = [
    {
        name: 'listPeers',
        invoke: (service, account) => service.listPeers(account, projectUuid),
    },
    {
        name: 'updatePeer',
        invoke: (service, account) =>
            service.updatePeer(account, projectUuid, sourceUuid, {
                dbtProjectName: 'project_b',
            }),
    },
    {
        name: 'setShared',
        invoke: (service, account) =>
            service.setShared(account, projectUuid, repositoryUuid, true),
    },
    {
        name: 'listShared',
        invoke: (service, account) => service.listShared(account, projectUuid),
    },
    {
        name: 'addShared',
        invoke: (service, account) =>
            service.addShared(account, projectUuid, sharedSource),
    },
];

const expectNoPeerAccess = ({ peers, projectDbtSourcesService }: Fixture) => {
    Object.values(peers).forEach((method) =>
        expect(method).not.toHaveBeenCalled(),
    );
    expect(
        projectDbtSourcesService.getProjectDbtSources,
    ).not.toHaveBeenCalled();
};

describe('PeerDbtSourcesService', () => {
    test.each(actions)(
        'runs $name inside one frozen enabled operation',
        async ({ invoke }) => {
            const f = fixture();
            f.featureFlagModel.get
                .mockResolvedValueOnce({ enabled: true })
                .mockResolvedValue({ enabled: false });
            const check = () => expect(getPeerDbtSourcesEnabled()).toBe(true);
            f.peers.getSettings.mockImplementationOnce(async () => {
                check();
                return new Map([[sourceUuid, settings]]);
            });
            f.peers.updatePeer.mockImplementationOnce(async () => {
                check();
            });
            f.peers.setShared.mockImplementationOnce(async () => {
                check();
            });
            f.peers.listShared.mockImplementationOnce(async () => {
                check();
                return [settings.repository!];
            });
            f.peers.addShared.mockImplementationOnce(async () => {
                check();
                return sourceUuid;
            });
            await invoke(f.service, admin);
            expect(f.featureFlagModel.get).toHaveBeenCalledOnce();
            expect(getPeerDbtSourcesEnabled()).toBe(false);
        },
    );

    test.each([true, false])(
        'reuses a parent snapshot of %s',
        async (enabled) => {
            const f = fixture();
            await withPeerDbtSourcesOperation(enabled, async () => {
                if (enabled) await f.service.listShared(admin, projectUuid);
                else
                    await expect(
                        f.service.listShared(admin, projectUuid),
                    ).rejects.toThrow(ForbiddenError);
            });
            expect(f.featureFlagModel.get).not.toHaveBeenCalled();
        },
    );

    test('resolves once across peer and additional-source services', async () => {
        const f = fixture();
        const nestedService = new ProjectDbtSourcesService({
            projectModel: {
                ...f.projectModel,
                get: async () => ({
                    dbtConnection: { type: DbtProjectType.NONE },
                }),
            } as never,
            projectDbtSourcesModel: {
                getSourcesForApi: async () => {
                    expect(getPeerDbtSourcesEnabled()).toBe(true);
                    return [];
                },
            } as never,
            featureFlagModel: f.featureFlagModel as never,
            featureFlagService: {} as never,
            dbtSourceRefCatalogModel: {} as never,
            githubAppInstallationsModel: {} as never,
            lightdashConfig: {} as never,
            analytics: {} as never,
        });
        f.projectDbtSourcesService.getProjectDbtSources.mockImplementation(
            (account, uuid) =>
                nestedService.getProjectDbtSources(account, uuid),
        );
        await f.service.listPeers(admin, projectUuid);
        expect(f.featureFlagModel.get).toHaveBeenCalledOnce();
    });

    test.each(actions)(
        'rejects $name while the flag is disabled before accessing sources',
        async ({ invoke }) => {
            const f = fixture();
            f.featureFlagModel.get.mockResolvedValue({ enabled: false });
            await expect(invoke(f.service, admin)).rejects.toThrow(
                ForbiddenError,
            );
            expectNoPeerAccess(f);
            expect(f.featureFlagModel.get).toHaveBeenCalledExactlyOnceWith({
                user: { organizationUuid },
                featureFlagId: FeatureFlags.PeerDbtSources,
            });
        },
    );

    test.each(actions)(
        'uses only the organization flag scope for $name',
        async ({ invoke }) => {
            const f = fixture();
            await invoke(f.service, admin);
            expect(f.featureFlagModel.get).toHaveBeenCalledExactlyOnceWith({
                user: { organizationUuid },
                featureFlagId: FeatureFlags.PeerDbtSources,
            });
        },
    );

    test.each([
        ['viewer', viewer],
        ['developer', accountFor(ProjectMemberRole.DEVELOPER)],
        [
            'admin of another project',
            accountFor(ProjectMemberRole.ADMIN, 'project_b'),
        ],
        [
            'admin of another organization',
            accountFor(
                ProjectMemberRole.ADMIN,
                'project_b',
                'organization_b',
                OrganizationMemberRole.ADMIN,
            ),
        ],
    ] as const)(
        'denies registry sharing to %s with real CASL rules',
        async (_name, account) => {
            const f = fixture();
            await expect(
                f.service.setShared(account, projectUuid, repositoryUuid, true),
            ).rejects.toThrow(ForbiddenError);
            expectNoPeerAccess(f);
            expect(f.featureFlagModel.get).not.toHaveBeenCalled();
        },
    );

    test.each([true, false])(
        'lets the owning project admin set sharing to %s',
        async (isShared) => {
            const f = fixture();
            await f.service.setShared(
                admin,
                projectUuid,
                repositoryUuid,
                isShared,
            );
            expect(f.peers.setShared).toHaveBeenCalledExactlyOnceWith(
                organizationUuid,
                projectUuid,
                repositoryUuid,
                isShared,
            );
        },
    );

    test('lets an organization admin manage the project', async () => {
        const f = fixture();
        const account = accountFor(
            ProjectMemberRole.VIEWER,
            'project_b',
            organizationUuid,
            OrganizationMemberRole.ADMIN,
        );
        await f.service.setShared(account, projectUuid, repositoryUuid, true);
        expect(f.peers.setShared).toHaveBeenCalledOnce();
    });

    test.each(
        actions.filter(({ name }) =>
            ['updatePeer', 'addShared'].includes(name),
        ),
    )(
        'denies $name to a developer with update Project but no manage Project',
        async ({ invoke }) => {
            const f = fixture();
            await expect(
                invoke(f.service, accountFor(ProjectMemberRole.DEVELOPER)),
            ).rejects.toThrow(ForbiddenError);
            expectNoPeerAccess(f);
        },
    );

    test('allows a project viewer to list peers and shared repositories', async () => {
        const f = fixture();
        await expect(f.service.listPeers(viewer, projectUuid)).resolves.toEqual(
            [{ ...source, peer: settings }],
        );
        await expect(
            f.service.listShared(viewer, projectUuid),
        ).resolves.toEqual([settings.repository]);
        expect(f.peers.listShared).toHaveBeenCalledExactlyOnceWith(
            organizationUuid,
        );
    });

    test.each(
        actions.filter(({ name }) =>
            ['listPeers', 'listShared'].includes(name),
        ),
    )(
        'denies $name to a viewer from another project and organization',
        async ({ invoke }) => {
            const f = fixture();
            await expect(
                invoke(
                    f.service,
                    accountFor(
                        ProjectMemberRole.VIEWER,
                        'project_b',
                        'organization_b',
                    ),
                ),
            ).rejects.toThrow(ForbiddenError);
            expectNoPeerAccess(f);
        },
    );

    test('passes the consuming project organization to addShared', async () => {
        const f = fixture();
        await expect(
            f.service.addShared(admin, projectUuid, sharedSource),
        ).resolves.toBe(sourceUuid);
        expect(f.peers.addShared).toHaveBeenCalledExactlyOnceWith(
            organizationUuid,
            projectUuid,
            sharedSource,
        );
    });

    test('preserves the model conflict naming the source and number of consuming projects', async () => {
        const f = fixture();
        const conflict = new ConflictError(
            'Cannot stop sharing source_a: 2 other projects use it',
        );
        f.peers.setShared.mockRejectedValue(conflict);
        await expect(
            f.service.setShared(admin, projectUuid, repositoryUuid, false),
        ).rejects.toBe(conflict);
    });

    test('rejects a shared source label that collides with the synthetic primary label', async () => {
        const f = fixture();
        await expect(
            f.service.addShared(admin, projectUuid, {
                ...sharedSource,
                name: 'primary_a',
            }),
        ).rejects.toThrow(ParameterError);
        expect(f.peers.addShared).not.toHaveBeenCalled();
    });
});
