import {
    defineUserAbility,
    ForbiddenError,
    OrganizationMemberRole,
    type SessionUser,
} from '@lightdash/common';
import { AiAgentService } from './AiAgentService';

vi.mock('../ai/AiAgentMcpRuntimeClient', () => ({
    AiAgentMcpRuntimeClient: vi
        .fn()
        // eslint-disable-next-line prefer-arrow-callback
        .mockImplementation(function MockAiAgentMcpRuntimeClient() {
            return {};
        }),
}));

const ORGANIZATION_UUID = 'org-uuid';
const PROJECT_UUID = 'project-uuid';
const AGENT_UUID = 'agent-uuid';

const buildUser = (role: OrganizationMemberRole): SessionUser =>
    ({
        userUuid: 'user-uuid',
        organizationUuid: ORGANIZATION_UUID,
        organizationName: 'Org',
        ability: defineUserAbility(
            {
                organizationUuid: ORGANIZATION_UUID,
                userUuid: 'user-uuid',
                role,
            },
            [],
        ),
    }) as unknown as SessionUser;

const agent = {
    uuid: AGENT_UUID,
    name: 'Test agent',
    organizationUuid: ORGANIZATION_UUID,
    projectUuid: PROJECT_UUID,
};

const buildService = () => {
    const aiAgentModel = {
        getAgent: vi.fn().mockResolvedValue(agent),
        appendInstruction: vi.fn().mockResolvedValue('updated instruction'),
    };
    const featureFlagService = {
        get: vi.fn().mockResolvedValue({ enabled: true }),
    };
    const service = new AiAgentService({
        aiAgentModel,
        featureFlagService,
        analytics: { track: vi.fn() },
        lightdashConfig: { ai: { copilot: {} } },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    // Grant view-level agent access to every test user; the tests exercise
    // the manage check on top of it.
    (
        service as unknown as { checkAgentAccess: () => Promise<boolean> }
    ).checkAgentAccess = vi.fn().mockResolvedValue(true);
    return { service, aiAgentModel };
};

describe('appendInstruction', () => {
    it('rejects users who can view but not manage the agent', async () => {
        const { service, aiAgentModel } = buildService();

        await expect(
            service.appendInstruction(
                buildUser(OrganizationMemberRole.VIEWER),
                PROJECT_UUID,
                AGENT_UUID,
                'extra instruction',
            ),
        ).rejects.toThrow(ForbiddenError);

        expect(aiAgentModel.appendInstruction).not.toHaveBeenCalled();
    });

    it('allows users who can manage the agent', async () => {
        const { service, aiAgentModel } = buildService();

        await expect(
            service.appendInstruction(
                buildUser(OrganizationMemberRole.DEVELOPER),
                PROJECT_UUID,
                AGENT_UUID,
                'extra instruction',
            ),
        ).resolves.toBe('updated instruction');

        expect(aiAgentModel.appendInstruction).toHaveBeenCalledWith({
            agentUuid: AGENT_UUID,
            instruction: 'extra instruction',
        });
    });
});
