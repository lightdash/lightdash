import { type AiAgentWithContext } from '@lightdash/common';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { selectAgent, type RouterDecision } from '../ai/agents/agentSelector';
import { type AiDecisionClient } from '../ai/decisions/AiDecisionClient';
import { AiAgentService } from './AiAgentService';

vi.mock('../ai/agents/agentSelector', () => ({ selectAgent: vi.fn() }));
vi.mock('../ai/models', () => ({ getModel: () => ({ model: 'test-model' }) }));

const availableAgents = [
    { uuid: 'sales', name: 'Sales', projectUuid: 'project-a' },
    { uuid: 'finance', name: 'Finance', projectUuid: 'project-a' },
] as AiAgentWithContext[];

type RouterModelMock = {
    findByOrganization: () => Promise<{ routerUuid: string } | null>;
    getLatestInstruction: (args: {
        projectUuid: string;
    }) => Promise<{ instruction: string } | null>;
};

const routerWith = (instructions: Record<string, string>): RouterModelMock => ({
    findByOrganization: async () => ({ routerUuid: 'router' }),
    getLatestInstruction: async ({ projectUuid }) =>
        instructions[projectUuid]
            ? { instruction: instructions[projectUuid] }
            : null,
});

const decision: RouterDecision = {
    selectedAgentUuid: 'finance',
    confidence: 'high',
    shouldSkipForwardingQuery: false,
    reasoning: 'Revenue belongs to Finance.',
};

describe('Slack automatic agent routing', () => {
    const route = async (
        fast: boolean,
        selection: Partial<RouterDecision> = {},
        aiRouterModel: RouterModelMock = routerWith({}),
        agents: AiAgentWithContext[] = availableAgents,
    ) => {
        const service = new AiAgentService({
            lightdashConfig: lightdashConfigMock,
            orgAiCopilotConfigResolver: { getCopilotConfig: async () => ({}) },
            aiRouterModel,
            projectModel: {
                getSummary: async (projectUuid: string) => ({
                    name: `Name of ${projectUuid}`,
                }),
            },
        } as unknown as ConstructorParameters<typeof AiAgentService>[0]);
        vi.spyOn(service, 'getDecisionClient').mockResolvedValue(
            fast ? ({} as AiDecisionClient) : undefined,
        );
        const picker = vi
            .spyOn(
                service as unknown as {
                    showAgentSelectionUI: (args: unknown) => Promise<void>;
                },
                'showAgentSelectionUI',
            )
            .mockResolvedValue(undefined);
        vi.mocked(selectAgent).mockResolvedValue({ ...decision, ...selection });
        const postMessage = vi.fn().mockResolvedValue({ ok: true });
        const result = await service['selectAgentForSlack']({
            availableAgents: agents,
            messageText: 'Revenue by month',
            channelId: 'channel',
            threadTs: 'thread-ts',
            promptSlackTs: 'prompt-ts',
            say: vi.fn(),
            botUserId: 'bot',
            client: { chat: { postMessage } } as never,
            isMultiAgentChannel: true,
            organizationUuid: 'organization',
            userUuid: 'user',
        });
        return { result, picker, postMessage };
    };

    afterEach(() => vi.restoreAllMocks());

    it.each<Partial<RouterDecision>>([
        { confidence: 'medium' },
        { confidence: 'low' },
        { shouldSkipForwardingQuery: true },
        { selectedAgentUuid: 'invented-agent' },
    ])(
        'shows the picker instead of forwarding an uncertain fast-mode result: %j',
        async (selection) => {
            const { result, picker, postMessage } = await route(
                true,
                selection,
            );
            expect(result).toBeUndefined();
            expect(picker).toHaveBeenCalledWith(
                expect.objectContaining({ availableAgents }),
            );
            expect(postMessage).not.toHaveBeenCalled();
        },
    );

    it('forwards a high-confidence match to the actual selected agent', async () => {
        const { result, picker, postMessage } = await route(true);
        expect(result?.agent.uuid).toBe('finance');
        expect(picker).not.toHaveBeenCalled();
        expect(postMessage).toHaveBeenCalledWith(
            expect.objectContaining({ username: 'Finance' }),
        );
    });

    it('retains legacy medium-confidence routing when fast decisions are off', async () => {
        const { result, picker } = await route(false, { confidence: 'medium' });
        expect(result?.agent.uuid).toBe('finance');
        expect(picker).not.toHaveBeenCalled();
    });

    it('never substitutes the first agent for an unknown returned ID', async () => {
        const { result, picker, postMessage } = await route(false, {
            selectedAgentUuid: 'invented-agent',
        });
        expect(result).toBeUndefined();
        expect(picker).toHaveBeenCalled();
        expect(postMessage).not.toHaveBeenCalled();
    });

    const instructionsPassed = () =>
        vi.mocked(selectAgent).mock.lastCall?.[0].instructions;

    it('passes the project routing instructions unchanged for one project', async () => {
        await route(
            true,
            {},
            routerWith({ 'project-a': 'Revenue goes to Finance' }),
        );
        expect(instructionsPassed()).toBe('Revenue goes to Finance');
    });

    it('passes no instructions when none are saved or no router exists', async () => {
        await route(true);
        expect(instructionsPassed()).toBeNull();
        await route(
            true,
            {},
            {
                ...routerWith({ 'project-a': 'ignored' }),
                findByOrganization: async () => null,
            },
        );
        expect(instructionsPassed()).toBeNull();
    });

    it('scopes instructions to their project when agents span projects', async () => {
        const agents = [
            ...availableAgents,
            { uuid: 'ops', name: 'Ops', projectUuid: 'project-b' },
        ] as AiAgentWithContext[];
        await route(
            true,
            {},
            routerWith({ 'project-a': 'Revenue goes to Finance' }),
            agents,
        );
        expect(instructionsPassed()).toBe(
            'Rules for project "Name of project-a". They apply only when choosing between its agents (Sales, Finance):\nRevenue goes to Finance',
        );
    });

    it('still routes when the instruction lookup fails', async () => {
        const { result } = await route(
            true,
            {},
            {
                ...routerWith({}),
                findByOrganization: async () => {
                    throw new Error('database down');
                },
            },
        );
        expect(instructionsPassed()).toBeNull();
        expect(result?.agent.uuid).toBe('finance');
    });
});
