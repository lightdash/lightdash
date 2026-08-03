import { AiAgentService } from './AiAgentService';

vi.mock('../ai/AiAgentMcpRuntimeClient', () => ({
    AiAgentMcpRuntimeClient: vi
        .fn()
        // eslint-disable-next-line prefer-arrow-callback
        .mockImplementation(function MockAiAgentMcpRuntimeClient() {
            return {};
        }),
}));

const createRun = (
    status: 'queued' | 'running' | 'completed' | 'partially_completed',
    overrides: Record<string, unknown> = {},
) =>
    ({
        ai_deep_research_run_uuid: `${status}-run`,
        prompt: `${status} question`,
        status,
        has_report: false,
        created_at: new Date('2026-07-29T10:00:00.000Z'),
        updated_at: new Date('2026-07-29T10:00:00.000Z'),
        started_at:
            status === 'queued' ? null : new Date('2026-07-29T10:01:00.000Z'),
        completed_at:
            status === 'completed' || status === 'partially_completed'
                ? new Date('2026-07-29T10:05:00.000Z')
                : null,
        ...overrides,
    }) as never;

describe('AiAgentService.createDeepResearchRunContext', () => {
    it('includes current progress and report availability', () => {
        const run = createRun('running', {
            has_report: true,
        });
        const context = AiAgentService.createDeepResearchRunContext(
            [run],
            [
                {
                    ai_deep_research_run_uuid: 'running-run',
                    event_type: 'progress',
                    payload: {
                        progress: {
                            phase: 'investigating',
                            activity: 'warehouse_query',
                            current: 2,
                            total: 5,
                        },
                    },
                } as never,
            ],
            new Date('2026-07-29T10:03:00.000Z'),
        );

        expect(context).toEqual([
            expect.objectContaining({
                uuid: 'running-run',
                status: 'running',
                phase: 'investigating',
                activity: 'warehouse_query',
                progressCurrent: 2,
                progressTotal: 5,
                elapsedSeconds: 120,
                hasReport: true,
            }),
        ]);
    });

    it('bounds terminal metadata to the five most recent runs', () => {
        const runs = Array.from({ length: 7 }, (_, index) =>
            createRun('completed', {
                ai_deep_research_run_uuid: `run-${index}`,
            }),
        );

        expect(
            AiAgentService.createDeepResearchRunContext(runs, []).map(
                ({ uuid }) => uuid,
            ),
        ).toEqual(['run-2', 'run-3', 'run-4', 'run-5', 'run-6']);
    });
});

describe('AiAgentService deep research conversation history', () => {
    it('keeps the ordinary response without injecting report Markdown', async () => {
        const service = new AiAgentService({
            aiAgentModel: {
                getContextForPromptUuids: vi.fn().mockResolvedValue(new Map()),
                getToolCallsAndResultsForPrompt: vi.fn().mockResolvedValue([]),
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
                currentPromptUuid: 'follow-up-prompt',
            },
        );

        expect(history).toEqual([
            { role: 'user', content: 'Research retention' },
            { role: 'assistant', content: 'The ordinary response' },
        ]);
    });
});
