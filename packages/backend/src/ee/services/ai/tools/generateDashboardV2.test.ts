import {
    toolDashboardV2ArgsSchemaPersisted,
    toolDashboardV2OutputSchema,
    type AiWebAppPrompt,
} from '@lightdash/common';
import {
    metricQueryMock,
    validExplore,
} from '../../../../services/ProjectService/ProjectService.mock';
import { AiDecisionClient } from '../decisions/AiDecisionClient';
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

const visualization = (title: string) => ({
    title,
    description: title,
    chartConfig: null,
    mergeConfig: null,
    queryConfig: {
        ...metricQueryMock,
        sorts: metricQueryMock.sorts.map((sort) => ({
            ...sort,
            nullsFirst: sort.nullsFirst ?? null,
        })),
        customMetrics: null,
        tableCalculations: null,
        filters: null,
        parameters: null,
    },
});
const args = {
    title: 'Overview',
    description: 'Dashboard',
    visualizations: [visualization('Trend'), visualization('Breakdown')],
};
const options = {
    toolCallId: 'dashboard-call',
    messages: [],
    context: {},
};
const setup = (fast = true, availableExplores = [validExplore]) => {
    const request = vi
        .fn<typeof fetch>()
        .mockImplementation(async (_url, init) => {
            const { questions } = JSON.parse(String(init?.body));
            return Response.json({
                model: 'test',
                answers: Object.fromEntries(
                    Object.keys(questions).map((key) => {
                        const selected =
                            key === 'template'
                                ? 'stacked'
                                : `tile_${Object.keys(questions).length - 2 - Number(key.split('_')[1])}`;
                        return [
                            key,
                            {
                                type: 'choice',
                                choice: selected,
                                confidence: 0.99,
                                probabilities: { [selected]: 1 },
                            },
                        ];
                    }),
                ),
            });
        });
    const createOrUpdateArtifact = vi.fn().mockResolvedValue({});
    const getPrompt = vi
        .fn()
        .mockResolvedValue({ threadUuid: 'thread-1', promptUuid: 'prompt-1' });
    const tool = getGenerateDashboardV2({
        agentContext: new AgentContext(availableExplores),
        getPrompt,
        createOrUpdateArtifact,
        decisions: fast
            ? new AiDecisionClient(
                  { apiKey: 'test', model: 'test', timeoutMs: 100 },
                  request,
              )
            : undefined,
        userQuestion: 'Show Breakdown before Trend, in a single column',
    });
    return { tool, request, createOrUpdateArtifact };
};

describe('dashboard artifact layout', () => {
    it('persists generated positions without reordering or changing query configurations', async () => {
        const { tool, request, createOrUpdateArtifact } = setup();
        const original = structuredClone(args);
        expect(await tool.execute!(args, options)).toMatchObject({
            result: expect.stringContaining('Dashboard layout: stacked.'),
            metadata: { status: 'success' },
        });
        const config = createOrUpdateArtifact.mock.calls[0][0].vizConfig;
        expect(
            toolDashboardV2ArgsSchemaPersisted.safeParse(config).success,
        ).toBe(true);
        expect(config.visualizations).toEqual(args.visualizations);
        expect(config.layout.positions[1].y).toBe(0);
        expect(config.layout.positions[0].y).toBeGreaterThan(0);
        expect(args).toEqual(original);
        expect(request).toHaveBeenCalledOnce();
        expect(createOrUpdateArtifact).toHaveBeenCalledOnce();
    });

    it('excludes invalid sources before choosing a layout and supports a usable single-chart artifact', async () => {
        const { tool, request, createOrUpdateArtifact } = setup();
        const input = {
            ...args,
            visualizations: [
                args.visualizations[0],
                {
                    ...args.visualizations[1],
                    title: 'Forbidden secret',
                    queryConfig: {
                        ...args.visualizations[1].queryConfig,
                        exploreName: 'not-authorized',
                    },
                },
            ],
        };
        expect(await tool.execute!(input, options)).toMatchObject({
            metadata: { status: 'success' },
        });
        const config = createOrUpdateArtifact.mock.calls[0][0].vizConfig;
        expect(config.visualizations).toHaveLength(1);
        expect(config.layout.positions).toHaveLength(1);
        expect(
            toolDashboardV2ArgsSchemaPersisted.safeParse(config).success,
        ).toBe(true);
        expect(String(request.mock.calls[0][1]?.body)).not.toContain(
            'Forbidden secret',
        );
    });

    it('does not classify or publish when all source validation fails', async () => {
        const { tool, request, createOrUpdateArtifact } = setup(true, []);
        await tool.execute!(args, options);
        expect(request).not.toHaveBeenCalled();
        expect(createOrUpdateArtifact).not.toHaveBeenCalled();
    });

    it.each([false, true])(
        'preserves generation with decisions disabled or unavailable (%s)',
        async (fast) => {
            const { tool, request, createOrUpdateArtifact } = setup(fast);
            request.mockRejectedValue(new Error('offline'));
            expect(await tool.execute!(args, options)).toMatchObject({
                result: fast
                    ? 'Dashboard uses the default layout. No requested custom arrangement was applied.'
                    : 'Success',
                metadata: { status: 'success' },
            });
            expect(createOrUpdateArtifact.mock.calls[0][0].vizConfig).toEqual(
                args,
            );
            expect(request).toHaveBeenCalledTimes(fast ? 1 : 0);
        },
    );
});

const prompt: AiWebAppPrompt = {
    organizationUuid: 'org-uuid',
    projectUuid: 'project-uuid',
    agentUuid: 'agent-uuid',
    promptUuid: 'prompt-uuid',
    threadUuid: 'thread-uuid',
    threadCreatedFrom: 'web_app',
    threadEmbedSpaceUuid: null,
    createdByUserUuid: 'user-uuid',
    userUuid: 'user-uuid',
    prompt: 'Build a dashboard',
    createdAt: new Date('2026-07-31T00:00:00Z'),
    response: null,
    errorMessage: null,
    humanScore: null,
    modelConfig: null,
    battleProfile: null,
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
        agentContext: new AgentContext([validExplore]),
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
        { messages: [], toolCallId: 'tool-call-1', context: {} },
    );
    if (Symbol.asyncIterator in output) {
        throw new Error('Expected a non-streaming tool result');
    }
    return output;
};

describe('getGenerateDashboardV2 structured output', () => {
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
