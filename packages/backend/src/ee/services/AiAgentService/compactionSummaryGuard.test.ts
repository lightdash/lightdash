import { type SessionUser } from '@lightdash/common';
import { generateCompactionSummary } from '../ai/agents/compactionGenerator';
import { AiAgentService } from './AiAgentService';

// Avoid constructing the real MCP runtime client (and its transitive deps) when
// we new up the service with mostly-empty mocks below.
vi.mock('../ai/AiAgentMcpRuntimeClient', () => ({
    AiAgentMcpRuntimeClient: vi
        .fn()
        // eslint-disable-next-line prefer-arrow-callback
        .mockImplementation(function MockAiAgentMcpRuntimeClient() {
            return {};
        }),
}));

vi.mock('../ai/agents/compactionGenerator', () => ({
    generateCompactionSummary: vi.fn(),
}));

vi.mock('../ai/models', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    getCompactionModelMetadata: vi.fn().mockReturnValue({
        supportsCompaction: true,
        contextWindowTokens: 200000,
    }),
    getModel: vi.fn().mockReturnValue({
        model: 'test-model',
        callOptions: {},
        providerOptions: {},
    }),
}));

const generateCompactionSummaryMock = vi.mocked(generateCompactionSummary);

const previousUserMessage = {
    role: 'user' as const,
    uuid: 'prompt-prev',
    threadUuid: 'thread-1',
    message: 'Show me revenue by month for 2025, split by region. '.repeat(40),
    createdAt: new Date().toISOString(),
    user: { uuid: 'user-1', name: 'Test User' },
    context: [],
    steers: [],
    hidden: false,
};

const buildService = () => {
    const aiAgentModel = {
        findLatestThreadCompaction: vi.fn().mockResolvedValue(null),
        findThreadCompactionByTriggeringPrompt: vi.fn().mockResolvedValue(null),
        findPreviousPromptInThread: vi.fn().mockResolvedValue({
            ai_prompt_uuid: 'prompt-prev',
            token_usage: { totalTokens: 190000 },
        }),
        findThreadMessages: vi.fn().mockResolvedValue([previousUserMessage]),
        createThreadCompaction: vi.fn().mockResolvedValue({
            ai_thread_compaction_uuid: 'compaction-1',
            compacted_through_ai_prompt_uuid: 'prompt-prev',
        }),
    };
    const orgAiCopilotConfigResolver = {
        getCopilotConfig: vi.fn().mockResolvedValue({}),
    };
    const service = new AiAgentService({
        aiAgentModel,
        orgAiCopilotConfigResolver,
        lightdashConfig: {},
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    return { service, aiAgentModel };
};

const user = {
    userUuid: 'user-1',
    organizationUuid: 'org-1',
} as unknown as SessionUser;

const prompt = {
    promptUuid: 'prompt-current',
    threadUuid: 'thread-1',
    organizationUuid: 'org-1',
    modelConfig: null,
};

const runCompaction = (service: AiAgentService) =>
    (
        service as unknown as {
            maybeCompactThreadBeforeResponse: (
                u: SessionUser,
                args: { threadUuid: string; prompt: typeof prompt },
            ) => Promise<unknown>;
        }
    ).maybeCompactThreadBeforeResponse(user, {
        threadUuid: 'thread-1',
        prompt,
    });

describe('AiAgentService compaction summary guard', () => {
    beforeEach(() => {
        generateCompactionSummaryMock.mockReset();
    });

    it('persists the compaction when the summary is usable', async () => {
        const { service, aiAgentModel } = buildService();
        generateCompactionSummaryMock.mockResolvedValue(
            [
                '## Goal',
                'Analyze monthly revenue by region for 2025.',
                '## Next Steps',
                'Add month-over-month growth.',
            ].join('\n'),
        );

        const compaction = await runCompaction(service);

        expect(aiAgentModel.createThreadCompaction).toHaveBeenCalledTimes(1);
        expect(compaction).toEqual(
            expect.objectContaining({
                ai_thread_compaction_uuid: 'compaction-1',
            }),
        );
    });

    it('does not persist a placeholder summary and does not throw', async () => {
        const { service, aiAgentModel } = buildService();
        generateCompactionSummaryMock.mockResolvedValue(
            '[no further messages]',
        );

        const compaction = await runCompaction(service);

        expect(aiAgentModel.createThreadCompaction).not.toHaveBeenCalled();
        expect(compaction).toBeNull();
    });

    it('does not persist an empty summary and does not throw', async () => {
        const { service, aiAgentModel } = buildService();
        generateCompactionSummaryMock.mockResolvedValue('   \n  ');

        const compaction = await runCompaction(service);

        expect(aiAgentModel.createThreadCompaction).not.toHaveBeenCalled();
        expect(compaction).toBeNull();
    });

    it('keeps the previous compaction when the new summary is rejected', async () => {
        const { service, aiAgentModel } = buildService();
        const previousCompaction = {
            ai_thread_compaction_uuid: 'compaction-0',
            compacted_through_ai_prompt_uuid: 'prompt-older',
            summary: 'Earlier valid summary.',
        };
        aiAgentModel.findLatestThreadCompaction.mockResolvedValue(
            previousCompaction,
        );
        generateCompactionSummaryMock.mockResolvedValue(
            '[no assistant message]',
        );

        const compaction = await runCompaction(service);

        expect(aiAgentModel.createThreadCompaction).not.toHaveBeenCalled();
        expect(compaction).toBe(previousCompaction);
    });

    it('continues without compaction when summary generation throws', async () => {
        const { service, aiAgentModel } = buildService();
        generateCompactionSummaryMock.mockRejectedValue(
            new Error('model unavailable'),
        );

        const compaction = await runCompaction(service);

        expect(aiAgentModel.createThreadCompaction).not.toHaveBeenCalled();
        expect(compaction).toBeNull();
    });
});
