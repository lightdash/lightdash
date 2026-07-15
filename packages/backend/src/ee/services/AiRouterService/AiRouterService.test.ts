import { Ability, AbilityBuilder } from '@casl/ability';
import {
    buildAbilityFromScopes,
    defineUserAbility,
    ForbiddenError,
    OrganizationMemberRole,
    ProjectMemberRole,
    type AiAgentWithContext,
    type MemberAbility,
    type RegisteredAccount,
} from '@lightdash/common';
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

const makeAccount = (userAbility: unknown): RegisteredAccount =>
    ({
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
            ability: userAbility,
        },
        authentication: { type: 'pat' },
    }) as unknown as RegisteredAccount;

const account = makeAccount(ability);

// Org base role `member` plus a project system role — no org-level AI grants.
const orgMemberProjectEditorAbility = defineUserAbility(
    {
        role: OrganizationMemberRole.MEMBER,
        organizationUuid,
        userUuid,
        roleUuid: undefined,
    },
    [
        {
            projectUuid,
            role: ProjectMemberRole.EDITOR,
            userUuid,
            roleUuid: undefined,
        },
    ],
);

// Org `member` with no project access anywhere.
const orgMemberOnlyAbility = defineUserAbility(
    {
        role: OrganizationMemberRole.MEMBER,
        organizationUuid,
        userUuid,
        roleUuid: undefined,
    },
    [],
);

// Project-level custom role holding only the agent view scopes.
const projectCustomRoleAbility = (() => {
    const builder = new AbilityBuilder<MemberAbility>(Ability);
    buildAbilityFromScopes(
        {
            projectUuid,
            userUuid,
            scopes: ['view:Project', 'view:AiAgent'],
            isEnterprise: true,
            organizationRole: OrganizationMemberRole.MEMBER,
        },
        builder,
    );
    return builder.build();
})();

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
    enableUserContext: false,
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
        upsert: vi.fn().mockResolvedValue({
            routerUuid: 'router-uuid',
            organizationUuid,
            enabled: true,
            projectUuids: [projectUuid],
            createdAt: new Date(),
            updatedAt: new Date(),
        }),
        getDecision: vi.fn().mockResolvedValue({
            decisionUuid: 'decision-uuid',
            routerUuid: 'router-uuid',
            userUuid,
            suggestedAgentUuid: 'agent-2',
            confidence: 'high',
            candidateAgentUuids: ['agent-1', 'agent-2'],
        }),
        commitDecision: vi.fn().mockResolvedValue(undefined),
    };
    const aiAgentService = {
        getAvailableAgents: vi.fn().mockResolvedValue(candidates),
    };

    const orgAiCopilotConfigResolver = {
        getCopilotConfig: vi.fn().mockResolvedValue({}),
    };

    const service = new AiRouterService({
        analytics: analytics as never,
        lightdashConfig: { ai: { copilot: {} } } as never,
        aiRouterModel: aiRouterModel as never,
        aiAgentService: aiAgentService as never,
        orgAiCopilotConfigResolver: orgAiCopilotConfigResolver as never,
    });

    return {
        service,
        analytics,
        aiRouterModel,
        aiAgentService,
        orgAiCopilotConfigResolver,
    };
};

describe('AiRouterService', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        (getModel as import('vitest').Mock).mockReturnValue({
            model: 'mock-model',
        });
    });

    it('allows users with AI agent view permission to read router config', async () => {
        const { service, aiRouterModel } = makeService({ candidates: [] });
        (ability.cannot as import('vitest').Mock).mockImplementation(
            (action, resource) =>
                action === 'manage' &&
                resource?.__caslSubjectType__ === 'OrganizationAiAgent',
        );

        const result = await service.getConfig(account);

        expect(result.enabled).toBe(true);
        expect(aiRouterModel.findByOrganization).toHaveBeenCalledWith(
            organizationUuid,
        );
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
            telemetry: { organizationUuid, projectUuid, userUuid },
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

    describe('permission guards', () => {
        const candidates = [
            createCandidate({ uuid: 'agent-1', name: 'General' }),
            createCandidate({ uuid: 'agent-2', name: 'Finance' }),
        ];

        const mockHighConfidenceSelection = () => {
            (selectAgent as import('vitest').Mock).mockResolvedValue({
                selectedAgentUuid: 'agent-2',
                confidence: 'high',
                reasoning: 'Finance agent matches the request.',
                shouldSkipForwardingQuery: false,
            });
        };

        it('lets an org member with a project system role read config, route, and commit', async () => {
            const memberAccount = makeAccount(orgMemberProjectEditorAbility);
            const { service, aiRouterModel } = makeService({ candidates });
            mockHighConfidenceSelection();

            const config = await service.getConfig(memberAccount);
            expect(config.enabled).toBe(true);

            const result = await service.route(memberAccount, {
                prompt: 'show revenue by month',
                projectUuid,
            });
            expect(result.decision.suggestedAgentUuid).toBe('agent-2');

            await service.commitDecision(memberAccount, 'decision-uuid', {
                chosenAgentUuid: 'agent-2',
                threadUuid: 'thread-uuid',
            });
            expect(aiRouterModel.commitDecision).toHaveBeenCalledWith(
                expect.objectContaining({
                    chosenAgentUuid: 'agent-2',
                    selectionMode: 'auto_routed',
                }),
            );
        });

        it('lets an org member with a project custom role holding view:AiAgent read config and route', async () => {
            const memberAccount = makeAccount(projectCustomRoleAbility);
            const { service } = makeService({ candidates });
            mockHighConfidenceSelection();

            const config = await service.getConfig(memberAccount);
            expect(config.enabled).toBe(true);

            const result = await service.route(memberAccount, {
                prompt: 'show revenue by month',
                projectUuid,
            });
            expect(result.decision.suggestedAgentUuid).toBe('agent-2');
        });

        it('rejects an org member with no agent access anywhere', async () => {
            const memberAccount = makeAccount(orgMemberOnlyAbility);
            const { service, aiAgentService } = makeService({ candidates });

            await expect(service.getConfig(memberAccount)).rejects.toThrow(
                ForbiddenError,
            );
            await expect(
                service.route(memberAccount, {
                    prompt: 'show revenue by month',
                    projectUuid,
                }),
            ).rejects.toThrow(ForbiddenError);
            await expect(
                service.commitDecision(memberAccount, 'decision-uuid', {
                    chosenAgentUuid: 'agent-2',
                    threadUuid: 'thread-uuid',
                }),
            ).rejects.toThrow(ForbiddenError);
            expect(aiAgentService.getAvailableAgents).not.toHaveBeenCalled();
        });

        it('rejects routing in a project the user has no access to', async () => {
            const memberAccount = makeAccount(orgMemberProjectEditorAbility);
            const { service, aiAgentService } = makeService({ candidates });

            await expect(
                service.route(memberAccount, {
                    prompt: 'show revenue by month',
                    projectUuid: 'other-project-uuid',
                }),
            ).rejects.toThrow(ForbiddenError);
            expect(aiAgentService.getAvailableAgents).not.toHaveBeenCalled();
        });

        it('keeps config writes admin-gated for org members with project roles', async () => {
            const memberAccount = makeAccount(orgMemberProjectEditorAbility);
            const { service, aiRouterModel } = makeService({ candidates });

            await expect(
                service.upsertConfig(memberAccount, {
                    enabled: true,
                    projectUuids: [projectUuid],
                }),
            ).rejects.toThrow(ForbiddenError);
            expect(aiRouterModel.upsert).not.toHaveBeenCalled();
        });

        it('rejects committing an agent that was not a routing candidate', async () => {
            const memberAccount = makeAccount(orgMemberProjectEditorAbility);
            const { service, aiRouterModel } = makeService({ candidates });

            await expect(
                service.commitDecision(memberAccount, 'decision-uuid', {
                    chosenAgentUuid: 'agent-not-a-candidate',
                    threadUuid: 'thread-uuid',
                }),
            ).rejects.toThrow(
                'Chosen agent was not among the routing candidates',
            );
            expect(aiRouterModel.commitDecision).not.toHaveBeenCalled();
        });
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
