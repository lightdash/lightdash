import type { ModelMessage } from 'ai';
import { getPreviousQueryUuid } from '../ai/agents/previousQuery';
import { TURN_TRANSCRIPT_FORMAT_VERSION } from '../ai/agents/turnTranscript';
import { AiAgentService } from './AiAgentService';

vi.mock('../ai/AiAgentMcpRuntimeClient', () => ({
    AiAgentMcpRuntimeClient: vi
        .fn()
        // eslint-disable-next-line prefer-arrow-callback
        .mockImplementation(function MockAiAgentMcpRuntimeClient() {
            return {};
        }),
}));

const sonnet = 'anthropic.messages/claude-sonnet';

const prompt = (
    uuid: string,
    text: string,
    response: string | null,
    errorMessage: string | null = null,
) => ({
    ai_prompt_uuid: uuid,
    prompt: text,
    response,
    error_message: errorMessage,
    human_score: null,
    human_feedback: null,
});

// As sent: the tool result is the short text the model read, not the stored result.
const toolSteps: ModelMessage[] = [
    {
        role: 'assistant',
        content: [
            {
                type: 'tool-call',
                toolCallId: 'call-1',
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
                toolCallId: 'call-1',
                toolName: 'runQuery',
                output: { type: 'text', value: 'rows' },
            },
        ],
    },
];

const storedToolCalls = [
    {
        toolCall: {
            toolCallId: 'call-1',
            toolName: 'runQuery',
            toolArgs: {},
        },
        toolResult: {
            toolCallId: 'call-1',
            toolName: 'runQuery',
            result: 'stored rows',
            metadata: { status: 'success', queryUuid: 'query-1' },
        },
        approvalDecision: null,
    },
];

const rebuiltToolSteps: ModelMessage[] = [
    {
        role: 'assistant',
        content: [
            {
                type: 'tool-call',
                toolCallId: 'call-1',
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
                toolCallId: 'call-1',
                toolName: 'runQuery',
                output: { type: 'json', value: 'stored rows' },
            },
        ],
    },
];

const storedRow = {
    ai_prompt_uuid: 'second',
    messages: toolSteps as unknown,
    format_version: TURN_TRANSCRIPT_FORMAT_VERSION,
    model: sonnet,
};

const buildHistory = ({
    findPromptTranscripts = vi.fn().mockResolvedValue([storedRow]),
    secondPrompt = prompt('second', 'Orders by status', 'Here they are.'),
}: {
    findPromptTranscripts?: ReturnType<typeof vi.fn>;
    secondPrompt?: ReturnType<typeof prompt>;
} = {}) => {
    const service = new AiAgentService({
        aiAgentModel: {
            getContextForPromptUuids: vi.fn().mockResolvedValue(new Map()),
            getToolCallsAndResultsForPrompt: vi
                .fn()
                .mockImplementation(async (uuid: string) =>
                    uuid === 'second' ? storedToolCalls : [],
                ),
            findPromptTranscripts,
        },
        lightdashConfig: {},
    } as unknown as ConstructorParameters<typeof AiAgentService>[0]);
    const transcriptReplay = {
        model: sonnet,
        currentPromptStart: null as number | null,
    };

    return {
        findPromptTranscripts,
        transcriptReplay,
        history: service.getChatHistoryFromThreadMessages(
            [
                prompt('first', 'Hello', 'Hi'),
                secondPrompt,
                prompt('current', 'Make it a bar chart', null),
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
    it('replays stored tool steps between the rebuilt prompt and the saved answer', async () => {
        const { history, findPromptTranscripts, transcriptReplay } =
            buildHistory();

        expect(await history).toMatchObject([
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi' },
            { role: 'user', content: 'Orders by status' },
            toolSteps[0],
            {
                role: 'tool',
                content: [{ toolCallId: 'call-1', output: { value: 'rows' } }],
            },
            { role: 'assistant', content: 'Here they are.' },
            { role: 'user', content: 'Make it a bar chart' },
        ]);
        expect(findPromptTranscripts).toHaveBeenCalledWith(['first', 'second']);
        expect(transcriptReplay.currentPromptStart).toBe(6);
    });

    it('keeps the queryUuid of a replayed query for the next turn', async () => {
        const { history } = buildHistory();

        expect(getPreviousQueryUuid(await history)).toBe('query-1');
    });

    it('rebuilds a turn whose answer was not saved', async () => {
        const { history } = buildHistory({
            secondPrompt: prompt(
                'second',
                'Orders by status',
                null,
                'Something went wrong while saving the response.',
            ),
        });

        expect(await history).toEqual([
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi' },
            { role: 'user', content: 'Orders by status' },
            ...rebuiltToolSteps,
            { role: 'user', content: 'Make it a bar chart' },
        ]);
    });

    it.each([
        ['cannot be read', vi.fn().mockRejectedValue(new Error('db down'))],
        [
            'is empty',
            vi.fn().mockResolvedValue([{ ...storedRow, messages: [] }]),
        ],
        [
            'holds a user message',
            vi.fn().mockResolvedValue([
                {
                    ...storedRow,
                    messages: [{ role: 'user', content: 'stale' }],
                },
            ]),
        ],
        [
            'has another format version',
            vi.fn().mockResolvedValue([{ ...storedRow, format_version: 0 }]),
        ],
        [
            'ran on another model',
            vi.fn().mockResolvedValue([{ ...storedRow, model: 'openai/gpt' }]),
        ],
    ])('rebuilds a turn whose transcript %s', async (_, findTranscripts) => {
        const { history } = buildHistory({
            findPromptTranscripts: findTranscripts,
        });

        expect(await history).toEqual([
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi' },
            { role: 'user', content: 'Orders by status' },
            ...rebuiltToolSteps,
            { role: 'assistant', content: 'Here they are.' },
            { role: 'user', content: 'Make it a bar chart' },
        ]);
    });
});
