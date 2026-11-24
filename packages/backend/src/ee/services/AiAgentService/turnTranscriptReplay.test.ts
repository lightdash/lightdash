import type { ModelMessage } from 'ai';
import { getPreviousQueryUuid } from '../ai/agents/previousQuery';
import { AiAgentService } from './AiAgentService';

vi.mock('../ai/AiAgentMcpRuntimeClient', () => ({
    AiAgentMcpRuntimeClient: vi
        .fn()
        // eslint-disable-next-line prefer-arrow-callback
        .mockImplementation(function MockAiAgentMcpRuntimeClient() {
            return {};
        }),
}));

const sonnet = { modelProvider: 'anthropic', modelName: 'claude-sonnet' };

const prompt = (uuid: string, text: string, response: string | null) => ({
    ai_prompt_uuid: uuid,
    prompt: text,
    response,
    error_message: null,
    human_score: null,
    human_feedback: null,
});

const secondTurn: ModelMessage[] = [
    { role: 'user', content: 'Build a dashboard\n\nCandidate fields: ...' },
    {
        role: 'assistant',
        content: [
            {
                type: 'tool-call',
                toolCallId: 'call-1',
                toolName: 'loadSkill',
                input: { name: 'dashboards' },
            },
        ],
    },
    {
        role: 'tool',
        content: [
            {
                type: 'tool-result',
                toolCallId: 'call-1',
                toolName: 'loadSkill',
                output: { type: 'text', value: 'Skill text' },
            },
        ],
    },
    { role: 'assistant', content: 'Built it.' },
];

const buildHistory = (
    transcriptModel: typeof sonnet,
    currentModel: typeof sonnet,
    turn: ModelMessage[] = secondTurn,
    toolCallsAndResults: unknown[] = [],
) => {
    const findPromptTranscripts = vi.fn().mockResolvedValue([
        {
            ai_prompt_uuid: 'second',
            messages: turn,
            model_config: transcriptModel,
        },
    ]);
    const service = new AiAgentService({
        aiAgentModel: {
            getContextForPromptUuids: vi.fn().mockResolvedValue(new Map()),
            getToolCallsAndResultsForPrompt: vi
                .fn()
                .mockResolvedValue(toolCallsAndResults),
            findPromptTranscripts,
        },
        lightdashConfig: {},
    } as unknown as ConstructorParameters<typeof AiAgentService>[0]);
    const transcriptReplay = {
        modelConfig: currentModel,
        currentPromptStart: null as number | null,
    };

    return {
        findPromptTranscripts,
        transcriptReplay,
        history: service.getChatHistoryFromThreadMessages(
            [
                prompt('first', 'Hello', 'Hi'),
                prompt('second', 'Build a dashboard', 'Built it.'),
                prompt('current', 'Change a chart', null),
            ] as never,
            {
                organizationUuid: 'organization-1',
                projectUuid: 'project-1',
                agentUuid: 'agent-1',
                retrieveRelevantArtifacts: false,
                currentPromptUuid: 'current',
                threadUuid: 'thread-1',
                transcriptReplay,
            },
        ),
    };
};

describe('AiAgentService turn transcript replay', () => {
    it('replays each stored turn in its place and reports where the current prompt starts', async () => {
        const { history, findPromptTranscripts, transcriptReplay } =
            buildHistory(sonnet, sonnet);

        expect(await history).toEqual([
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi' },
            ...secondTurn,
            { role: 'user', content: 'Change a chart' },
        ]);
        expect(findPromptTranscripts).toHaveBeenCalledWith(['first', 'second']);
        expect(transcriptReplay.currentPromptStart).toBe(6);
    });

    it('keeps the queryUuid of a replayed query for the next turn', async () => {
        const queryTurn: ModelMessage[] = [
            { role: 'user', content: 'Orders by status' },
            {
                role: 'assistant',
                content: [
                    {
                        type: 'tool-call',
                        toolCallId: 'q1',
                        toolName: 'runQuery',
                        input: {},
                    },
                ],
            },
            {
                role: 'tool',
                content: [
                    {
                        type: 'tool-result',
                        toolCallId: 'q1',
                        toolName: 'runQuery',
                        output: { type: 'text', value: 'rows' },
                    },
                ],
            },
            { role: 'assistant', content: 'Here they are.' },
        ];
        const { history } = buildHistory(sonnet, sonnet, queryTurn, [
            {
                toolCall: { toolCallId: 'q1' },
                toolResult: {
                    toolCallId: 'q1',
                    metadata: { status: 'success', queryUuid: 'query-1' },
                },
            },
        ]);

        expect(getPreviousQueryUuid(await history)).toBe('query-1');
    });

    it('rebuilds a turn that ran on another model', async () => {
        const { history } = buildHistory(
            { modelProvider: 'openai', modelName: 'gpt' },
            sonnet,
        );

        expect(await history).toEqual([
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi' },
            { role: 'user', content: 'Build a dashboard' },
            { role: 'assistant', content: 'Built it.' },
            { role: 'user', content: 'Change a chart' },
        ]);
    });
});
