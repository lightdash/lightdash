import { type AiAgentWithContext } from '@lightdash/common';
import { generateText } from 'ai';
import { logAiEgressBlock } from '../../../../utils/aiEgress/logAiEgressBlock';
import { AiDecisionClient } from '../decisions/AiDecisionClient';
import { selectAgent } from './agentSelector';
import {
    compareChartQueries,
    type ChartSimilarityInput,
} from './chartSimilarity';
import { routeProjectForSlack } from './projectRouter';

vi.mock('ai', async (importOriginal) => ({
    ...(await importOriginal<typeof import('ai')>()),
    generateText: vi.fn(),
}));
vi.mock('../../../../utils/aiEgress/logAiEgressBlock', () => ({
    logAiEgressBlock: vi.fn(),
}));
vi.mock('../../../../analytics/aiUsage', () => ({
    emitAiUsage: vi.fn(),
    languageModelUsageToTokens: vi.fn(),
}));

const buildClient = (restricted: boolean) => {
    const fetcher = vi
        .fn<typeof fetch>()
        .mockRejectedValue(new Error('Provider unavailable'));
    const client = new AiDecisionClient(
        { apiKey: 'test', model: 'test', timeoutMs: 100 },
        fetcher,
    );
    return {
        fetcher,
        decisions: restricted
            ? client.withAiAccessRestrictions({
                  organizationUuid: 'org',
                  projectUuid: 'project',
                  userUuid: 'user',
              })
            : client,
    };
};

beforeEach(() => vi.clearAllMocks());

it.each([true, false])(
    'uses a non-AI agent selection fallback only under restrictions (%s)',
    async (restricted) => {
        const { decisions, fetcher } = buildClient(restricted);
        vi.mocked(generateText).mockResolvedValue({
            output: {
                agentUuid: 'finance',
                confidence: 'high',
                reasoning: 'Matched',
                shouldSkipForwardingQuery: false,
            },
            usage: {},
        } as never);
        const candidates = ['sales', 'finance'].map((uuid) => ({
            uuid,
            name: uuid,
            context: { explores: [], verifiedQuestions: [] },
        })) as unknown as AiAgentWithContext[];
        const result = await selectAgent({
            model: 'test',
            candidates,
            prompt: 'Revenue',
            decisions,
        });
        expect(result.selectedAgentUuid).toBe(restricted ? null : 'finance');
        expect(fetcher).toHaveBeenCalledTimes(restricted ? 0 : 1);
        expect(generateText).toHaveBeenCalledTimes(restricted ? 0 : 1);
        if (restricted)
            expect(logAiEgressBlock).toHaveBeenCalledWith(
                expect.objectContaining({
                    detail: 'agent-routing',
                    reason: 'off_under_restrictions',
                }),
            );
    },
);

it.each([true, false])(
    'uses a non-AI project selection fallback only under restrictions (%s)',
    async (restricted) => {
        const { decisions, fetcher } = buildClient(restricted);
        vi.mocked(generateText).mockResolvedValue({
            output: { projectUuid: 'project', reasoning: 'Matched' },
            usage: {},
        } as never);
        const result = await routeProjectForSlack(
            'test',
            [{ projectUuid: 'project', name: 'Project' }],
            'Use Project',
            undefined,
            decisions,
        );
        expect(result).toBe(restricted ? null : 'project');
        expect(fetcher).toHaveBeenCalledTimes(restricted ? 0 : 1);
        expect(generateText).toHaveBeenCalledTimes(restricted ? 0 : 1);
    },
);

it('does not bypass restrictions when the project list exceeds the decision limit', async () => {
    const { decisions, fetcher } = buildClient(true);
    const projects = Array.from({ length: 255 }, (_, i) => ({
        projectUuid: `project-${i}`,
        name: `Project ${i}`,
    }));
    expect(
        await routeProjectForSlack(
            'test',
            projects,
            'Pick one',
            undefined,
            decisions,
        ),
    ).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
    expect(generateText).not.toHaveBeenCalled();
    expect(logAiEgressBlock).toHaveBeenCalledWith(
        expect.objectContaining({ detail: 'project-routing' }),
    );
});

it.each([true, false])(
    'uses a non-AI chart comparison fallback only under restrictions (%s)',
    async (restricted) => {
        const { decisions, fetcher } = buildClient(restricted);
        const source: ChartSimilarityInput['source'] = {
            name: 'Revenue',
            metricQuery: {
                exploreName: 'orders',
                metrics: ['revenue'],
                dimensions: [],
                filters: {},
                sorts: [],
                limit: 10,
                tableCalculations: [],
            },
        };
        const matches = [
            {
                uuid: 'chart',
                relationship: 'potential_duplicate',
                explanation: 'Same query',
            },
        ];
        vi.mocked(generateText).mockResolvedValue({
            output: { matches },
            usage: {},
        } as never);
        expect(
            await compareChartQueries(
                { model: 'test', keyManagement: null },
                { source, candidates: [{ ...source, uuid: 'chart' }] },
                decisions,
            ),
        ).toEqual(restricted ? [] : matches);
        expect(fetcher).toHaveBeenCalledTimes(restricted ? 0 : 1);
        expect(generateText).toHaveBeenCalledTimes(restricted ? 0 : 1);
    },
);
