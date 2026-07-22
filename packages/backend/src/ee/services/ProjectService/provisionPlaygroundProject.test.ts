import { Ability } from '@casl/ability';
import {
    FeatureFlags,
    OrganizationMemberRole,
    ProjectType,
    type OrganizationProject,
    type PossibleAbilities,
    type SessionUser,
} from '@lightdash/common';
import path from 'path';
import {
    provisionPlaygroundProject,
    type ProvisionPlaygroundProjectArguments,
} from './provisionPlaygroundProject';

const organizationUuid = '00000000-0000-0000-0000-000000000001';
const projectUuid = '00000000-0000-0000-0000-000000000002';
const now = new Date('2026-07-20T00:00:00Z');
const user = {
    userUuid: '00000000-0000-0000-0000-000000000003',
    organizationUuid,
    organizationName: 'Organization',
    organizationCreatedAt: now,
    email: 'admin@example.com',
    firstName: 'Admin',
    lastName: 'User',
    userId: 1,
    role: OrganizationMemberRole.ADMIN,
    ability: new Ability<PossibleAbilities>([
        { action: 'view', subject: 'Project' },
    ]),
    abilityRules: [],
    isTrackingAnonymized: false,
    isMarketingOptedIn: false,
    avatarUrl: null,
    avatarGradient: null,
    isSetupComplete: true,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    timezone: null,
} satisfies SessionUser;

const project = (source: string | null = null): OrganizationProject => ({
    projectUuid,
    name: 'Project',
    type: ProjectType.DEFAULT,
    provisioningSource: source,
    createdByUserUuid: user.userUuid,
    createdByUserName: 'Admin User',
    createdAt: now,
    upstreamProjectUuid: null,
    expiresAt: null,
});

const buildArguments = () => {
    const get = vi.fn(async () => ({
        id: FeatureFlags.NewOnboarding,
        enabled: true,
    }));
    const getAllByOrganizationUuid = vi.fn(
        async () => [] as OrganizationProject[],
    );
    const deleteProject = vi.fn(async () => undefined);
    const saveExploresToCache = vi.fn(async () => ({ cachedExploreUuids: [] }));
    const validatePlaygroundDatabase = vi.fn(async () => undefined);
    const canViewProject = vi.fn(() => true);
    const indexCatalog = vi.fn(async () => ({
        catalogInserts: [],
        catalogFieldMap: {},
        numberOfCategoriesApplied: 0,
    }));
    const getByOrganizationUuid = vi.fn(async () => ({
        ranQueryAt: null,
        shownSuccessAt: null,
        playgroundProjectDeletedAt: null,
    }));
    const onboardingModel = {
        getByOrganizationUuid,
        runInPlaygroundProvisioningLock: vi.fn(
            async (_organizationUuid, callback) => callback({} as never),
        ),
    } satisfies ProvisionPlaygroundProjectArguments['onboardingModel'];
    const runInPlaygroundProvisioningLock = vi.mocked(
        onboardingModel.runInPlaygroundProvisioningLock,
    );
    const createWithoutCompile = vi.fn(async () => ({
        project: { projectUuid },
        hasContentCopy: false,
    })) as unknown as ProvisionPlaygroundProjectArguments['projectService']['createWithoutCompile'];
    const track = vi.fn();
    return {
        args: {
            user,
            featureFlagService: { get },
            projectModel: {
                getAllByOrganizationUuid,
                delete: deleteProject,
                saveExploresToCache,
            },
            onboardingModel,
            projectService: { createWithoutCompile },
            catalogService: { indexCatalog },
            analytics: { track },
            canViewProject,
            playgroundDataDirectory: path.resolve(
                __dirname,
                '../../../../assets/playground',
            ),
            validatePlaygroundDatabase,
        } satisfies ProvisionPlaygroundProjectArguments,
        get,
        getAllByOrganizationUuid,
        deleteProject,
        saveExploresToCache,
        validatePlaygroundDatabase,
        canViewProject,
        indexCatalog,
        createWithoutCompile,
        runInPlaygroundProvisioningLock,
        track,
    };
};

describe('provisionPlaygroundProject', () => {
    it('rejects when the new onboarding flag is disabled', async () => {
        const mocks = buildArguments();
        mocks.get.mockResolvedValue({
            id: FeatureFlags.NewOnboarding,
            enabled: false,
        });
        await expect(provisionPlaygroundProject(mocks.args)).rejects.toThrow(
            'Playground projects are not available',
        );
        expect(mocks.getAllByOrganizationUuid).not.toHaveBeenCalled();
    });

    it('repairs an existing playground cache idempotently', async () => {
        const mocks = buildArguments();
        mocks.getAllByOrganizationUuid.mockResolvedValue([
            project('playground'),
        ]);
        await expect(provisionPlaygroundProject(mocks.args)).resolves.toEqual({
            projectUuid,
            created: false,
        });
        expect(mocks.createWithoutCompile).not.toHaveBeenCalled();
        expect(mocks.saveExploresToCache).toHaveBeenCalledWith(
            projectUuid,
            expect.any(Array),
        );
    });

    it('returns an existing real project without creating a playground', async () => {
        const mocks = buildArguments();
        mocks.getAllByOrganizationUuid.mockResolvedValue([project()]);
        await expect(provisionPlaygroundProject(mocks.args)).resolves.toEqual({
            projectUuid,
            created: false,
        });
        expect(mocks.createWithoutCompile).not.toHaveBeenCalled();
    });

    it('does not disclose an existing project the user cannot view', async () => {
        const mocks = buildArguments();
        mocks.getAllByOrganizationUuid.mockResolvedValue([project()]);

        mocks.canViewProject.mockReturnValue(false);

        await expect(provisionPlaygroundProject(mocks.args)).rejects.toThrow(
            'User does not have permission to view an existing project',
        );
        expect(mocks.createWithoutCompile).not.toHaveBeenCalled();
    });

    it('creates the playground and caches bundled explores', async () => {
        const mocks = buildArguments();
        await expect(provisionPlaygroundProject(mocks.args)).resolves.toEqual({
            projectUuid,
            created: true,
        });
        expect(mocks.createWithoutCompile).toHaveBeenCalledExactlyOnceWith(
            user,
            expect.objectContaining({
                warehouseConnection: expect.objectContaining({
                    dataset: 'jaffle_shop',
                }),
            }),
            expect.any(String),
            { source: 'playground' },
        );
        expect(mocks.saveExploresToCache).toHaveBeenCalledWith(
            projectUuid,
            expect.any(Array),
        );
        expect(mocks.indexCatalog).toHaveBeenCalledWith(
            projectUuid,
            user.userUuid,
        );
        expect(mocks.runInPlaygroundProvisioningLock).toHaveBeenCalledWith(
            organizationUuid,
            expect.any(Function),
        );
        expect(mocks.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'playground_project.provisioned',
            }),
        );
        expect(mocks.validatePlaygroundDatabase).toHaveBeenCalledWith(
            path.resolve(
                __dirname,
                '../../../../assets/playground/jaffle_shop.duckdb',
            ),
        );
    });

    it('resolves the bundled data directory independently of the backend cwd', async () => {
        const mocks = buildArguments();
        const previousDataDirectory = process.env.PLAYGROUND_DATA_DIR;
        delete process.env.PLAYGROUND_DATA_DIR;

        try {
            await provisionPlaygroundProject({
                ...mocks.args,
                playgroundDataDirectory: undefined,
            });
        } finally {
            if (previousDataDirectory === undefined) {
                delete process.env.PLAYGROUND_DATA_DIR;
            } else {
                process.env.PLAYGROUND_DATA_DIR = previousDataDirectory;
            }
        }

        expect(mocks.createWithoutCompile).toHaveBeenCalledWith(
            user,
            expect.objectContaining({
                warehouseConnection: expect.objectContaining({
                    dataset: 'jaffle_shop',
                }),
            }),
            expect.any(String),
            { source: 'playground' },
        );
    });

    it('still provisions when catalog indexing fails', async () => {
        const mocks = buildArguments();
        mocks.indexCatalog.mockRejectedValue(new Error('Catalog unavailable'));

        await expect(provisionPlaygroundProject(mocks.args)).resolves.toEqual({
            projectUuid,
            created: true,
        });
        expect(mocks.track).toHaveBeenCalledOnce();
    });

    it('does not create a project when bundle validation fails', async () => {
        const mocks = buildArguments();
        mocks.validatePlaygroundDatabase.mockRejectedValue(
            new Error('Invalid DuckDB bundle'),
        );

        await expect(provisionPlaygroundProject(mocks.args)).rejects.toThrow(
            'Invalid DuckDB bundle',
        );
        expect(mocks.createWithoutCompile).not.toHaveBeenCalled();
    });

    it('removes a newly created project when explore caching fails', async () => {
        const mocks = buildArguments();
        mocks.saveExploresToCache.mockRejectedValue(
            new Error('Cache unavailable'),
        );

        await expect(provisionPlaygroundProject(mocks.args)).rejects.toThrow(
            'Cache unavailable',
        );
        expect(mocks.deleteProject).toHaveBeenCalledWith(projectUuid);
        expect(mocks.track).not.toHaveBeenCalled();
    });
});
