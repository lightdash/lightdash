import type { AiAgentWithContext, RegisteredAccount } from '@lightdash/common';
import { selectAgent } from '../ai/agents/agentSelector';
import { getModel } from '../ai/models';
import { AiRouterService } from './AiRouterService';

vi.mock('../ai/agents/agentSelector', () => ({
    selectAgent: vi.fn(),
}));

vi.mock('../ai/models', () => ({
    getModel: vi.fn(),
}));

const organizationUuid = 'org-uuid';
const projectUuid = 'project-uuid';
const userUuid = 'user-uuid';

const ability = {
    can: vi.fn(() => true),
    cannot: vi.fn(() => false),
    relevantRuleFor: vi.fn(() => undefined),
    rules: [],
};

const account = {
    isAnonymousUser: () => false,
    isServiceAccount: () => false,
    isRegisteredUser: () => true,
    isPatUser: () => true,
    isOauthUser: () => false,
    organization: { organizationUuid },
    user: {
        userUuid,
        id: userUuid,
        email: 'user@example.com',
        firstName: 'Test',
        lastName: 'User',
        role: 'member',
        ability,
    },
    authentication: { type: 'pat' },
} as unknown as RegisteredAccount;

const createCandidate = (
    overrides: Partial<AiAgentWithContext> & { uuid: string; name: string },
): AiAgentWithContext => ({
    uuid: overrides.uuid,
    projectUuid,
    organizationUuid,
    name: overrides.name,
    description: overrides.description ?? null,
    imageUrl: null,
    imageUrlSource: null,
    tags: overrides.tags ?? null,
    integrations: [],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    instruction: overrides.instruction ?? null,
    groupAccess: [],
    userAccess: [],
    spaceAccess: overrides.spaceAccess ?? [],
    enableDataAccess: true,
    enableSelfImprovement: true,
    enableContentTools: true,
    adminOnly: false,
    modelConfig: null,
    version: 1,
    context: overrides.context ?? {
        uuid: overrides.uuid,
        projectUuid,
        name: overrides.name,
        description: overrides.description ?? null,
        explores: [`${overrides.name.toLowerCase()}_explore`],
        verifiedQuestions: [`${overrides.name} question`],
        instruction: overrides.instruction ?? null,
    },
});

const makeService = ({
    candidates,
    routerEnabled = true,
    instruction = 'Route finance questions to @[Finance](agent-2)',
}: {
    candidates: AiAgentWithContext[];
    routerEnabled?: boolean;
    instruction?: string | null;
}) => {
    const analytics = { track: vi.fn() };
    const aiRouterModel = {
        findByOrganization: vi.fn().mockResolvedValue(
            routerEnabled
                ? {
                      routerUuid: 'router-uuid',
                      organizationUuid,
                      enabled: true,
                      projectUuids: [projectUuid],
                      createdAt: new Date(),
                      updatedAt: new Date(),
                  }
                : null,
        ),
        getLatestInstruction: vi.fn().mockResolvedValue(
            instruction
                ? {
                      instructionVersionUuid: 'instruction-version-uuid',
                      routerUuid: 'router-uuid',
                      projectUuid,
                      instruction,
                      taggedAgentUuids: ['agent-2'],
                      createdAt: new Date(),
                  }
                : null,
        ),
        createDecision: vi.fn().mockResolvedValue({
            decisionUuid: 'decision-uuid',
        }),
    };
    const aiAgentService = {
        getAvailableAgents: vi.fn().mockResolvedValue(candidates),
    };

    const service = new AiRouterService({
        analytics: analytics as never,
        lightdashConfig: { ai: { copilot: {} } } as never,
        aiRouterModel: aiRouterModel as never,
        aiAgentService: aiAgentService as never,
    });

    return { service, analytics, aiRouterModel, aiAgentService };
};

describe('AiRouterService', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        (getModel as import('vitest').Mock).mockReturnValue({
            model: 'mock-model',
        });
    });

    it('uses the latest routing instructions and accessible candidates', async () => {
        const candidates = [
            createCandidate({ uuid: 'agent-1', name: 'General' }),
            createCandidate({ uuid: 'agent-2', name: 'Finance' }),
        ];
        const { service, aiAgentService } = makeService({ candidates });

        (selectAgent as import('vitest').Mock).mockResolvedValue({
            selectedAgentUuid: 'agent-2',
            confidence: 'high',
            reasoning: 'Finance agent matches the request.',
            shouldSkipForwardingQuery: false,
        });

        const result = await service.routePromptToAgent(account, {
            prompt: 'show revenue by month',
            projectUuid,
            mode: 'mcp',
        });

        expect(aiAgentService.getAvailableAgents).toHaveBeenCalledWith(
            organizationUuid,
            userUuid,
            { aiRequireOAuth: true },
            { projectFilter: { projectUuid } },
        );
        expect(selectAgent).toHaveBeenCalledWith({
            model: 'mock-model',
            candidates,
            prompt: 'show revenue by month',
            instructions: 'Route finance questions to @[Finance](agent-2)',
        });
        expect(result.candidates).toEqual(candidates);
        expect(result.suggestedAgent.uuid).toBe('agent-2');
    });

    it('returns the sole accessible agent without router config', async () => {
        const onlyCandidate = createCandidate({
            uuid: 'agent-1',
            name: 'General',
        });
        const { service, aiRouterModel } = makeService({
            candidates: [onlyCandidate],
            routerEnabled: false,
        });

        const result = await service.routePromptToAgent(account, {
            prompt: 'show me recent orders',
            projectUuid,
            mode: 'mcp',
        });

        expect(result.suggestedAgent.uuid).toBe('agent-1');
        expect(result.confidence).toBe('high');
        expect(result.reasoning).toBe('Only one agent available');
        expect(selectAgent).not.toHaveBeenCalled();
        expect(aiRouterModel.findByOrganization).not.toHaveBeenCalled();
    });

    it('auto-selects low-confidence routes in mcp mode', async () => {
        const candidates = [
            createCandidate({ uuid: 'agent-1', name: 'General' }),
            createCandidate({ uuid: 'agent-2', name: 'Finance' }),
        ];
        const { service } = makeService({ candidates });

        (selectAgent as import('vitest').Mock).mockResolvedValue({
            selectedAgentUuid: 'agent-1',
            confidence: 'low',
            reasoning: 'General seems safest.',
            shouldSkipForwardingQuery: true,
        });

        const result = await service.routePromptToAgent(account, {
            prompt: 'what agents are available?',
            projectUuid,
            mode: 'mcp',
        });

        expect(result.suggestedAgent.uuid).toBe('agent-1');
        expect(result.confidence).toBe('low');
        expect(result.nextAction).toBe('create_thread');
        expect(result.shouldSkipForwardingQuery).toBe(true);
    });

    it('preserves web low-confidence behavior', async () => {
        const candidates = [
            createCandidate({ uuid: 'agent-1', name: 'General' }),
            createCandidate({ uuid: 'agent-2', name: 'Finance' }),
        ];
        const { service, aiRouterModel } = makeService({ candidates });

        (selectAgent as import('vitest').Mock).mockResolvedValue({
            selectedAgentUuid: 'agent-2',
            confidence: 'low',
            reasoning: 'Not fully certain.',
            shouldSkipForwardingQuery: false,
        });

        const result = await service.route(account, {
            prompt: 'show revenue by month',
            projectUuid,
        });

        expect(result.nextAction).toBe('show_picker');
        expect(result.decision.suggestedAgentUuid).toBe('agent-2');
        expect(aiRouterModel.createDecision).toHaveBeenCalledWith(
            expect.objectContaining({
                suggestedAgentUuid: 'agent-2',
                confidence: 'low',
                candidateAgentUuids: ['agent-1', 'agent-2'],
            }),
        );
    });

    it('requires at least two agents on the web route', async () => {
        const { service, aiRouterModel } = makeService({
            candidates: [createCandidate({ uuid: 'agent-1', name: 'General' })],
        });

        await expect(
            service.route(account, {
                prompt: 'show revenue by month',
                projectUuid,
            }),
        ).rejects.toThrow('AI router requires at least two accessible agents');
        expect(selectAgent).not.toHaveBeenCalled();
        expect(aiRouterModel.createDecision).not.toHaveBeenCalled();
    });
});
