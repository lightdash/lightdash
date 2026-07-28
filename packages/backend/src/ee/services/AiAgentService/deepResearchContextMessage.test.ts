import { AiAgentService } from './AiAgentService';

vi.mock('../ai/AiAgentMcpRuntimeClient', () => ({
    AiAgentMcpRuntimeClient: vi
        .fn()
        // eslint-disable-next-line prefer-arrow-callback
        .mockImplementation(function MockAiAgentMcpRuntimeClient() {
            return {};
        }),
}));

describe('AiAgentService.createDeepResearchContextMessage', () => {
    it('makes the report Markdown available as assistant context', () => {
        const message = AiAgentService.createDeepResearchContextMessage({
            result_markdown: '# Retention report\n\nRetention improved.',
        });

        expect(message).toEqual({
            role: 'assistant',
            content: expect.stringContaining(
                '# Retention report\n\nRetention improved.',
            ),
        });
    });

    it('does not create context before a report is available', () => {
        expect(
            AiAgentService.createDeepResearchContextMessage({
                result_markdown: null,
            }),
        ).toBeNull();
        expect(
            AiAgentService.createDeepResearchContextMessage(undefined),
        ).toBeNull();
    });
});

describe('AiAgentService deep research conversation history', () => {
    it('replays a completed report for a follow-up prompt', async () => {
        const aiDeepResearchRunModel = {
            findByPromptUuidsScoped: vi.fn().mockResolvedValue([
                {
                    prompt_uuid: 'research-prompt',
                    result_markdown: '# Retention report',
                },
            ]),
        };
        const service = new AiAgentService({
            aiAgentModel: {
                getContextForPromptUuids: vi.fn().mockResolvedValue(new Map()),
                getToolCallsAndResultsForPrompt: vi.fn().mockResolvedValue([]),
            },
            aiDeepResearchRunModel,
            lightdashConfig: {},
        } as unknown as ConstructorParameters<typeof AiAgentService>[0]);

        const history = await service.getChatHistoryFromThreadMessages(
            [
                {
                    ai_prompt_uuid: 'research-prompt',
                    prompt: 'Research retention',
                    response: null,
                    error_message: null,
                    human_score: null,
                    human_feedback: null,
                },
            ] as never,
            {
                organizationUuid: 'organization-1',
                projectUuid: 'project-1',
                agentUuid: 'agent-1',
                retrieveRelevantArtifacts: false,
                compaction: null,
                currentPromptUuid: 'follow-up-prompt',
            },
        );

        expect(
            aiDeepResearchRunModel.findByPromptUuidsScoped,
        ).toHaveBeenCalledWith({
            promptUuids: ['research-prompt'],
            organizationUuid: 'organization-1',
            projectUuid: 'project-1',
        });
        expect(history).toEqual([
            { role: 'user', content: 'Research retention' },
            {
                role: 'assistant',
                content: expect.stringContaining('# Retention report'),
            },
        ]);
    });

    it('keeps the ordinary response when a research report is incomplete', async () => {
        const service = new AiAgentService({
            aiAgentModel: {
                getContextForPromptUuids: vi.fn().mockResolvedValue(new Map()),
                getToolCallsAndResultsForPrompt: vi.fn().mockResolvedValue([]),
            },
            aiDeepResearchRunModel: {
                findByPromptUuidsScoped: vi.fn().mockResolvedValue([
                    {
                        prompt_uuid: 'research-prompt',
                        result_markdown: null,
                    },
                ]),
            },
            lightdashConfig: {},
        } as unknown as ConstructorParameters<typeof AiAgentService>[0]);

        const history = await service.getChatHistoryFromThreadMessages(
            [
                {
                    ai_prompt_uuid: 'research-prompt',
                    prompt: 'Research retention',
                    response: 'The ordinary response',
                    error_message: null,
                    human_score: null,
                    human_feedback: null,
                },
            ] as never,
            {
                organizationUuid: 'organization-1',
                projectUuid: 'project-1',
                agentUuid: 'agent-1',
                retrieveRelevantArtifacts: false,
                compaction: null,
                currentPromptUuid: 'follow-up-prompt',
            },
        );

        expect(history).toEqual([
            { role: 'user', content: 'Research retention' },
            { role: 'assistant', content: 'The ordinary response' },
        ]);
    });
});
