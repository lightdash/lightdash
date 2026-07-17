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
    allowPersonal: false,
    createdByUserUuid: USER_UUID,
    createdAt: NOW,
    updatedAt: NOW,
});

const buildArguments = () => {
    const getFeatureFlag =
        vi.fn<
            ProvisionOnboardingHomepageArguments['featureFlagService']['get']
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

    const featureFlagService = { get: getFeatureFlag };
    const projectModel = { getAllByOrganizationUuid };
    const projectHomepageModel = {
        list: listHomepages,
        create: createHomepage,
        publish: publishHomepage,
    };

    vi.mocked(getFeatureFlag).mockImplementation(async ({ featureFlagId }) => ({
        id: featureFlagId,
        enabled: true,
    }));
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
        } satisfies ProvisionOnboardingHomepageArguments,
        getFeatureFlag: vi.mocked(getFeatureFlag),
        getAllByOrganizationUuid: vi.mocked(getAllByOrganizationUuid),
        listHomepages: vi.mocked(listHomepages),
        createHomepage: vi.mocked(createHomepage),
        publishHomepage: vi.mocked(publishHomepage),
    };
};

describe('provisionOnboardingHomepage', () => {
    it('skips provisioning when the homepage builder flag is disabled', async () => {
        const mocks = buildArguments();
        mocks.getFeatureFlag.mockImplementation(async ({ featureFlagId }) => ({
            id: featureFlagId,
            enabled: featureFlagId !== CommercialFeatureFlags.HomepageBuilder,
        }));

        await provisionOnboardingHomepage(mocks.args);

        expect(mocks.getAllByOrganizationUuid).not.toHaveBeenCalled();
        expect(mocks.listHomepages).not.toHaveBeenCalled();
        expect(mocks.createHomepage).not.toHaveBeenCalled();
        expect(mocks.publishHomepage).not.toHaveBeenCalled();
    });

    it('skips provisioning when the organization setup page flag is disabled', async () => {
        const mocks = buildArguments();
        mocks.getFeatureFlag.mockImplementation(async ({ featureFlagId }) => ({
            id: featureFlagId,
            enabled: featureFlagId !== FeatureFlags.NewOnboarding,
        }));

        await provisionOnboardingHomepage(mocks.args);

        expect(mocks.getAllByOrganizationUuid).not.toHaveBeenCalled();
        expect(mocks.listHomepages).not.toHaveBeenCalled();
        expect(mocks.createHomepage).not.toHaveBeenCalled();
        expect(mocks.publishHomepage).not.toHaveBeenCalled();
    });

    it('skips provisioning when the project already has a homepage', async () => {
        const mocks = buildArguments();
        mocks.listHomepages.mockResolvedValue([makeHomepage()]);

        await provisionOnboardingHomepage(mocks.args);

        expect(mocks.createHomepage).not.toHaveBeenCalled();
        expect(mocks.publishHomepage).not.toHaveBeenCalled();
    });

    it('skips provisioning when this is not the organization first project', async () => {
        const mocks = buildArguments();
        mocks.getAllByOrganizationUuid.mockResolvedValue([
            makeProject(PROJECT_UUID),
            makeProject(OTHER_PROJECT_UUID),
        ]);

        await provisionOnboardingHomepage(mocks.args);

        expect(mocks.listHomepages).not.toHaveBeenCalled();
        expect(mocks.createHomepage).not.toHaveBeenCalled();
        expect(mocks.publishHomepage).not.toHaveBeenCalled();
    });

    it('creates and publishes the onboarding homepage for the first project', async () => {
        const mocks = buildArguments();

        await provisionOnboardingHomepage(mocks.args);

        expect(mocks.getFeatureFlag).toHaveBeenCalledWith({
            user,
            featureFlagId: FeatureFlags.NewOnboarding,
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
        expect(mocks.publishHomepage).toHaveBeenCalledWith(
            HOMEPAGE_UUID,
            { type: 'everyone' },
            true,
        );
    });
});
