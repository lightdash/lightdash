import { Ability } from '@casl/ability';
import {
    ForbiddenError,
    OrganizationMemberRole,
    type PossibleAbilities,
    type SessionUser,
} from '@lightdash/common';
import { AiAgentService } from './AiAgentService';

const mockOrganizationUuid = 'org-123';

const createMockUser = (
    overrides: Partial<SessionUser> & { ability: SessionUser['ability'] },
): SessionUser =>
    ({
        userUuid: 'user-123',
        organizationUuid: mockOrganizationUuid,
        organizationName: 'Test Org',
        role: OrganizationMemberRole.MEMBER,
        abilityRules: [],
        ...overrides,
    }) as SessionUser;

const adminAbility = new Ability<PossibleAbilities>([
    {
        subject: 'AiAgent',
        action: 'manage',
        conditions: { organizationUuid: mockOrganizationUuid },
    },
]);

const viewerAbility = new Ability<PossibleAbilities>([
    {
        subject: 'AiAgent',
        action: 'view',
        conditions: { organizationUuid: mockOrganizationUuid },
    },
]);

const createMockDependencies = (overrides: {
    featureFlagEnabled?: boolean;
    isEligibleForTrial?: boolean;
    aiAgentsVisible?: boolean;
}) => {
    const {
        featureFlagEnabled = true,
        isEligibleForTrial = false,
        aiAgentsVisible = true,
    } = overrides;

    return {
        featureFlagService: {
            get: jest.fn().mockResolvedValue({ enabled: featureFlagEnabled }),
        },
        aiOrganizationSettingsService: {
            isEligibleForTrial: jest.fn().mockResolvedValue(isEligibleForTrial),
            getSettings: jest.fn().mockResolvedValue({
                organizationUuid: mockOrganizationUuid,
                aiAgentsVisible,
                isCopilotEnabled: featureFlagEnabled || isEligibleForTrial,
                isTrial: isEligibleForTrial,
            }),
        },
        aiAgentModel: {
            findAllAgents: jest.fn().mockResolvedValue([]),
        },
        analytics: { track: jest.fn() },
        asyncQueryService: {},
        catalogService: {},
        catalogModel: {},
        changesetModel: {},
        searchModel: {},
        groupsModel: {},
        lightdashConfig: { ai: { copilot: { embeddingEnabled: false } } },
        openIdIdentityModel: {},
        projectService: {},
        schedulerClient: {},
        slackAuthenticationModel: {},
        slackClient: {},
        userAttributesModel: {},
        userModel: {},
        spaceService: {},
        projectModel: {},
        shareService: {},
    } as unknown as ConstructorParameters<typeof AiAgentService>[0];
};

describe('AiAgentService', () => {
    describe('listAgents - copilot and visibility checks', () => {
        it('should allow access when copilot is enabled and agents are visible', async () => {
            const deps = createMockDependencies({
                featureFlagEnabled: true,
                aiAgentsVisible: true,
            });
            const service = new AiAgentService(deps);
            const user = createMockUser({ ability: viewerAbility });

            const result = await service.listAgents(user);

            expect(result).toEqual([]);
            expect(deps.aiAgentModel.findAllAgents).toHaveBeenCalled();
        });

        it('should deny access when copilot flag is disabled and not eligible for trial', async () => {
            const deps = createMockDependencies({
                featureFlagEnabled: false,
                isEligibleForTrial: false,
            });
            const service = new AiAgentService(deps);
            const user = createMockUser({ ability: viewerAbility });

            await expect(service.listAgents(user)).rejects.toThrow(
                ForbiddenError,
            );
        });

        it('should allow access when copilot flag is disabled but eligible for trial', async () => {
            const deps = createMockDependencies({
                featureFlagEnabled: false,
                isEligibleForTrial: true,
                aiAgentsVisible: true,
            });
            const service = new AiAgentService(deps);
            const user = createMockUser({ ability: viewerAbility });

            const result = await service.listAgents(user);

            expect(result).toEqual([]);
        });

        it('should deny non-admin users when aiAgentsVisible is false', async () => {
            const deps = createMockDependencies({
                featureFlagEnabled: true,
                aiAgentsVisible: false,
            });
            const service = new AiAgentService(deps);
            const user = createMockUser({ ability: viewerAbility });

            await expect(service.listAgents(user)).rejects.toThrow(
                ForbiddenError,
            );
        });

        it('should allow admin users when aiAgentsVisible is false', async () => {
            const deps = createMockDependencies({
                featureFlagEnabled: true,
                aiAgentsVisible: false,
            });
            const service = new AiAgentService(deps);
            const user = createMockUser({ ability: adminAbility });

            const result = await service.listAgents(user);

            expect(result).toEqual([]);
            expect(deps.aiAgentModel.findAllAgents).toHaveBeenCalled();
        });

        it('should deny admin users when copilot is disabled and not eligible for trial', async () => {
            const deps = createMockDependencies({
                featureFlagEnabled: false,
                isEligibleForTrial: false,
            });
            const service = new AiAgentService(deps);
            const user = createMockUser({ ability: adminAbility });

            await expect(service.listAgents(user)).rejects.toThrow(
                ForbiddenError,
            );
        });
    });
});
