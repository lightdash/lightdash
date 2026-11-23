import type { ModelMessage } from 'ai';
import { AiAgentService } from './AiAgentService';

vi.mock('../ai/AiAgentMcpRuntimeClient', () => ({
    AiAgentMcpRuntimeClient: vi
        .fn()
        // eslint-disable-next-line prefer-arrow-callback
        .mockImplementation(function MockAiAgentMcpRuntimeClient() {
            return {};
        }),
}));

const prompt = (uuid: string, text: string, response: string | null) => ({
    ai_prompt_uuid: uuid,
    prompt: text,
    response,
    error_message: null,
    human_score: null,
    human_feedback: null,
});

const transcript: ModelMessage[] = [
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

const buildHistory = (replayTranscripts: boolean) => {
    const findLatestPromptTranscript = vi.fn().mockResolvedValue({
        ai_prompt_uuid: 'second',
        messages: transcript,
    });
    const service = new AiAgentService({
        aiAgentModel: {
            getContextForPromptUuids: vi.fn().mockResolvedValue(new Map()),
            getToolCallsAndResultsForPrompt: vi.fn().mockResolvedValue([]),
            findLatestPromptTranscript,
        },
        lightdashConfig: {},
    } as unknown as ConstructorParameters<typeof AiAgentService>[0]);

    return {
        findLatestPromptTranscript,
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
                replayTranscripts,
            },
        ),
    };
};

describe('AiAgentService turn transcript replay', () => {
    it('replays the latest transcript in place of the turns it covers', async () => {
        const { history, findLatestPromptTranscript } = buildHistory(true);

        expect(await history).toEqual([
            ...transcript,
            { role: 'user', content: 'Change a chart' },
        ]);
        expect(findLatestPromptTranscript).toHaveBeenCalledWith([
            'first',
            'second',
        ]);
    });

    it('rebuilds every turn when replay is off', async () => {
        const { history, findLatestPromptTranscript } = buildHistory(false);

        expect(await history).toEqual([
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi' },
            { role: 'user', content: 'Build a dashboard' },
            { role: 'assistant', content: 'Built it.' },
            { role: 'user', content: 'Change a chart' },
        ]);
        expect(findLatestPromptTranscript).not.toHaveBeenCalled();
    });
});
