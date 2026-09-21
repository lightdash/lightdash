import { type AiAgentWithContext } from '@lightdash/common';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { selectAgent, type RouterDecision } from '../ai/agents/agentSelector';
import { type AiDecisionClient } from '../ai/decisions/AiDecisionClient';
import { AiAgentService } from './AiAgentService';

vi.mock('../ai/agents/agentSelector', () => ({ selectAgent: vi.fn() }));
vi.mock('../ai/models', () => ({ getModel: () => ({ model: 'test-model' }) }));

const availableAgents = [
    { uuid: 'sales', name: 'Sales' },
    { uuid: 'finance', name: 'Finance' },
] as AiAgentWithContext[];

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
    ) => {
        const service = new AiAgentService({
            lightdashConfig: lightdashConfigMock,
            orgAiCopilotConfigResolver: { getCopilotConfig: async () => ({}) },
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
            availableAgents,
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
            multiAgentProjectUuids: ['project'],
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
});
