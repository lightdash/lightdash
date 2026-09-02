import { Ability } from '@casl/ability';
import {
    FeatureFlags,
    ForbiddenError,
    OrganizationMemberRole,
    type PossibleAbilities,
    type SessionUser,
} from '@lightdash/common';
import { type LightdashConfig } from '../../../config/parseConfig';
import { type ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { type PersonalAccessTokenService } from '../../../services/PersonalAccessTokenService';
import { type PromptService } from '../../../services/PromptService/PromptService';
import { type UserService } from '../../../services/UserService';
import { type AgentOnboardingRunModel } from '../../models/AgentOnboardingRunModel';
import { type SandboxRegistryModel } from '../../models/SandboxRegistryModel';
import { type CommercialSchedulerClient } from '../../scheduler/SchedulerClient';
import { type OnboardingAgentFileStore } from './OnboardingAgentFileStore';
import { OnboardingAgentService } from './OnboardingAgentService';

const ORGANIZATION_UUID = '00000000-0000-0000-0000-000000000001';
const PROJECT_UUID = '00000000-0000-0000-0000-000000000002';
const USER_UUID = '00000000-0000-0000-0000-000000000003';
const NOW = new Date('2026-09-02T10:00:00.000Z');

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
    ability: new Ability<PossibleAbilities>([
        { action: 'view', subject: 'Project' },
    ]),
};

const buildService = (codingAgentEnabled: boolean) => {
    const getFeatureFlag = vi.fn().mockResolvedValue({
        id: FeatureFlags.CodingAgent,
        enabled: codingAgentEnabled,
    });
    const getProjectSummary = vi.fn().mockResolvedValue({
        organizationUuid: ORGANIZATION_UUID,
    });
    const findActiveRunForProject = vi.fn().mockResolvedValue(undefined);

    const dependencies = {
        lightdashConfig: {} as LightdashConfig,
        agentOnboardingRunModel: {
            findActiveRunForProject,
        } as unknown as AgentOnboardingRunModel,
        sandboxRegistryModel: {} as SandboxRegistryModel,
        projectModel: {
            getSummary: getProjectSummary,
        } as unknown as ProjectModel,
        personalAccessTokenService: {} as PersonalAccessTokenService,
        promptService: {} as PromptService,
        userService: {} as UserService,
        schedulerClient: {} as CommercialSchedulerClient,
        fileStore: {} as OnboardingAgentFileStore,
        featureFlagService: { get: getFeatureFlag },
    };

    return {
        service: new OnboardingAgentService(dependencies),
        getFeatureFlag,
        getProjectSummary,
        findActiveRunForProject,
    };
};

describe('OnboardingAgentService entitlement', () => {
    it('allows entitled organizations to access agent onboarding runs', async () => {
        const mocks = buildService(true);

        await expect(
            mocks.service.getActiveRun(user, PROJECT_UUID),
        ).resolves.toBeNull();

        expect(mocks.getFeatureFlag).toHaveBeenCalledExactlyOnceWith({
            user,
            featureFlagId: FeatureFlags.CodingAgent,
        });
        expect(mocks.findActiveRunForProject).toHaveBeenCalledExactlyOnceWith(
            PROJECT_UUID,
        );
    });

    it('blocks organizations without coding-agent entitlement from starting a run', async () => {
        const mocks = buildService(false);

        await expect(
            mocks.service.createRun({ user, projectUuid: PROJECT_UUID }),
        ).rejects.toThrow(
            new ForbiddenError('Coding agent onboarding is not available'),
        );

        expect(mocks.getProjectSummary).not.toHaveBeenCalled();
        expect(mocks.findActiveRunForProject).not.toHaveBeenCalled();
    });
});
