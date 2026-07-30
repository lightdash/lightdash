import { Ability } from '@casl/ability';
import {
    ForbiddenError,
    OrganizationMemberRole,
    ParameterError,
    ProjectType,
    type PossibleAbilities,
    type ProjectSummary,
    type SessionAccount,
} from '@lightdash/common';
import {
    HomepageRecommendedActionSkipsService,
    type HomepageRecommendedActionSkipsServiceArguments,
} from './HomepageRecommendedActionSkipsService';

const ORGANIZATION_UUID = '00000000-0000-0000-0000-000000000001';
const OTHER_ORGANIZATION_UUID = '00000000-0000-0000-0000-000000000002';
const PROJECT_UUID = '00000000-0000-0000-0000-000000000003';
const USER_UUID = '00000000-0000-0000-0000-000000000004';
const NOW = new Date('2026-07-30T12:00:00.000Z');

const projectSummary = (
    organizationUuid = ORGANIZATION_UUID,
): ProjectSummary => ({
    name: 'Project',
    projectUuid: PROJECT_UUID,
    organizationUuid,
    type: ProjectType.DEFAULT,
    upstreamProjectUuid: undefined,
    createdByUserUuid: USER_UUID,
    provisioningSource: undefined,
});

const accountMethods = {
    isAuthenticated: () => true,
    isRegisteredUser: () => true,
    isAnonymousUser: () => false,
    isSessionUser: () => true,
    isJwtUser: () => false,
    isServiceAccount: () => false,
    isPatUser: () => false,
    isOauthUser: () => false,
};

const makeAccount = (
    rules: ConstructorParameters<typeof Ability<PossibleAbilities>>[0],
): SessionAccount => ({
    authentication: { type: 'session', source: 'test' },
    organization: {
        organizationUuid: ORGANIZATION_UUID,
        name: 'Organization',
        createdAt: NOW,
    },
    user: {
        type: 'registered',
        id: USER_UUID,
        userUuid: USER_UUID,
        email: 'admin@example.com',
        firstName: 'Admin',
        lastName: 'User',
        userId: 1,
        role: OrganizationMemberRole.ADMIN,
        isTrackingAnonymized: false,
        isMarketingOptedIn: false,
        avatarUrl: null,
        avatarGradient: null,
        isSetupComplete: true,
        isActive: true,
        createdAt: NOW,
        updatedAt: NOW,
        timezone: null,
        abilityRules: [],
        ability: new Ability<PossibleAbilities>(rules),
    },
    ...accountMethods,
});

type ModelMocks = import('vitest').Mocked<
    HomepageRecommendedActionSkipsServiceArguments['homepageRecommendedActionSkipsModel']
>;
type ProjectModelMocks = import('vitest').Mocked<
    HomepageRecommendedActionSkipsServiceArguments['projectModel']
>;

const makeService = ({
    model = {
        list: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
    },
    projectModel = {
        getSummary: vi.fn().mockResolvedValue(projectSummary()),
    },
}: {
    model?: ModelMocks;
    projectModel?: ProjectModelMocks;
} = {}) => ({
    model,
    projectModel,
    service: new HomepageRecommendedActionSkipsService({
        homepageRecommendedActionSkipsModel: model,
        projectModel,
    }),
});

const projectManager = makeAccount([
    {
        action: 'manage',
        subject: 'Project',
        conditions: {
            organizationUuid: ORGANIZATION_UUID,
            projectUuid: PROJECT_UUID,
        },
    },
]);

const organizationManager = makeAccount([
    {
        action: 'manage',
        subject: 'Project',
        conditions: { organizationUuid: ORGANIZATION_UUID },
    },
]);

const viewer = makeAccount([]);

describe('HomepageRecommendedActionSkipsService', () => {
    it('lists merged organization and project skips for a project context', async () => {
        const { model, projectModel, service } = makeService();
        model.list.mockResolvedValue(['connect-slack', 'add-semantic-layer']);

        await expect(
            service.list(projectManager, PROJECT_UUID),
        ).resolves.toEqual(['connect-slack', 'add-semantic-layer']);
        expect(projectModel.getSummary).toHaveBeenCalledWith(PROJECT_UUID);
        expect(model.list).toHaveBeenCalledWith({
            organizationUuid: ORGANIZATION_UUID,
            projectUuid: PROJECT_UUID,
        });
    });

    it('lists only organization skips for the null-project context', async () => {
        const { model, projectModel, service } = makeService();
        model.list.mockResolvedValue(['connect-source-control']);

        await expect(service.list(organizationManager, null)).resolves.toEqual([
            'connect-source-control',
        ]);
        expect(projectModel.getSummary).not.toHaveBeenCalled();
        expect(model.list).toHaveBeenCalledWith({
            organizationUuid: ORGANIZATION_UUID,
            projectUuid: null,
        });
    });

    it('rejects users without project manage access', async () => {
        const { model, service } = makeService();

        await expect(service.list(viewer, PROJECT_UUID)).rejects.toBeInstanceOf(
            ForbiddenError,
        );
        expect(model.list).not.toHaveBeenCalled();
    });

    it('rejects projects from another organization', async () => {
        const { model, service } = makeService({
            projectModel: {
                getSummary: vi
                    .fn()
                    .mockResolvedValue(projectSummary(OTHER_ORGANIZATION_UUID)),
            },
        });

        await expect(
            service.skip(projectManager, PROJECT_UUID, 'connect-slack'),
        ).rejects.toBeInstanceOf(ForbiddenError);
        expect(model.create).not.toHaveBeenCalled();
    });

    it('uses organization-level project manage access for the null-project context', async () => {
        const { model, projectModel, service } = makeService();

        await service.skip(organizationManager, null, 'connect-source-control');

        expect(projectModel.getSummary).not.toHaveBeenCalled();
        expect(model.create).toHaveBeenCalledWith({
            organizationUuid: ORGANIZATION_UUID,
            projectUuid: null,
            actionKey: 'connect-source-control',
            createdByUserUuid: USER_UUID,
        });
    });

    it('stores organization action skips in the null scope after project-context auth', async () => {
        const { model, projectModel, service } = makeService();

        await service.skip(
            projectManager,
            PROJECT_UUID,
            'connect-source-control',
        );

        expect(projectModel.getSummary).toHaveBeenCalledWith(PROJECT_UUID);
        expect(model.create).toHaveBeenCalledWith({
            organizationUuid: ORGANIZATION_UUID,
            projectUuid: null,
            actionKey: 'connect-source-control',
            createdByUserUuid: USER_UUID,
        });
    });

    it('requires a project context for project action skips', async () => {
        const { model, projectModel, service } = makeService();

        await expect(
            service.skip(organizationManager, null, 'add-semantic-layer'),
        ).rejects.toBeInstanceOf(ParameterError);
        expect(projectModel.getSummary).not.toHaveBeenCalled();
        expect(model.create).not.toHaveBeenCalled();
    });

    it('does not allow project-only managers to modify the null-project context', async () => {
        const { model, service } = makeService();

        await expect(
            service.unskip(projectManager, null, 'connect-slack'),
        ).rejects.toBeInstanceOf(ForbiddenError);
        expect(model.delete).not.toHaveBeenCalled();
    });

    it.each(['connect-warehouse', 'unknown-action'])(
        'rejects the non-skippable action key %s',
        async (actionKey) => {
            const { model, projectModel, service } = makeService();

            await expect(
                service.skip(organizationManager, null, actionKey),
            ).rejects.toBeInstanceOf(ParameterError);
            expect(projectModel.getSummary).not.toHaveBeenCalled();
            expect(model.create).not.toHaveBeenCalled();
        },
    );

    it('deletes organization action skips from the null scope after project-context auth', async () => {
        const { model, projectModel, service } = makeService();

        await service.unskip(projectManager, PROJECT_UUID, 'connect-slack');

        expect(projectModel.getSummary).toHaveBeenCalledWith(PROJECT_UUID);
        expect(model.delete).toHaveBeenCalledWith({
            organizationUuid: ORGANIZATION_UUID,
            projectUuid: null,
            actionKey: 'connect-slack',
        });
    });
});
