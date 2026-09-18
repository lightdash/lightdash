import {
    toolDashboardV2OutputSchema,
    type AiWebAppPrompt,
} from '@lightdash/common';
import {
    metricQueryMock,
    validExplore,
} from '../../../../services/ProjectService/ProjectService.mock';
import { AgentContext } from '../utils/AgentContext';
import { getGenerateDashboardV2 } from './generateDashboardV2';

vi.mock('@sentry/node', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@sentry/node')>();
    return { ...actual, captureException: vi.fn() };
});

vi.mock('../../../../logging/logger', () => ({
    __esModule: true,
    default: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const prompt: AiWebAppPrompt = {
    organizationUuid: 'org-uuid',
    projectUuid: 'project-uuid',
    agentUuid: 'agent-uuid',
    promptUuid: 'prompt-uuid',
    threadUuid: 'thread-uuid',
    threadCreatedFrom: 'web_app',
    createdByUserUuid: 'user-uuid',
    userUuid: 'user-uuid',
    prompt: 'Build a dashboard',
    createdAt: new Date('2026-07-31T00:00:00Z'),
    response: null,
    errorMessage: null,
    humanScore: null,
    modelConfig: null,
};

const makeVisualization = (title: string, exploreName: string) => ({
    title,
    description: `${title} description`,
    queryConfig: {
        exploreName,
        dimensions: metricQueryMock.dimensions,
        metrics: metricQueryMock.metrics,
        sorts: [],
        limit: null,
        parameters: null,
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
    mergeConfig: null,
});

const validViz = makeVisualization('Revenue by month', validExplore.name);
const anotherValidViz = makeVisualization(
    'Orders by status',
    validExplore.name,
);
const invalidViz = makeVisualization('Unknown explore', 'missing_explore');

const executeTool = async (
    visualizations: ReturnType<typeof makeVisualization>[],
    deps: Partial<Parameters<typeof getGenerateDashboardV2>[0]> = {},
) => {
    const generateDashboard = getGenerateDashboardV2({
        getPrompt: vi.fn().mockResolvedValue(prompt),
        createOrUpdateArtifact: vi.fn().mockResolvedValue(undefined),
        ...deps,
    });
    if (!generateDashboard.execute) {
        throw new Error('Missing executor');
    }
    const output = await generateDashboard.execute(
        {
            title: 'Sales overview',
            description: 'Executive summary',
            visualizations,
        },
        {
            messages: [],
            toolCallId: 'tool-call-1',
            experimental_context: new AgentContext([validExplore]),
        },
    );
    if (Symbol.asyncIterator in output) {
        throw new Error('Expected a non-streaming tool result');
    }
    return output;
};

describe('getGenerateDashboardV2', () => {
    it('creates the dashboard when every visualization is valid', async () => {
        const createOrUpdateArtifact = vi.fn().mockResolvedValue(undefined);

        const output = await executeTool([validViz, anotherValidViz], {
            createOrUpdateArtifact,
        });

        expect(output).toEqual({
            result: 'Success',
            metadata: { status: 'success' },
            structuredContent: {
                visualizationCount: 2,
                excludedVisualizations: [],
            },
        });
        expect(toolDashboardV2OutputSchema.safeParse(output).success).toBe(
            true,
        );
        expect(createOrUpdateArtifact).toHaveBeenCalledWith(
            expect.objectContaining({
                threadUuid: prompt.threadUuid,
                promptUuid: prompt.promptUuid,
                artifactType: 'dashboard',
                title: 'Sales overview',
                vizConfig: expect.objectContaining({
                    visualizations: [validViz, anotherValidViz],
                }),
            }),
        );
    });

    it('excludes visualizations that fail validation and reports them in both forms', async () => {
        const createOrUpdateArtifact = vi.fn().mockResolvedValue(undefined);

        const output = await executeTool([validViz, invalidViz], {
            createOrUpdateArtifact,
        });

        expect(toolDashboardV2OutputSchema.safeParse(output).success).toBe(
            true,
        );
        expect(output.metadata).toEqual({ status: 'success' });
        expect(output.result).toContain(
            'Dashboard created with 1 visualization.',
        );
        expect(output.result).toContain('- Unknown explore');
        expect(output.result).toContain(
            'Validation failed for visualization 2 (Unknown explore)',
        );
        expect(output.structuredContent).toEqual({
            visualizationCount: 1,
            excludedVisualizations: [
                {
                    title: 'Unknown explore',
                    error: expect.stringContaining(
                        'Validation failed for visualization 2 (Unknown explore)',
                    ),
                },
            ],
        });
        if (!('excludedVisualizations' in output.structuredContent)) {
            throw new Error('Expected success structured content');
        }
        expect(output.result).toContain(
            output.structuredContent.excludedVisualizations[0].error,
        );
        expect(createOrUpdateArtifact).toHaveBeenCalledWith(
            expect.objectContaining({
                vizConfig: expect.objectContaining({
                    visualizations: [validViz],
                }),
            }),
        );
    });

    it('fails without creating anything when every visualization is invalid', async () => {
        const createOrUpdateArtifact = vi.fn().mockResolvedValue(undefined);

        const output = await executeTool([invalidViz, invalidViz], {
            createOrUpdateArtifact,
        });

        expect(toolDashboardV2OutputSchema.safeParse(output).success).toBe(
            true,
        );
        expect(output.metadata).toEqual({ status: 'error' });
        expect(output.result).toContain(
            'Dashboard generation failed - all visualizations had validation errors',
        );
        expect(output.structuredContent).toEqual({ error: output.result });
        expect(createOrUpdateArtifact).not.toHaveBeenCalled();
    });

    it('mirrors an unexpected failure as an error result', async () => {
        const output = await executeTool([validViz, anotherValidViz], {
            getPrompt: vi.fn().mockRejectedValue(new Error('prompt is gone')),
        });

        expect(toolDashboardV2OutputSchema.safeParse(output).success).toBe(
            true,
        );
        expect(output.metadata).toEqual({ status: 'error' });
        expect(output.result).toContain('Error generating dashboard.');
        expect(output.result).toContain('prompt is gone');
        expect(output.structuredContent).toEqual({ error: output.result });
    });
});
