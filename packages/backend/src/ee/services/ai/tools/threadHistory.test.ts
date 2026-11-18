import {
    ForbiddenError,
    toolGetThreadOutputSchema,
    toolListThreadsOutputSchema,
    toolSearchThreadsOutputSchema,
    type AiAgentThreadHistorySummary,
    type AiWebAppPrompt,
} from '@lightdash/common';
import {
    canOfferThreadHistory,
    getGetThread,
    getListThreads,
    getSearchThreads,
} from './threadHistory';

vi.mock('@sentry/node', () => ({
    captureException: vi.fn(),
    addBreadcrumb: vi.fn(),
    getActiveSpan: vi.fn(),
}));

vi.mock('../../../../logging/logger', () => ({
    __esModule: true,
    default: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const options = { messages: [], toolCallId: 'tool-call-1', context: {} };

const filters = {
    scope: 'mine' as const,
    agentUuid: null,
    userUuid: null,
    createdFrom: null,
    dateFrom: null,
    dateTo: null,
    hasError: null,
    feedback: null,
    signal: null,
    rootCause: null,
    cursor: null,
    limit: null,
};

const thread: AiAgentThreadHistorySummary = {
    threadUuid: '11111111-1111-4111-8111-111111111111',
    projectUuid: '22222222-2222-4222-8222-222222222222',
    agentUuid: '33333333-3333-4333-8333-333333333333',
    agentName: 'Agent',
    title: 'Revenue by month',
    createdAt: '2026-01-01T00:00:00.000Z',
    createdFrom: 'web_app',
    user: { uuid: '44444444-4444-4444-8444-444444444444', name: 'Ada' },
    firstPrompt: 'What was revenue last month?',
    turnCount: 1,
    errorCount: 1,
    upvoteCount: 0,
    downvoteCount: 1,
    classification: null,
};

describe('thread history tools', () => {
    it('lists conversations as text and as structured content', async () => {
        const listThreads = vi
            .fn()
            .mockResolvedValue({ threads: [thread], nextCursor: null });
        const output = await getListThreads({ listThreads }).execute!(
            { ...filters, hasError: true },
            options,
        );

        expect(toolListThreadsOutputSchema.safeParse(output).success).toBe(
            true,
        );
        expect(output).toMatchObject({
            metadata: { status: 'success' },
            structuredContent: { threads: [thread], nextCursor: null },
            result: expect.stringContaining('Revenue by month'),
        });
        expect(listThreads).toHaveBeenCalledWith(
            expect.objectContaining({ scope: 'mine', hasError: true }),
        );
    });

    it('returns search matches with their snippets', async () => {
        const result = {
            threads: [
                {
                    ...thread,
                    rank: 0.4,
                    matchedTurnCount: 1,
                    matches: [
                        {
                            promptUuid: '55555555-5555-4555-8555-555555555555',
                            createdAt: '2026-01-01T00:00:00.000Z',
                            matchedIn: ['prompt' as const],
                            snippet: 'What was **revenue** last month?',
                        },
                    ],
                },
            ],
            nextCursor: 'next',
        };
        const output = await getSearchThreads({
            searchThreads: vi.fn().mockResolvedValue(result),
        }).execute!({ ...filters, query: 'revenue' }, options);

        expect(toolSearchThreadsOutputSchema.safeParse(output).success).toBe(
            true,
        );
        expect(output).toMatchObject({ structuredContent: result });
    });

    it('returns a transcript page', async () => {
        const transcript = {
            thread,
            turns: [
                {
                    index: 0,
                    promptUuid: '55555555-5555-4555-8555-555555555555',
                    createdAt: '2026-01-01T00:00:00.000Z',
                    prompt: 'What was revenue last month?',
                    response: null,
                    errorMessage: 'Field not found',
                    humanScore: -1,
                    humanFeedback: 'wrong metric',
                    truncated: false,
                    classification: null,
                },
            ],
            nextTurnOffset: null,
        };
        const output = await getGetThread({
            getThread: vi.fn().mockResolvedValue(transcript),
        }).execute!(
            {
                threadUuid: thread.threadUuid,
                turnOffset: null,
                turnLimit: null,
                includeToolCalls: null,
            },
            options,
        );

        expect(toolGetThreadOutputSchema.safeParse(output).success).toBe(true);
        expect(output).toMatchObject({ structuredContent: transcript });
    });

    it('reports a refused call as an error the model can read', async () => {
        const output = await getGetThread({
            getThread: vi
                .fn()
                .mockRejectedValue(
                    new ForbiddenError(
                        'Insufficient permissions to view this thread',
                    ),
                ),
        }).execute!(
            {
                threadUuid: thread.threadUuid,
                turnOffset: null,
                turnLimit: null,
                includeToolCalls: null,
            },
            options,
        );

        expect(toolGetThreadOutputSchema.safeParse(output).success).toBe(true);
        expect(output).toMatchObject({
            metadata: { status: 'error' },
            structuredContent: { error: expect.any(String) },
        });
    });
});

describe('canOfferThreadHistory', () => {
    const webPrompt = {
        threadCreatedFrom: 'web_app',
        threadEmbedSpaceUuid: null,
        threadEmbedOwnerIdentifier: null,
        externalUserId: null,
    } as AiWebAppPrompt;

    it.each(['web_app', 'api', 'semantic_studio'])(
        'offers the tools on a %s thread',
        (threadCreatedFrom) => {
            expect(
                canOfferThreadHistory(
                    { ...webPrompt, threadCreatedFrom } as AiWebAppPrompt,
                    'standard',
                ),
            ).toBe(true);
        },
    );

    it.each([
        ['a Slack prompt', { ...webPrompt, slackUserId: 'U1' }],
        ['an eval thread', { ...webPrompt, threadCreatedFrom: 'evals' }],
        ['an embed', { ...webPrompt, threadEmbedSpaceUuid: 'space-1' }],
        ['a read-only embed', { ...webPrompt, externalUserId: 'viewer-1' }],
        [
            'a read-only embed without a viewer id',
            { ...webPrompt, threadEmbedOwnerIdentifier: 'dashboard-1' },
        ],
    ])('withholds them from %s', (_, prompt) => {
        expect(
            canOfferThreadHistory(prompt as AiWebAppPrompt, 'standard'),
        ).toBe(false);
    });

    it('withholds them from deep research', () => {
        expect(canOfferThreadHistory(webPrompt, 'deep_research')).toBe(false);
    });
});
