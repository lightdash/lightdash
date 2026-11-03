import { Ability } from '@casl/ability';
import {
    DbtProjectType,
    FeatureFlags,
    ForbiddenError,
    OrganizationMemberRole,
    ProjectType,
    RequestMethod,
    type AgentOnboardingRun,
    type PossibleAbilities,
    type SessionUser,
} from '@lightdash/common';
import {
    autoStartOnboardingAgentRun,
    type AutoStartOnboardingAgentRunArguments,
} from './autoStartOnboardingAgentRun';

const ORGANIZATION_UUID = '00000000-0000-0000-0000-000000000001';
const PROJECT_UUID = '00000000-0000-0000-0000-000000000002';
const USER_UUID = '00000000-0000-0000-0000-000000000004';
const RUN_UUID = '00000000-0000-0000-0000-000000000005';
const NOW = new Date('2026-11-02T10:00:00.000Z');

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

const run: AgentOnboardingRun = {
    agentOnboardingRunUuid: RUN_UUID,
    projectUuid: PROJECT_UUID,
    status: 'queued',
    stage: null,
    events: [],
    handoff: null,
    usage: null,
    files: [],
    errorMessage: null,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    startedAt: null,
    completedAt: null,
};

const customerProject = (projectUuid: string) => ({
    projectUuid,
    name: 'Project',
    type: ProjectType.DEFAULT,
    createdByUserUuid: null,
    createdByUserName: null,
    createdAt: NOW,
    upstreamProjectUuid: null,
    expiresAt: null,
    provisioningSource: null,
});

const buildArguments = (
    flags: Partial<Record<string, boolean>> = {},
    projects: Awaited<
        ReturnType<
            AutoStartOnboardingAgentRunArguments['projectModel']['getAllByOrganizationUuid']
        >
    > = [customerProject(PROJECT_UUID)],
) => {
    const getAllByOrganizationUuid = vi
        .fn<
            AutoStartOnboardingAgentRunArguments['projectModel']['getAllByOrganizationUuid']
        >()
        .mockResolvedValue(projects);
    const get = vi.fn<
        AutoStartOnboardingAgentRunArguments['featureFlagService']['get']
    >(async ({ featureFlagId }) => ({
        id: featureFlagId,
        enabled: flags[featureFlagId] ?? true,
    }));
    const getMissingInfrastructure = vi
        .fn<
            AutoStartOnboardingAgentRunArguments['onboardingAgentService']['getMissingInfrastructure']
        >()
        .mockReturnValue(null);
    const createRun = vi
        .fn<
            AutoStartOnboardingAgentRunArguments['onboardingAgentService']['createRun']
        >()
        .mockResolvedValue(run);
    const track =
        vi.fn<AutoStartOnboardingAgentRunArguments['analytics']['track']>();
    const args: AutoStartOnboardingAgentRunArguments = {
        user,
        projectUuid: PROJECT_UUID,
        projectType: ProjectType.DEFAULT,
        dbtProjectType: DbtProjectType.NONE,
        method: RequestMethod.WEB_APP,
        provisioningSource: undefined,
        featureFlagService: { get },
        projectModel: { getAllByOrganizationUuid },
        onboardingAgentService: { getMissingInfrastructure, createRun },
        analytics: { track },
    };
    return { args, createRun, getMissingInfrastructure, track };
};

const skipped = (reason: string) => ({
    event: 'onboarding_agent.auto_start_skipped',
    userId: USER_UUID,
    properties: {
        organizationId: ORGANIZATION_UUID,
        projectId: PROJECT_UUID,
        reason,
    },
});

describe('autoStartOnboardingAgentRun', () => {
    it('skips when the org already has another customer project', async () => {
        const mocks = buildArguments({}, [
            customerProject('00000000-0000-0000-0000-000000000009'),
            customerProject(PROJECT_UUID),
        ]);

        await autoStartOnboardingAgentRun(mocks.args);

        expect(mocks.createRun).not.toHaveBeenCalled();
        expect(mocks.track).toHaveBeenCalledExactlyOnceWith(
            skipped('not_first_project'),
        );
    });

    it('ignores the playground project when deciding the first project', async () => {
        const mocks = buildArguments({}, [
            {
                ...customerProject('00000000-0000-0000-0000-000000000009'),
                provisioningSource: 'playground',
            },
            customerProject(PROJECT_UUID),
        ]);

        await autoStartOnboardingAgentRun(mocks.args);

        expect(mocks.createRun).toHaveBeenCalledOnce();
    });

    it('starts a run for a dbt-less web app project when flags and infrastructure allow it', async () => {
        const mocks = buildArguments();

        await autoStartOnboardingAgentRun(mocks.args);

        expect(mocks.createRun).toHaveBeenCalledExactlyOnceWith({
            user,
            projectUuid: PROJECT_UUID,
        });
        expect(mocks.track).toHaveBeenCalledExactlyOnceWith({
            event: 'onboarding_agent.auto_started',
            userId: USER_UUID,
            properties: {
                organizationId: ORGANIZATION_UUID,
                projectId: PROJECT_UUID,
                agentOnboardingRunId: RUN_UUID,
            },
        });
    });

    it.each([
        ['a CLI-created project', { method: RequestMethod.CLI }],
        ['a dbt project', { dbtProjectType: DbtProjectType.GITHUB }],
        ['a preview project', { projectType: ProjectType.PREVIEW }],
        ['a playground project', { provisioningSource: 'playground' }],
    ])('ignores %s', async (_label, overrides) => {
        const mocks = buildArguments();

        await autoStartOnboardingAgentRun({ ...mocks.args, ...overrides });

        expect(mocks.createRun).not.toHaveBeenCalled();
        expect(mocks.track).not.toHaveBeenCalled();
    });

    it('does nothing outside the new onboarding', async () => {
        const mocks = buildArguments({ [FeatureFlags.NewOnboarding]: false });

        await autoStartOnboardingAgentRun(mocks.args);

        expect(mocks.createRun).not.toHaveBeenCalled();
        expect(mocks.track).not.toHaveBeenCalled();
    });

    it('skips when coding agent onboarding is disabled', async () => {
        const mocks = buildArguments({
            [FeatureFlags.CodingAgentOnboarding]: false,
        });

        await autoStartOnboardingAgentRun(mocks.args);

        expect(mocks.createRun).not.toHaveBeenCalled();
        expect(mocks.track).toHaveBeenCalledExactlyOnceWith(
            skipped('coding_agent_onboarding_disabled'),
        );
    });

    it('skips when the sandbox infrastructure is not configured', async () => {
        const mocks = buildArguments();
        mocks.getMissingInfrastructure.mockReturnValue(
            'Anthropic API key is not configured',
        );

        await autoStartOnboardingAgentRun(mocks.args);

        expect(mocks.createRun).not.toHaveBeenCalled();
        expect(mocks.track).toHaveBeenCalledExactlyOnceWith(
            skipped('infrastructure_missing'),
        );
    });

    it('skips when the user cannot manage the project', async () => {
        const mocks = buildArguments();
        mocks.createRun.mockRejectedValue(new ForbiddenError());

        await autoStartOnboardingAgentRun(mocks.args);

        expect(mocks.track).toHaveBeenCalledExactlyOnceWith(
            skipped('not_authorized'),
        );
    });

    it('rethrows unexpected errors', async () => {
        const mocks = buildArguments();
        mocks.createRun.mockRejectedValue(new Error('scheduler down'));

        await expect(autoStartOnboardingAgentRun(mocks.args)).rejects.toThrow(
            'scheduler down',
        );
    });
});
