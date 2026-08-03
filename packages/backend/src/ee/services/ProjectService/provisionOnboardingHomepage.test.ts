import { Ability } from '@casl/ability';
import {
    buildOnboardingHomepageConfig,
    CommercialFeatureFlags,
    FeatureFlags,
    OrganizationMemberRole,
    ProjectType,
    type HomepageConfig,
    type OrganizationProject,
    type PossibleAbilities,
    type ProjectHomepage,
    type SessionUser,
} from '@lightdash/common';
import Logger from '../../../logging/logger';
import {
    provisionOnboardingHomepage,
    type ProvisionOnboardingHomepageArguments,
} from './provisionOnboardingHomepage';

const ORGANIZATION_UUID = '00000000-0000-0000-0000-000000000001';
const PROJECT_UUID = '00000000-0000-0000-0000-000000000002';
const OTHER_PROJECT_UUID = '00000000-0000-0000-0000-000000000003';
const USER_UUID = '00000000-0000-0000-0000-000000000004';
const HOMEPAGE_UUID = '00000000-0000-0000-0000-000000000005';
const NOW = new Date('2026-07-16T10:00:00.000Z');

const user: SessionUser = {
    userUuid: USER_UUID,
    email: 'admin@example.com',
    firstName: 'Admin',
    lastName: 'User',
    organizationUuid: ORGANIZATION_UUID,
    organizationName: 'Organization',
    organizationCreatedAt: NOW,
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
    ability: new Ability<PossibleAbilities>([]),
};

const makeProject = (projectUuid: string): OrganizationProject => ({
    projectUuid,
    name: 'Project',
    type: ProjectType.DEFAULT,
    createdByUserUuid: USER_UUID,
    createdByUserName: 'Admin User',
    createdAt: NOW,
    upstreamProjectUuid: null,
    expiresAt: null,
});

const makeHomepage = (
    draftConfig: HomepageConfig = buildOnboardingHomepageConfig(),
): ProjectHomepage => ({
    homepageUuid: HOMEPAGE_UUID,
    projectUuid: PROJECT_UUID,
    name: 'Getting started',
    draftConfig,
    publishedConfig: null,
    isDefault: true,
    createdByUserUuid: USER_UUID,
    createdAt: NOW,
    updatedAt: NOW,
});

const buildArguments = () => {
    const getFeatureFlag =
        vi.fn<
            ProvisionOnboardingHomepageArguments['featureFlagService']['get']
        >();
    const ensureOrganizationOverrideEnabled =
        vi.fn<
            ProvisionOnboardingHomepageArguments['featureFlagService']['ensureOrganizationOverrideEnabled']
        >();
    const getAllByOrganizationUuid =
        vi.fn<
            ProvisionOnboardingHomepageArguments['projectModel']['getAllByOrganizationUuid']
        >();
    const listHomepages =
        vi.fn<
            ProvisionOnboardingHomepageArguments['projectHomepageModel']['list']
        >();
    const createHomepage =
        vi.fn<
            ProvisionOnboardingHomepageArguments['projectHomepageModel']['create']
        >();
    const publishHomepage =
        vi.fn<
            ProvisionOnboardingHomepageArguments['projectHomepageModel']['publish']
        >();
    const track =
        vi.fn<ProvisionOnboardingHomepageArguments['analytics']['track']>();
    const findOrgHomepageSettings = vi
        .fn<
            ProvisionOnboardingHomepageArguments['projectHomepageModel']['findOrgHomepageSettings']
        >()
        .mockResolvedValue(null);

    const featureFlagService = {
        get: getFeatureFlag,
        ensureOrganizationOverrideEnabled,
    };
    const projectModel = { getAllByOrganizationUuid };
    const projectHomepageModel = {
        list: listHomepages,
        create: createHomepage,
        publish: publishHomepage,
        findOrgHomepageSettings,
    };
    const analytics = { track };

    vi.mocked(getFeatureFlag).mockImplementation(async ({ featureFlagId }) => ({
        id: featureFlagId,
        enabled: true,
    }));
    vi.mocked(ensureOrganizationOverrideEnabled).mockResolvedValue('enabled');
    vi.mocked(getAllByOrganizationUuid).mockResolvedValue([
        makeProject(PROJECT_UUID),
    ]);
    vi.mocked(listHomepages).mockResolvedValue([]);
    vi.mocked(createHomepage).mockResolvedValue(makeHomepage());
    vi.mocked(publishHomepage).mockResolvedValue(makeHomepage());

    return {
        args: {
            user,
            projectUuid: PROJECT_UUID,
            projectType: ProjectType.DEFAULT,
            featureFlagService,
            projectModel,
            projectHomepageModel,
            analytics,
        } satisfies ProvisionOnboardingHomepageArguments,
        getFeatureFlag: vi.mocked(getFeatureFlag),
        ensureOrganizationOverrideEnabled: vi.mocked(
            ensureOrganizationOverrideEnabled,
        ),
        getAllByOrganizationUuid: vi.mocked(getAllByOrganizationUuid),
        listHomepages: vi.mocked(listHomepages),
        createHomepage: vi.mocked(createHomepage),
        publishHomepage: vi.mocked(publishHomepage),
        findOrgHomepageSettings: vi.mocked(findOrgHomepageSettings),
        track: vi.mocked(track),
    };
};

describe('provisionOnboardingHomepage', () => {
    it('skips provisioning when the organization kept the homepage builder flag disabled', async () => {
        const mocks = buildArguments();
        mocks.ensureOrganizationOverrideEnabled.mockResolvedValue(
            'kept_disabled',
        );
        mocks.getFeatureFlag.mockImplementation(async ({ featureFlagId }) => ({
            id: featureFlagId,
            enabled: featureFlagId !== CommercialFeatureFlags.HomepageBuilder,
        }));

        await provisionOnboardingHomepage(mocks.args);

        expect(mocks.ensureOrganizationOverrideEnabled).toHaveBeenCalledTimes(
            2,
        );
        expect(mocks.ensureOrganizationOverrideEnabled).toHaveBeenCalledWith({
            user,
            featureFlagId: CommercialFeatureFlags.HomepageBuilder,
        });
        expect(mocks.ensureOrganizationOverrideEnabled).toHaveBeenCalledWith({
            user,
            featureFlagId: FeatureFlags.CodingAgentOnboarding,
        });
        expect(mocks.listHomepages).not.toHaveBeenCalled();
        expect(mocks.createHomepage).not.toHaveBeenCalled();
        expect(mocks.publishHomepage).not.toHaveBeenCalled();
        expect(mocks.track).toHaveBeenCalledExactlyOnceWith({
            event: 'onboarding_homepage.skipped',
            userId: USER_UUID,
            properties: {
                organizationId: ORGANIZATION_UUID,
                projectId: PROJECT_UUID,
                onboardingFlow: 'new',
                homepageBuilderEnablement: 'kept_disabled',
                codingAgentOnboardingEnablement: 'kept_disabled',
                reason: 'homepage_builder_flag_disabled',
            },
        });
    });

    it('skips provisioning when enabling the homepage builder flag fails and the flag stays disabled', async () => {
        const mocks = buildArguments();
        mocks.ensureOrganizationOverrideEnabled.mockRejectedValue(
            new Error('Enable failed'),
        );
        mocks.getFeatureFlag.mockImplementation(async ({ featureFlagId }) => ({
            id: featureFlagId,
            enabled: featureFlagId !== CommercialFeatureFlags.HomepageBuilder,
        }));

        await provisionOnboardingHomepage(mocks.args);

        expect(mocks.createHomepage).not.toHaveBeenCalled();
        expect(mocks.publishHomepage).not.toHaveBeenCalled();
        expect(mocks.track).toHaveBeenCalledExactlyOnceWith({
            event: 'onboarding_homepage.skipped',
            userId: USER_UUID,
            properties: {
                organizationId: ORGANIZATION_UUID,
                projectId: PROJECT_UUID,
                onboardingFlow: 'new',
                homepageBuilderEnablement: 'failed',
                codingAgentOnboardingEnablement: 'failed',
                reason: 'homepage_builder_flag_disabled',
            },
        });
    });

    it('skips provisioning when the organization setup page flag is disabled', async () => {
        const mocks = buildArguments();
        mocks.getFeatureFlag.mockImplementation(async ({ featureFlagId }) => ({
            id: featureFlagId,
            enabled: featureFlagId !== FeatureFlags.NewOnboarding,
        }));

        await provisionOnboardingHomepage(mocks.args);

        expect(mocks.getAllByOrganizationUuid).not.toHaveBeenCalled();
        expect(mocks.ensureOrganizationOverrideEnabled).not.toHaveBeenCalled();
        expect(mocks.listHomepages).not.toHaveBeenCalled();
        expect(mocks.createHomepage).not.toHaveBeenCalled();
        expect(mocks.publishHomepage).not.toHaveBeenCalled();
        expect(mocks.track).toHaveBeenCalledExactlyOnceWith({
            event: 'onboarding_homepage.skipped',
            userId: USER_UUID,
            properties: {
                organizationId: ORGANIZATION_UUID,
                projectId: PROJECT_UUID,
                onboardingFlow: 'legacy',
                homepageBuilderEnablement: null,
                codingAgentOnboardingEnablement: null,
                reason: 'new_onboarding_flag_disabled',
            },
        });
    });

    it('skips provisioning when the project already has a homepage', async () => {
        const mocks = buildArguments();
        mocks.listHomepages.mockResolvedValue([makeHomepage()]);

        await provisionOnboardingHomepage(mocks.args);

        expect(mocks.createHomepage).not.toHaveBeenCalled();
        expect(mocks.publishHomepage).not.toHaveBeenCalled();
        expect(mocks.track).toHaveBeenCalledExactlyOnceWith({
            event: 'onboarding_homepage.skipped',
            userId: USER_UUID,
            properties: {
                organizationId: ORGANIZATION_UUID,
                projectId: PROJECT_UUID,
                onboardingFlow: 'new',
                homepageBuilderEnablement: 'enabled',
                codingAgentOnboardingEnablement: 'enabled',
                reason: 'homepage_already_exists',
            },
        });
    });

    it('skips provisioning for a non-playground project when this is not the organization first project', async () => {
        const mocks = buildArguments();
        mocks.getAllByOrganizationUuid.mockResolvedValue([
            makeProject(PROJECT_UUID),
            makeProject(OTHER_PROJECT_UUID),
        ]);

        await provisionOnboardingHomepage(mocks.args);

        expect(mocks.ensureOrganizationOverrideEnabled).not.toHaveBeenCalled();
        expect(mocks.listHomepages).not.toHaveBeenCalled();
        expect(mocks.createHomepage).not.toHaveBeenCalled();
        expect(mocks.publishHomepage).not.toHaveBeenCalled();
        expect(mocks.track).toHaveBeenCalledExactlyOnceWith({
            event: 'onboarding_homepage.skipped',
            userId: USER_UUID,
            properties: {
                organizationId: ORGANIZATION_UUID,
                projectId: PROJECT_UUID,
                onboardingFlow: 'new',
                homepageBuilderEnablement: null,
                codingAgentOnboardingEnablement: null,
                reason: 'not_first_project',
            },
        });
    });

    it('provisions a playground project when this is not the organization first project', async () => {
        const mocks = buildArguments();
        mocks.getAllByOrganizationUuid.mockResolvedValue([
            makeProject(PROJECT_UUID),
            makeProject(OTHER_PROJECT_UUID),
        ]);

        await provisionOnboardingHomepage({
            ...mocks.args,
            provisioningSource: 'playground',
        });

        expect(mocks.createHomepage).toHaveBeenCalledWith({
            projectUuid: PROJECT_UUID,
            name: 'Getting started',
            draftConfig: buildOnboardingHomepageConfig(),
            createdByUserUuid: USER_UUID,
        });
        expect(mocks.publishHomepage).toHaveBeenCalledWith(HOMEPAGE_UUID, {
            type: 'everyone',
        });
        expect(mocks.track).toHaveBeenCalledExactlyOnceWith({
            event: 'onboarding_homepage.provisioned',
            userId: USER_UUID,
            properties: {
                organizationId: ORGANIZATION_UUID,
                projectId: PROJECT_UUID,
                homepageUuid: HOMEPAGE_UUID,
                onboardingFlow: 'new',
                homepageBuilderEnablement: 'enabled',
                codingAgentOnboardingEnablement: 'enabled',
            },
        });
    });

    it('emits no event for non-default projects', async () => {
        const mocks = buildArguments();

        await provisionOnboardingHomepage({
            ...mocks.args,
            projectType: ProjectType.PREVIEW,
        });

        expect(mocks.getFeatureFlag).not.toHaveBeenCalled();
        expect(mocks.ensureOrganizationOverrideEnabled).not.toHaveBeenCalled();
        expect(mocks.track).not.toHaveBeenCalled();
    });

    it('tracks a failure and rethrows when homepage creation fails', async () => {
        const mocks = buildArguments();
        mocks.createHomepage.mockRejectedValue(
            new Error('Homepage creation failed'),
        );

        await expect(provisionOnboardingHomepage(mocks.args)).rejects.toThrow(
            'Homepage creation failed',
        );

        expect(mocks.publishHomepage).not.toHaveBeenCalled();
        expect(mocks.track).toHaveBeenCalledExactlyOnceWith({
            event: 'onboarding_homepage.failed',
            userId: USER_UUID,
            properties: {
                organizationId: ORGANIZATION_UUID,
                projectId: PROJECT_UUID,
                onboardingFlow: 'new',
                homepageBuilderEnablement: 'enabled',
                codingAgentOnboardingEnablement: 'enabled',
                errorType: 'Error',
            },
        });
    });

    it('tracks a failure and rethrows when publishing fails', async () => {
        const mocks = buildArguments();
        mocks.publishHomepage.mockRejectedValue(new Error('Publish failed'));

        await expect(provisionOnboardingHomepage(mocks.args)).rejects.toThrow(
            'Publish failed',
        );

        expect(mocks.track).toHaveBeenCalledExactlyOnceWith({
            event: 'onboarding_homepage.failed',
            userId: USER_UUID,
            properties: {
                organizationId: ORGANIZATION_UUID,
                projectId: PROJECT_UUID,
                onboardingFlow: 'new',
                homepageBuilderEnablement: 'enabled',
                codingAgentOnboardingEnablement: 'enabled',
                errorType: 'Error',
            },
        });
    });

    it('enables the homepage builder flag and provisions the homepage for the first project', async () => {
        const mocks = buildArguments();

        await provisionOnboardingHomepage(mocks.args);

        expect(mocks.getFeatureFlag).toHaveBeenCalledWith({
            user,
            featureFlagId: FeatureFlags.NewOnboarding,
        });
        expect(mocks.ensureOrganizationOverrideEnabled).toHaveBeenCalledTimes(
            2,
        );
        expect(mocks.ensureOrganizationOverrideEnabled).toHaveBeenCalledWith({
            user,
            featureFlagId: CommercialFeatureFlags.HomepageBuilder,
        });
        expect(mocks.ensureOrganizationOverrideEnabled).toHaveBeenCalledWith({
            user,
            featureFlagId: FeatureFlags.CodingAgentOnboarding,
        });
        expect(mocks.getFeatureFlag).toHaveBeenCalledWith({
            user,
            featureFlagId: CommercialFeatureFlags.HomepageBuilder,
        });
        expect(mocks.getAllByOrganizationUuid).toHaveBeenCalledWith(
            ORGANIZATION_UUID,
        );
        expect(mocks.listHomepages).toHaveBeenCalledWith(PROJECT_UUID);
        expect(mocks.createHomepage).toHaveBeenCalledWith({
            projectUuid: PROJECT_UUID,
            name: 'Getting started',
            draftConfig: buildOnboardingHomepageConfig(),
            createdByUserUuid: USER_UUID,
        });
        expect(mocks.publishHomepage).toHaveBeenCalledWith(HOMEPAGE_UUID, {
            type: 'everyone',
        });
        expect(mocks.track).toHaveBeenCalledExactlyOnceWith({
            event: 'onboarding_homepage.provisioned',
            userId: USER_UUID,
            properties: {
                organizationId: ORGANIZATION_UUID,
                projectId: PROJECT_UUID,
                homepageUuid: HOMEPAGE_UUID,
                onboardingFlow: 'new',
                homepageBuilderEnablement: 'enabled',
                codingAgentOnboardingEnablement: 'enabled',
            },
        });
    });

    it('provisions the content-first homepage when the org chose that opening', async () => {
        const mocks = buildArguments();
        mocks.findOrgHomepageSettings.mockResolvedValue({
            organizationUuid: ORGANIZATION_UUID,
            enabled: true,
            opening: 'content-first',
        });

        await provisionOnboardingHomepage(mocks.args);

        expect(mocks.createHomepage).toHaveBeenCalledWith({
            projectUuid: PROJECT_UUID,
            name: 'Getting started',
            draftConfig: buildOnboardingHomepageConfig('content-first'),
            createdByUserUuid: USER_UUID,
        });
    });

    it('provisions when the flag was already enabled for the organization', async () => {
        const mocks = buildArguments();
        mocks.ensureOrganizationOverrideEnabled.mockResolvedValue(
            'already_enabled',
        );

        await provisionOnboardingHomepage(mocks.args);

        expect(mocks.createHomepage).toHaveBeenCalled();
        expect(mocks.publishHomepage).toHaveBeenCalled();
        expect(mocks.track).toHaveBeenCalledExactlyOnceWith({
            event: 'onboarding_homepage.provisioned',
            userId: USER_UUID,
            properties: {
                organizationId: ORGANIZATION_UUID,
                projectId: PROJECT_UUID,
                homepageUuid: HOMEPAGE_UUID,
                onboardingFlow: 'new',
                homepageBuilderEnablement: 'already_enabled',
                codingAgentOnboardingEnablement: 'already_enabled',
            },
        });
    });

    it('provisions when coding agent onboarding enablement fails', async () => {
        const errorSpy = vi
            .spyOn(Logger, 'error')
            .mockImplementation(() => Logger);
        try {
            const mocks = buildArguments();
            mocks.ensureOrganizationOverrideEnabled.mockImplementation(
                async ({ featureFlagId }) => {
                    if (featureFlagId === FeatureFlags.CodingAgentOnboarding) {
                        throw new Error('Enable failed');
                    }
                    return 'enabled';
                },
            );

            await provisionOnboardingHomepage(mocks.args);

            expect(mocks.createHomepage).toHaveBeenCalled();
            expect(mocks.publishHomepage).toHaveBeenCalled();
            expect(mocks.track).toHaveBeenCalledExactlyOnceWith({
                event: 'onboarding_homepage.provisioned',
                userId: USER_UUID,
                properties: {
                    organizationId: ORGANIZATION_UUID,
                    projectId: PROJECT_UUID,
                    homepageUuid: HOMEPAGE_UUID,
                    onboardingFlow: 'new',
                    homepageBuilderEnablement: 'enabled',
                    codingAgentOnboardingEnablement: 'failed',
                },
            });
            expect(errorSpy).toHaveBeenCalled();
        } finally {
            errorSpy.mockRestore();
        }
    });

    it('provisions when coding agent onboarding remains disabled', async () => {
        const mocks = buildArguments();
        mocks.ensureOrganizationOverrideEnabled.mockImplementation(
            async ({ featureFlagId }) =>
                featureFlagId === FeatureFlags.CodingAgentOnboarding
                    ? 'kept_disabled'
                    : 'enabled',
        );

        await provisionOnboardingHomepage(mocks.args);

        expect(mocks.createHomepage).toHaveBeenCalled();
        expect(mocks.publishHomepage).toHaveBeenCalled();
        expect(mocks.track).toHaveBeenCalledExactlyOnceWith({
            event: 'onboarding_homepage.provisioned',
            userId: USER_UUID,
            properties: {
                organizationId: ORGANIZATION_UUID,
                projectId: PROJECT_UUID,
                homepageUuid: HOMEPAGE_UUID,
                onboardingFlow: 'new',
                homepageBuilderEnablement: 'enabled',
                codingAgentOnboardingEnablement: 'kept_disabled',
            },
        });
    });
});
