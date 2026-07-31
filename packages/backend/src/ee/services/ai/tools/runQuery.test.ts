import { type AiWebAppPrompt } from '@lightdash/common';
import {
    metricQueryMock,
    validExplore,
} from '../../../../services/ProjectService/ProjectService.mock';
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

describe('getRunQuery', () => {
    it('returns the warehouse query UUID in successful visualization metadata', async () => {
        const runAsyncQuery = vi.fn().mockResolvedValue({
            queryUuid: '11111111-1111-4111-8111-111111111111',
            rows: [{ a_dim1: 'one', a_met1: 1 }],
            cacheMetadata: { cacheHit: false },
            fields: {},
        });
        const tool = getRunQuery({
            updateProgress: vi.fn().mockResolvedValue(undefined),
            runAsyncQuery,
            getPrompt: vi.fn().mockResolvedValue(makePrompt()),
            sendFile: vi.fn().mockResolvedValue(undefined),
            createOrUpdateArtifact: vi.fn().mockResolvedValue(undefined),
            maxLimit: 500,
            enableDataAccess: true,
        });

        const output = await tool.execute!(
            {
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
                    defaultVizType: 'bar',
                    xAxisDimension: 'a_dim1',
                    yAxisMetrics: ['a_met1'],
                    groupBy: null,
                    xAxisType: 'category',
                    stackBars: null,
                    lineType: null,
                    xAxisLabel: 'Dimension',
                    yAxisLabel: 'Metric',
                    secondaryYAxisMetric: null,
                    secondaryYAxisLabel: null,
                },
            },
            {
                messages: [],
                toolCallId: 'tool-call-1',
                experimental_context: new AgentContext([validExplore]),
            },
        );

        expect(output).toMatchObject({
            metadata: {
                status: 'success',
                queryUuid: '11111111-1111-4111-8111-111111111111',
            },
        });
        expect(runAsyncQuery).toHaveBeenCalledOnce();
    });
});
