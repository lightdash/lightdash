import { Ability } from '@casl/ability';
import {
    FeatureFlags,
    OrganizationMemberRole,
    type PossibleAbilities,
    type SessionUser,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import Logger from '../../../logging/logger';
import {
    provisionOnboardingOrgFlags,
    type ProvisionOnboardingOrgFlagsArguments,
} from './provisionOnboardingOrgFlags';

vi.mock('@sentry/node', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@sentry/node')>();
    return {
        ...actual,
        captureException: vi.fn(),
    };
});

const ORGANIZATION_UUID = '00000000-0000-0000-0000-000000000001';
const USER_UUID = '00000000-0000-0000-0000-000000000002';
const NOW = new Date('2026-07-30T10:00:00.000Z');

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

const buildArguments = () => {
    const get =
        vi.fn<
            ProvisionOnboardingOrgFlagsArguments['featureFlagService']['get']
        >();
    const ensureOrganizationOverrideEnabled =
        vi.fn<
            ProvisionOnboardingOrgFlagsArguments['featureFlagService']['ensureOrganizationOverrideEnabled']
        >();
    const track =
        vi.fn<ProvisionOnboardingOrgFlagsArguments['analytics']['track']>();
    const findOrgHomepageSettings =
        vi.fn<
            ProvisionOnboardingOrgFlagsArguments['projectHomepageModel']['findOrgHomepageSettings']
        >();
    const upsertOrgHomepageSettings =
        vi.fn<
            ProvisionOnboardingOrgFlagsArguments['projectHomepageModel']['upsertOrgHomepageSettings']
        >();

    vi.mocked(get).mockImplementation(async ({ featureFlagId }) => ({
        id: featureFlagId,
        enabled: true,
    }));
    vi.mocked(ensureOrganizationOverrideEnabled).mockResolvedValue('enabled');
    vi.mocked(findOrgHomepageSettings).mockResolvedValue(null);
    vi.mocked(upsertOrgHomepageSettings).mockResolvedValue({
        organizationUuid: ORGANIZATION_UUID,
        enabled: true,
        opening: null,
    });

    return {
        args: {
            user,
            organizationUuid: ORGANIZATION_UUID,
            featureFlagService: {
                get,
                ensureOrganizationOverrideEnabled,
            },
            projectHomepageModel: {
                findOrgHomepageSettings,
                upsertOrgHomepageSettings,
            },
            analytics: { track },
        } satisfies ProvisionOnboardingOrgFlagsArguments,
        get: vi.mocked(get),
        ensureOrganizationOverrideEnabled: vi.mocked(
            ensureOrganizationOverrideEnabled,
        ),
        findOrgHomepageSettings: vi.mocked(findOrgHomepageSettings),
        upsertOrgHomepageSettings: vi.mocked(upsertOrgHomepageSettings),
        track: vi.mocked(track),
    };
};

describe('provisionOnboardingOrgFlags', () => {
    afterEach(() => {
        vi.clearAllMocks();
        vi.restoreAllMocks();
    });

    it('enables remaining onboarding flags and tracks their outcomes', async () => {
        const mocks = buildArguments();
        mocks.ensureOrganizationOverrideEnabled.mockResolvedValue(
            'kept_disabled',
        );

        await provisionOnboardingOrgFlags(mocks.args);

        expect(mocks.get).toHaveBeenCalledExactlyOnceWith({
            user,
            featureFlagId: FeatureFlags.NewOnboarding,
        });
        expect(mocks.ensureOrganizationOverrideEnabled).toHaveBeenCalledTimes(
            1,
        );
        expect(mocks.ensureOrganizationOverrideEnabled).toHaveBeenCalledWith({
            user,
            featureFlagId: FeatureFlags.CodingAgentOnboarding,
        });
        expect(mocks.upsertOrgHomepageSettings).toHaveBeenCalledExactlyOnceWith(
            ORGANIZATION_UUID,
            { enabled: true, opening: null },
        );
        expect(mocks.track).toHaveBeenCalledExactlyOnceWith({
            event: 'onboarding_org_flags.provisioned',
            userId: USER_UUID,
            properties: {
                organizationId: ORGANIZATION_UUID,
                onboardingFlow: 'new',
                homepageBuilderEnablement: 'enabled',
                codingAgentOnboardingEnablement: 'kept_disabled',
            },
        });
    });

    it('does not overwrite an org that already opted out of the homepage', async () => {
        const mocks = buildArguments();
        mocks.findOrgHomepageSettings.mockResolvedValue({
            organizationUuid: ORGANIZATION_UUID,
            enabled: false,
            opening: null,
        });

        await provisionOnboardingOrgFlags(mocks.args);

        expect(mocks.upsertOrgHomepageSettings).not.toHaveBeenCalled();
        expect(mocks.track).toHaveBeenCalledExactlyOnceWith({
            event: 'onboarding_org_flags.provisioned',
            userId: USER_UUID,
            properties: {
                organizationId: ORGANIZATION_UUID,
                onboardingFlow: 'new',
                homepageBuilderEnablement: 'kept_disabled',
                codingAgentOnboardingEnablement: 'enabled',
            },
        });
    });

    it('does nothing when new onboarding is disabled', async () => {
        const mocks = buildArguments();
        mocks.get.mockResolvedValue({
            id: FeatureFlags.NewOnboarding,
            enabled: false,
        });

        await provisionOnboardingOrgFlags(mocks.args);

        expect(mocks.ensureOrganizationOverrideEnabled).not.toHaveBeenCalled();
        expect(mocks.upsertOrgHomepageSettings).not.toHaveBeenCalled();
        expect(mocks.track).not.toHaveBeenCalled();
    });

    it('swallows an enablement failure and tracks the failed outcome', async () => {
        const error = new Error('Enable failed');
        const errorSpy = vi
            .spyOn(Logger, 'error')
            .mockImplementation(() => Logger);
        const mocks = buildArguments();
        mocks.ensureOrganizationOverrideEnabled.mockRejectedValue(error);

        await expect(
            provisionOnboardingOrgFlags(mocks.args),
        ).resolves.toBeUndefined();

        expect(mocks.ensureOrganizationOverrideEnabled).toHaveBeenCalledTimes(
            1,
        );
        expect(Sentry.captureException).toHaveBeenCalledExactlyOnceWith(error);
        expect(errorSpy).toHaveBeenCalledOnce();
        expect(mocks.track).toHaveBeenCalledExactlyOnceWith({
            event: 'onboarding_org_flags.provisioned',
            userId: USER_UUID,
            properties: {
                organizationId: ORGANIZATION_UUID,
                onboardingFlow: 'new',
                homepageBuilderEnablement: 'enabled',
                codingAgentOnboardingEnablement: 'failed',
            },
        });
    });
});
