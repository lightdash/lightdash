import { type AiWebAppPrompt, type SlackPrompt } from '@lightdash/common';
import {
    metricQueryMock,
    validExplore,
} from '../../../../services/ProjectService/ProjectService.mock';
import type { RunAsyncQueryFn } from '../types/aiAgentDependencies';
import { AgentContext } from '../utils/AgentContext';
import { getRunQuery } from './runQuery';

const makePrompt = (): AiWebAppPrompt => ({
    organizationUuid: 'org-uuid',
    projectUuid: 'project-uuid',
    agentUuid: 'agent-uuid',
    promptUuid: 'prompt-uuid',
    threadUuid: 'thread-uuid',
    createdByUserUuid: 'user-uuid',
    userUuid: 'user-uuid',
    prompt: 'Show the baseline',
    createdAt: new Date('2026-07-31T00:00:00Z'),
    response: null,
    errorMessage: null,
    humanScore: null,
    modelConfig: null,
});

const makeSlackPrompt = (): SlackPrompt => ({
    ...makePrompt(),
    response_slack_ts: 'response-ts',
    slackUserId: 'slack-user',
    slackChannelId: 'slack-channel',
    promptSlackTs: 'prompt-ts',
    slackThreadTs: 'thread-ts',
});

const toolInput = {
    title: 'Baseline',
    description: 'One row',
    queryConfig: {
        exploreName: validExplore.name,
        dimensions: metricQueryMock.dimensions,
        metrics: metricQueryMock.metrics,
        sorts: [],
        limit: null,
        customMetrics: null,
        tableCalculations: null,
        filters: null,
    },
    chartConfig: {
        defaultVizType: 'bar' as const,
        xAxisDimension: 'a_dim1',
        yAxisMetrics: ['a_met1'],
        groupBy: null,
        xAxisType: 'category' as const,
        stackBars: null,
        lineType: null,
        xAxisLabel: 'Dimension',
        yAxisLabel: 'Metric',
        secondaryYAxisMetric: null,
        secondaryYAxisLabel: null,
    },
};

const executeTool = async (
    runAsyncQuery: RunAsyncQueryFn,
    enableDataAccess = true,
    prompt: AiWebAppPrompt | SlackPrompt = makePrompt(),
) => {
    const queryTool = getRunQuery({
        updateProgress: vi.fn().mockResolvedValue(undefined),
        runAsyncQuery,
        getPrompt: vi.fn().mockResolvedValue(prompt),
        sendFile: vi.fn().mockResolvedValue(undefined),
        createOrUpdateArtifact: vi.fn().mockResolvedValue(undefined),
        maxLimit: 500,
        enableDataAccess,
    });

    const output = await queryTool.execute!(toolInput, {
        messages: [],
        toolCallId: 'tool-call-1',
        experimental_context: new AgentContext([validExplore]),
    });
    if (Symbol.asyncIterator in output) {
        throw new Error('Expected a non-streaming tool result');
    }
    return output;
};

describe('getRunQuery', () => {
    it('returns the query UUID in successful visualization metadata', async () => {
        const runAsyncQuery: RunAsyncQueryFn = vi.fn().mockResolvedValue({
            queryUuid: '11111111-1111-4111-8111-111111111111',
            rows: [{ a_dim1: 'one', a_met1: 1 }],
            cacheMetadata: { cacheHit: false },
            fields: {},
        });

        await expect(executeTool(runAsyncQuery)).resolves.toMatchObject({
            metadata: {
                status: 'success',
                queryUuid: '11111111-1111-4111-8111-111111111111',
            },
        });
    });

    it('returns the query UUID when row data is hidden from the model', async () => {
        const runAsyncQuery: RunAsyncQueryFn = vi.fn().mockResolvedValue({
            queryUuid: '11111111-1111-4111-8111-111111111111',
            rows: [{ a_dim1: 'one', a_met1: 1 }],
            cacheMetadata: { cacheHit: false },
            fields: {},
        });

        await expect(
            executeTool(runAsyncQuery, false, makeSlackPrompt()),
        ).resolves.toMatchObject({
            metadata: {
                status: 'success',
                queryUuid: '11111111-1111-4111-8111-111111111111',
            },
        });
    });

    it('does not expose a query UUID for an empty result', async () => {
        const output = await executeTool(
            vi.fn().mockResolvedValue({
                queryUuid: '11111111-1111-4111-8111-111111111111',
                rows: [],
                cacheMetadata: { cacheHit: false },
                fields: {},
            }) as RunAsyncQueryFn,
        );

        expect(output.metadata).toMatchObject({ status: 'success' });
        expect(output.metadata).not.toHaveProperty('queryUuid');
    });

    it('does not expose a query UUID when execution fails', async () => {
        const output = await executeTool(
            vi
                .fn()
                .mockRejectedValue(
                    new Error('warehouse unavailable'),
                ) as RunAsyncQueryFn,
        );

        expect(output.metadata).toEqual({ status: 'error' });
    });
});
