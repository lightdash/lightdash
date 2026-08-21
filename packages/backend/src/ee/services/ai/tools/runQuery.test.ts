import {
    TimeFrames,
    type AiWebAppPrompt,
    type SlackPrompt,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import {
    metricQueryMock,
    validExplore,
} from '../../../../services/ProjectService/ProjectService.mock';
import type {
    RunAsyncMergeQueryFn,
    RunAsyncQueryFn,
} from '../types/aiAgentDependencies';
import { AgentContext } from '../utils/AgentContext';
import { renderEcharts } from '../utils/renderEcharts';
import { mockOrdersExplore } from '../utils/validationExplore.mock';
import { getRunQuery } from './runQuery';

// The Slack path renders a real chart via echarts + node-canvas. A native
// render has no place in a unit test — it's slow and fails on runners without
// the canvas binding or fonts — so it's stubbed with a fake PNG buffer.
vi.mock('@sentry/node', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@sentry/node')>();
    return { ...actual, captureException: vi.fn() };
});

vi.mock('../utils/renderEcharts', () => ({
    renderEcharts: vi.fn().mockResolvedValue(Buffer.from('fake-png')),
}));

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
};

const mergeInput = {
    ...toolInput,
    chartConfig: {
        ...toolInput.chartConfig,
        xAxisDimension: 'merge_key',
        yAxisMetrics: ['primary_a_met1', 'comparison_a_met1'],
    },
    mergeConfig: {
        primarySourceId: 'primary',
        additionalSources: [
            {
                id: 'comparison',
                queryConfig: {
                    exploreName: validExplore.name,
                    dimensions: metricQueryMock.dimensions,
                    metrics: metricQueryMock.metrics,
                    sorts: [],
                    customMetrics: null,
                    filters: null,
                },
            },
        ],
        joinKey: [
            {
                name: 'key',
                fields: [
                    {
                        sourceId: 'primary',
                        fieldId: metricQueryMock.dimensions[0],
                    },
                    {
                        sourceId: 'comparison',
                        fieldId: metricQueryMock.dimensions[0],
                    },
                ],
            },
        ],
        joinType: 'full' as const,
    },
};

const executeTool = async (
    runAsyncQuery: RunAsyncQueryFn,
    enableDataAccess = true,
    prompt: AiWebAppPrompt | SlackPrompt = makePrompt(),
    exposeQueryUuid = false,
) => {
    const queryTool = getRunQuery({
        updateProgress: vi.fn().mockResolvedValue(undefined),
        runAsyncQuery,
        runAsyncMergeQuery: vi.fn() as RunAsyncMergeQueryFn,
        enableMergeQueries: false,
        projectParameterDefinitions: {},
        getPrompt: vi.fn().mockResolvedValue(prompt),
        sendFile: vi.fn().mockResolvedValue(undefined),
        createOrUpdateArtifact: vi.fn().mockResolvedValue(undefined),
        maxLimit: 500,
        maxContextRows: Number.POSITIVE_INFINITY,
        exposeQueryUuid,
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
    it('runs a merge through generateVisualization and stores a versioned artifact', async () => {
        const runAsyncQuery = vi.fn() as RunAsyncQueryFn;
        const runAsyncMergeQuery: RunAsyncMergeQueryFn = vi
            .fn()
            .mockResolvedValue({
                queryUuid: '22222222-2222-4222-8222-222222222222',
                rows: [{ merge_key: 'one', primary_a_met1: 1 }],
                cacheMetadata: { cacheHit: false },
                fields: {},
                metricQuery: metricQueryMock,
            });
        const createOrUpdateArtifact = vi.fn().mockResolvedValue(undefined);
        const queryTool = getRunQuery({
            updateProgress: vi.fn().mockResolvedValue(undefined),
            runAsyncQuery,
            runAsyncMergeQuery,
            enableMergeQueries: true,
            projectParameterDefinitions: {},
            getPrompt: vi.fn().mockResolvedValue(makePrompt()),
            sendFile: vi.fn().mockResolvedValue(undefined),
            createOrUpdateArtifact,
            maxLimit: 500,
            maxContextRows: Number.POSITIVE_INFINITY,
            exposeQueryUuid: false,
            enableDataAccess: true,
        });
        const output = await queryTool.execute!(mergeInput, {
            messages: [],
            toolCallId: 'tool-call-1',
            experimental_context: new AgentContext([validExplore]),
        });
        if (Symbol.asyncIterator in output) {
            throw new Error('Expected a non-streaming tool result');
        }

        expect(runAsyncQuery).not.toHaveBeenCalled();
        expect(runAsyncMergeQuery).toHaveBeenCalledWith(
            expect.objectContaining({
                sources: expect.arrayContaining([
                    expect.objectContaining({ id: 'primary' }),
                    expect.objectContaining({ id: 'comparison' }),
                ]),
                joinType: 'full',
            }),
            undefined,
        );
        expect(createOrUpdateArtifact).toHaveBeenCalledWith(
            expect.objectContaining({
                vizConfig: {
                    source: 'merge',
                    schemaVersion: 1,
                    config: mergeInput,
                },
            }),
        );
        expect(output.metadata).toMatchObject({
            status: 'success',
            queryUuid: '22222222-2222-4222-8222-222222222222',
        });
    });

    it('resolves and persists each merge source expression in its explore scope', async () => {
        const runAsyncMergeQuery: RunAsyncMergeQueryFn = vi
            .fn()
            .mockResolvedValue({
                queryUuid: '22222222-2222-4222-8222-222222222222',
                rows: [{ merge_key: 'one', primary_a_met1: 1 }],
                cacheMetadata: { cacheHit: false },
                fields: {},
                metricQuery: metricQueryMock,
            });
        const createOrUpdateArtifact = vi.fn().mockResolvedValue(undefined);
        const queryTool = getRunQuery({
            updateProgress: vi.fn().mockResolvedValue(undefined),
            runAsyncQuery: vi.fn() as RunAsyncQueryFn,
            runAsyncMergeQuery,
            enableMergeQueries: true,
            enableFilterExpressions: true,
            projectParameterDefinitions: {},
            getPrompt: vi.fn().mockResolvedValue(makePrompt()),
            sendFile: vi.fn().mockResolvedValue(undefined),
            createOrUpdateArtifact,
            maxLimit: 500,
            maxContextRows: Number.POSITIVE_INFINITY,
            exposeQueryUuid: false,
            enableDataAccess: true,
        });
        const expressionMergeInput = {
            ...mergeInput,
            queryConfig: {
                ...mergeInput.queryConfig,
                filters: {
                    dimensions: 'a_dim1 equals=primary',
                    metrics: null,
                    tableCalculations: null,
                },
            },
            mergeConfig: {
                ...mergeInput.mergeConfig,
                additionalSources: mergeInput.mergeConfig.additionalSources.map(
                    (source) => ({
                        ...source,
                        queryConfig: {
                            ...source.queryConfig,
                            filters: {
                                dimensions: 'a_dim1 equals=comparison',
                                metrics: null,
                                tableCalculations: null,
                            },
                        },
                    }),
                ),
            },
        };

        const output = await queryTool.execute!(expressionMergeInput, {
            messages: [],
            toolCallId: 'tool-call-1',
            experimental_context: new AgentContext([validExplore]),
        });
        if (Symbol.asyncIterator in output) {
            throw new Error('Expected a non-streaming tool result');
        }

        expect(output.metadata.status).toBe('success');
        expect(runAsyncMergeQuery).toHaveBeenCalledOnce();
        expect(createOrUpdateArtifact).toHaveBeenCalledWith(
            expect.objectContaining({
                vizConfig: expect.objectContaining({
                    source: 'filterExpression',
                    schemaVersion: 1,
                    expressionArgs: expect.objectContaining({
                        queryConfig: expect.objectContaining({
                            filters: expressionMergeInput.queryConfig.filters,
                        }),
                        mergeConfig: expect.objectContaining({
                            additionalSources: [
                                expect.objectContaining({
                                    queryConfig: expect.objectContaining({
                                        filters:
                                            expressionMergeInput.mergeConfig
                                                .additionalSources[0]
                                                .queryConfig.filters,
                                    }),
                                }),
                            ],
                        }),
                    }),
                    resolvedArgs: expect.objectContaining({
                        queryConfig: expect.objectContaining({
                            filters: expect.objectContaining({
                                dimensions: [
                                    expect.objectContaining({
                                        fieldId: 'a_dim1',
                                        values: ['primary'],
                                    }),
                                ],
                            }),
                        }),
                        mergeConfig: expect.objectContaining({
                            additionalSources: [
                                expect.objectContaining({
                                    queryConfig: expect.objectContaining({
                                        filters: expect.objectContaining({
                                            dimensions: [
                                                expect.objectContaining({
                                                    fieldId: 'a_dim1',
                                                    values: ['comparison'],
                                                }),
                                            ],
                                        }),
                                    }),
                                }),
                            ],
                        }),
                    }),
                }),
            }),
        );
    });

    it('keeps flag-off semantic artifact writes unchanged', async () => {
        const createOrUpdateArtifact = vi.fn().mockResolvedValue(undefined);
        const runAsyncQuery: RunAsyncQueryFn = vi.fn().mockResolvedValue({
            queryUuid: '11111111-1111-4111-8111-111111111111',
            rows: [{ a_dim1: 'one', a_met1: 1 }],
            cacheMetadata: { cacheHit: false },
            fields: {},
        });
        const queryTool = getRunQuery({
            updateProgress: vi.fn().mockResolvedValue(undefined),
            runAsyncQuery,
            runAsyncMergeQuery: vi.fn() as RunAsyncMergeQueryFn,
            enableMergeQueries: false,
            enableFilterExpressions: false,
            projectParameterDefinitions: {},
            getPrompt: vi.fn().mockResolvedValue(makePrompt()),
            sendFile: vi.fn().mockResolvedValue(undefined),
            createOrUpdateArtifact,
            maxLimit: 500,
            maxContextRows: Number.POSITIVE_INFINITY,
            exposeQueryUuid: false,
            enableDataAccess: true,
        });

        await queryTool.execute!(toolInput, {
            messages: [],
            toolCallId: 'tool-call-1',
            experimental_context: new AgentContext([validExplore]),
        });

        expect(createOrUpdateArtifact).toHaveBeenCalledWith(
            expect.objectContaining({
                vizConfig: {
                    source: 'semantic',
                    config: toolInput,
                },
            }),
        );
    });

    it('resolves filter expressions before query execution and persists both forms', async () => {
        const createOrUpdateArtifact = vi.fn().mockResolvedValue(undefined);
        const runAsyncQuery: RunAsyncQueryFn = vi.fn().mockResolvedValue({
            queryUuid: '11111111-1111-4111-8111-111111111111',
            rows: [{ a_dim1: 'one', a_met1: 1 }],
            cacheMetadata: { cacheHit: false },
            fields: {},
        });
        const queryTool = getRunQuery({
            updateProgress: vi.fn().mockResolvedValue(undefined),
            runAsyncQuery,
            runAsyncMergeQuery: vi.fn() as RunAsyncMergeQueryFn,
            enableMergeQueries: false,
            enableFilterExpressions: true,
            projectParameterDefinitions: {},
            getPrompt: vi.fn().mockResolvedValue(makePrompt()),
            sendFile: vi.fn().mockResolvedValue(undefined),
            createOrUpdateArtifact,
            maxLimit: 500,
            maxContextRows: Number.POSITIVE_INFINITY,
            exposeQueryUuid: false,
            enableDataAccess: true,
        });
        const expressionInput = {
            ...toolInput,
            queryConfig: {
                ...toolInput.queryConfig,
                filters: {
                    dimensions: 'a_dim1 equals=one',
                    metrics: null,
                    tableCalculations: null,
                },
            },
        };

        const output = await queryTool.execute!(expressionInput, {
            messages: [],
            toolCallId: 'tool-call-1',
            experimental_context: new AgentContext([validExplore]),
        });
        if (Symbol.asyncIterator in output) {
            throw new Error('Expected a non-streaming tool result');
        }

        expect(output.metadata.status).toBe('success');
        expect(runAsyncQuery).toHaveBeenCalledWith(
            expect.objectContaining({
                filters: expect.objectContaining({
                    dimensions: expect.objectContaining({
                        and: [
                            expect.objectContaining({
                                target: expect.objectContaining({
                                    fieldId: 'a_dim1',
                                }),
                                values: ['one'],
                            }),
                        ],
                    }),
                }),
            }),
            expect.anything(),
            undefined,
        );
        expect(createOrUpdateArtifact).toHaveBeenCalledWith(
            expect.objectContaining({
                vizConfig: expect.objectContaining({
                    source: 'filterExpression',
                    schemaVersion: 1,
                    expressionArgs: expect.objectContaining({
                        queryConfig: expect.objectContaining({
                            filters: expressionInput.queryConfig.filters,
                        }),
                    }),
                    resolvedArgs: expect.objectContaining({
                        queryConfig: expect.objectContaining({
                            filters: expect.objectContaining({
                                dimensions: [
                                    expect.objectContaining({
                                        fieldId: 'a_dim1',
                                        values: ['one'],
                                    }),
                                ],
                            }),
                        }),
                        mergeConfig: null,
                    }),
                }),
            }),
        );
    });

    it('expands period-comparison chart metrics in both persisted forms', async () => {
        const popExplore = {
            ...mockOrdersExplore,
            tables: {
                ...mockOrdersExplore.tables,
                orders: {
                    ...mockOrdersExplore.tables.orders,
                    dimensions: {
                        ...mockOrdersExplore.tables.orders.dimensions,
                        order_date: {
                            ...mockOrdersExplore.tables.orders.dimensions
                                .order_date,
                            timeInterval: TimeFrames.MONTH,
                        },
                    },
                },
            },
        };
        const createOrUpdateArtifact = vi.fn().mockResolvedValue(undefined);
        const runAsyncQuery: RunAsyncQueryFn = vi.fn().mockResolvedValue({
            queryUuid: '11111111-1111-4111-8111-111111111111',
            rows: [{ orders_order_date: '2025-01-01' }],
            cacheMetadata: { cacheHit: false },
            fields: {},
        });
        const queryTool = getRunQuery({
            updateProgress: vi.fn().mockResolvedValue(undefined),
            runAsyncQuery,
            runAsyncMergeQuery: vi.fn() as RunAsyncMergeQueryFn,
            enableMergeQueries: false,
            enableFilterExpressions: true,
            projectParameterDefinitions: {},
            getPrompt: vi.fn().mockResolvedValue(makePrompt()),
            sendFile: vi.fn().mockResolvedValue(undefined),
            createOrUpdateArtifact,
            maxLimit: 500,
            maxContextRows: Number.POSITIVE_INFINITY,
            exposeQueryUuid: false,
            enableDataAccess: true,
        });
        const expressionInput = {
            title: 'Revenue by month',
            description: 'Monthly revenue and prior period',
            queryConfig: {
                exploreName: popExplore.name,
                dimensions: ['orders_order_date'],
                metrics: ['orders_total_revenue'],
                sorts: [],
                limit: 500,
                parameters: null,
                customMetrics: [
                    {
                        kind: 'periodComparison' as const,
                        baseMetricId: 'orders_total_revenue',
                        timeDimensionId: 'orders_order_date',
                        granularity: TimeFrames.MONTH,
                        periodOffset: 1,
                    },
                ],
                tableCalculations: null,
                filters: null,
            },
            chartConfig: {
                ...toolInput.chartConfig,
                xAxisDimension: 'orders_order_date',
                yAxisMetrics: ['orders_total_revenue'],
                xAxisType: 'time' as const,
            },
        };

        await queryTool.execute!(expressionInput, {
            messages: [],
            toolCallId: 'tool-call-1',
            experimental_context: new AgentContext([popExplore]),
        });

        expect(createOrUpdateArtifact).toHaveBeenCalledWith(
            expect.objectContaining({
                vizConfig: expect.objectContaining({
                    source: 'filterExpression',
                    expressionArgs: expect.objectContaining({
                        chartConfig: expect.objectContaining({
                            yAxisMetrics: [
                                'orders_total_revenue',
                                expect.any(String),
                            ],
                        }),
                    }),
                    resolvedArgs: expect.objectContaining({
                        chartConfig: expect.objectContaining({
                            yAxisMetrics: [
                                'orders_total_revenue',
                                expect.any(String),
                            ],
                        }),
                    }),
                }),
            }),
        );
    });

    it('returns located filter-expression errors without execution or Sentry capture', async () => {
        vi.mocked(Sentry.captureException).mockClear();
        const runAsyncQuery = vi.fn() as RunAsyncQueryFn;
        const createOrUpdateArtifact = vi.fn().mockResolvedValue(undefined);
        const queryTool = getRunQuery({
            updateProgress: vi.fn().mockResolvedValue(undefined),
            runAsyncQuery,
            runAsyncMergeQuery: vi.fn() as RunAsyncMergeQueryFn,
            enableMergeQueries: false,
            enableFilterExpressions: true,
            projectParameterDefinitions: {},
            getPrompt: vi.fn().mockResolvedValue(makePrompt()),
            sendFile: vi.fn().mockResolvedValue(undefined),
            createOrUpdateArtifact,
            maxLimit: 500,
            maxContextRows: Number.POSITIVE_INFINITY,
            exposeQueryUuid: false,
            enableDataAccess: true,
        });

        const output = await queryTool.execute!(
            {
                ...toolInput,
                queryConfig: {
                    ...toolInput.queryConfig,
                    filters: {
                        dimensions: 'unknown_field equals=one',
                        metrics: null,
                        tableCalculations: null,
                    },
                },
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

        expect(output).toMatchObject({
            result: expect.stringContaining(
                '[FILTER_EXPRESSION_UNKNOWN_FIELD]',
            ),
            metadata: { status: 'error' },
        });
        expect(output.result).toContain('Problem:');
        expect(output.result).toContain('How to fix:');
        expect(runAsyncQuery).not.toHaveBeenCalled();
        expect(createOrUpdateArtifact).not.toHaveBeenCalled();
        expect(Sentry.captureException).not.toHaveBeenCalled();
    });

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
        // Proves the Slack chart path ran rather than short-circuiting.
        expect(vi.mocked(renderEcharts)).toHaveBeenCalled();
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

describe('getRunQuery query UUID visibility', () => {
    const runAsyncQuery: RunAsyncQueryFn = vi.fn().mockResolvedValue({
        queryUuid: '11111111-1111-4111-8111-111111111111',
        rows: [{ a_dim1: 'one', a_met1: 1 }],
        cacheMetadata: { cacheHit: false },
        fields: {},
    });

    it('keeps the query UUID out of the model result by default', async () => {
        const output = await executeTool(runAsyncQuery);

        expect(output.result).not.toContain(
            '11111111-1111-4111-8111-111111111111',
        );
    });

    it('states the query UUID in the model result when charts must cite it', async () => {
        const output = await executeTool(
            runAsyncQuery,
            true,
            makePrompt(),
            true,
        );

        // Without this the agent cannot cite a real execution and invents one.
        expect(output.result).toContain(
            "This execution's queryUuid is 11111111-1111-4111-8111-111111111111",
        );
    });

    it('states the query UUID even when row data is hidden', async () => {
        const output = await executeTool(
            runAsyncQuery,
            false,
            makeSlackPrompt(),
            true,
        );

        expect(output.result).toContain('11111111-1111-4111-8111-111111111111');
    });
});

describe('getRunQuery parameters', () => {
    const parameterizedExplore = {
        ...validExplore,
        tables: {
            ...validExplore.tables,
            a: {
                ...validExplore.tables.a,
                parameters: {
                    metric: {
                        label: 'Metric',
                        options: ['revenue', 'active_users'],
                        default: 'revenue',
                    },
                },
                dimensions: {
                    ...validExplore.tables.a.dimensions,
                    dim1: {
                        ...validExplore.tables.a.dimensions.dim1,
                        parameterReferences: ['a.metric'],
                    },
                },
            },
        },
    };

    const makeQueryResults = () => ({
        queryUuid: '11111111-1111-4111-8111-111111111111',
        rows: [{ a_dim1: 'one', a_met1: 1 }],
        cacheMetadata: { cacheHit: false },
        fields: {},
    });

    const executeWithParameters = async (
        parameters: Record<string, string | number | string[]> | null,
        runAsyncQuery: RunAsyncQueryFn,
    ) => {
        const queryTool = getRunQuery({
            updateProgress: vi.fn().mockResolvedValue(undefined),
            runAsyncQuery,
            runAsyncMergeQuery: vi.fn() as RunAsyncMergeQueryFn,
            enableMergeQueries: false,
            projectParameterDefinitions: {},
            getPrompt: vi.fn().mockResolvedValue(makePrompt()),
            sendFile: vi.fn().mockResolvedValue(undefined),
            createOrUpdateArtifact: vi.fn().mockResolvedValue(undefined),
            maxLimit: 500,
            maxContextRows: Number.POSITIVE_INFINITY,
            exposeQueryUuid: false,
            enableDataAccess: true,
        });
        const output = await queryTool.execute!(
            {
                ...toolInput,
                queryConfig: { ...toolInput.queryConfig, parameters },
            },
            {
                messages: [],
                toolCallId: 'tool-call-1',
                experimental_context: new AgentContext([parameterizedExplore]),
            },
        );
        if (Symbol.asyncIterator in output) {
            throw new Error('Expected a non-streaming tool result');
        }
        return output;
    };

    it('passes parameter values through to query execution', async () => {
        const runAsyncQuery: RunAsyncQueryFn = vi
            .fn()
            .mockResolvedValue(makeQueryResults());

        const output = await executeWithParameters(
            { 'a.metric': 'active_users' },
            runAsyncQuery,
        );

        expect(runAsyncQuery).toHaveBeenCalledWith(
            expect.anything(),
            expect.anything(),
            { 'a.metric': 'active_users' },
        );
        expect(output.result).toContain(
            'set explicitly: {"a.metric":"active_users"}',
        );
    });

    it('reports default-resolved values when the agent sets nothing', async () => {
        const runAsyncQuery: RunAsyncQueryFn = vi
            .fn()
            .mockResolvedValue(makeQueryResults());

        const output = await executeWithParameters(null, runAsyncQuery);

        expect(runAsyncQuery).toHaveBeenCalledWith(
            expect.anything(),
            expect.anything(),
            undefined,
        );
        expect(output.result).toContain(
            'resolved to defaults: {"a.metric":"revenue"}',
        );
    });

    it('rejects unknown parameter names without running the query', async () => {
        const runAsyncQuery: RunAsyncQueryFn = vi
            .fn()
            .mockResolvedValue(makeQueryResults());

        const output = await executeWithParameters(
            { nonsense: 'x' },
            runAsyncQuery,
        );

        expect(runAsyncQuery).not.toHaveBeenCalled();
        expect(output.metadata.status).toBe('error');
        expect(output.result).toContain('unknown parameter "nonsense"');
        expect(output.result).toContain('a.metric');
    });

    it('rejects values outside the declared options', async () => {
        const runAsyncQuery: RunAsyncQueryFn = vi
            .fn()
            .mockResolvedValue(makeQueryResults());

        const output = await executeWithParameters(
            { 'a.metric': 'nope' },
            runAsyncQuery,
        );

        expect(runAsyncQuery).not.toHaveBeenCalled();
        expect(output.metadata.status).toBe('error');
        expect(output.result).toContain(
            'Allowed options: revenue, active_users',
        );
    });

    it('reports referenced parameters that are unset with no default', async () => {
        const noDefaultExplore = {
            ...parameterizedExplore,
            tables: {
                ...parameterizedExplore.tables,
                a: {
                    ...parameterizedExplore.tables.a,
                    parameters: {
                        metric: {
                            label: 'Metric',
                            options: ['revenue', 'active_users'],
                        },
                    },
                },
            },
        };
        const runAsyncQuery: RunAsyncQueryFn = vi
            .fn()
            .mockResolvedValue(makeQueryResults());
        const queryTool = getRunQuery({
            updateProgress: vi.fn().mockResolvedValue(undefined),
            runAsyncQuery,
            runAsyncMergeQuery: vi.fn() as RunAsyncMergeQueryFn,
            enableMergeQueries: false,
            projectParameterDefinitions: {},
            getPrompt: vi.fn().mockResolvedValue(makePrompt()),
            sendFile: vi.fn().mockResolvedValue(undefined),
            createOrUpdateArtifact: vi.fn().mockResolvedValue(undefined),
            maxLimit: 500,
            maxContextRows: Number.POSITIVE_INFINITY,
            exposeQueryUuid: false,
            enableDataAccess: true,
        });
        const output = await queryTool.execute!(
            {
                ...toolInput,
                queryConfig: { ...toolInput.queryConfig, parameters: null },
            },
            {
                messages: [],
                toolCallId: 'tool-call-1',
                experimental_context: new AgentContext([noDefaultExplore]),
            },
        );
        if (Symbol.asyncIterator in output) {
            throw new Error('Expected a non-streaming tool result');
        }

        expect(output.result).toContain('unset with no default: a.metric');
    });

    it('rejects a list for a single-value parameter', async () => {
        const runAsyncQuery: RunAsyncQueryFn = vi
            .fn()
            .mockResolvedValue(makeQueryResults());

        const output = await executeWithParameters(
            { 'a.metric': ['revenue', 'active_users'] },
            runAsyncQuery,
        );

        expect(runAsyncQuery).not.toHaveBeenCalled();
        expect(output.metadata.status).toBe('error');
        expect(output.result).toContain('single value');
    });
});
