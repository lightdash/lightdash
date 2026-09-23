import {
    DimensionType,
    FilterOperator,
    FilterType,
    getTotalFilterRules,
    MergeJoinType,
    MetricType,
    TimeFrames,
    type AiArtifact,
    type AiWebAppPrompt,
    type Explore,
    type SlackPrompt,
    type ToolRunQueryArgs,
    type ToolRunQueryCustomChartTypeConfig,
    type ToolRunQueryExpressionRuntimeArgs,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import {
    metricQueryMock,
    validExplore,
} from '../../../../services/ProjectService/ProjectService.mock';
import { AiDecisionClient } from '../decisions/AiDecisionClient';
import type {
    DeferSlackVisualizationFn,
    ExportCustomChartTypeImageFn,
    ResolveCustomChartTypeFn,
    RunAsyncMergeQueryFn,
    RunAsyncQueryFn,
    SendFileFn,
} from '../types/aiAgentDependencies';
import { AgentContext } from '../utils/AgentContext';
import { renderEcharts } from '../utils/renderEcharts';
import { mockOrdersExplore } from '../utils/validationExplore.mock';
import { getRunQuery } from './runQuery';

vi.mock('@sentry/node', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@sentry/node')>();
    return { ...actual, captureException: vi.fn() };
});

// The Slack path renders a real chart via echarts + node-canvas. A native
// render has no place in a unit test — it's slow and fails on runners without
// the canvas binding or fonts — so it's stubbed with a fake PNG buffer.
vi.mock('../utils/renderEcharts', () => ({
    renderEcharts: vi.fn().mockResolvedValue(Buffer.from('fake-png')),
}));

const makePrompt = (): AiWebAppPrompt => ({
    organizationUuid: 'org-uuid',
    projectUuid: 'project-uuid',
    agentUuid: 'agent-uuid',
    promptUuid: 'prompt-uuid',
    threadUuid: 'thread-uuid',
    threadCreatedFrom: 'web_app',
    createdByUserUuid: 'user-uuid',
    userUuid: 'user-uuid',
    prompt: 'Show the baseline',
    createdAt: new Date('2026-07-31T00:00:00Z'),
    response: null,
    errorMessage: null,
    humanScore: null,
    modelConfig: null,
    battleProfile: null,
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
        joinType: MergeJoinType.FULL,
    },
};

const executeTool = async (
    runAsyncQuery: RunAsyncQueryFn,
    enableDataAccess = true,
    prompt: AiWebAppPrompt | SlackPrompt = makePrompt(),
    exposeQueryUuid = false,
    slackLinksOnly = false,
    decisions?: AiDecisionClient,
    input: ToolRunQueryArgs | ToolRunQueryExpressionRuntimeArgs = toolInput,
    enableFilterExpressions = false,
    explore: Explore = validExplore,
    agentContext = new AgentContext([explore]),
    enableFastResponse = false,
    purpose: 'visualization' | 'answer' = 'visualization',
    artifact?: Pick<AiArtifact, 'artifactUuid' | 'versionUuid'>,
) => {
    const queryTool = getRunQuery({
        purpose,
        enableFastResponse,
        decisions,
        agentContext,
        updateProgress: vi.fn().mockResolvedValue(undefined),
        runAsyncQuery,
        runAsyncMergeQuery: vi.fn() as RunAsyncMergeQueryFn,
        enableMergeQueries: false,
        enableFilterExpressions,
        projectParameterDefinitions: {},
        getPrompt: vi.fn().mockResolvedValue(prompt),
        sendFile: vi.fn().mockResolvedValue(undefined),
        createOrUpdateArtifact: vi.fn().mockResolvedValue(artifact),
        maxLimit: 500,
        maxContextRows: Number.POSITIVE_INFINITY,
        exposeQueryUuid,
        enableDataAccess,
        slackLinksOnly,
        resolveCustomChartType: vi.fn().mockResolvedValue(null),
        exportCustomChartTypeImage: vi.fn() as ExportCustomChartTypeImageFn,
    });

    const output = await queryTool.execute!(input, {
        messages: [],
        toolCallId: 'tool-call-1',
        context: {},
    });
    if (Symbol.asyncIterator in output) {
        throw new Error('Expected a non-streaming tool result');
    }
    return output;
};

describe('getRunQuery', () => {
    it.each([false, true])(
        'only exposes the internal fast response when explicitly enabled: %s',
        async (enabled) => {
            const output = await executeTool(
                vi.fn().mockResolvedValue({
                    queryUuid: 'query-1',
                    rows: [{ a_dim1: 'x', a_met1: 1 }],
                    fields: {},
                    cacheMetadata: { cacheHit: false },
                }),
                true,
                makePrompt(),
                false,
                false,
                undefined,
                toolInput,
                false,
                validExplore,
                new AgentContext([validExplore]),
                enabled,
                'answer',
            );

            expect(output.metadata).toHaveProperty('status', 'success');
            if (enabled) {
                expect(output.metadata).toHaveProperty('fastResponse');
            } else {
                expect(output.metadata).not.toHaveProperty('fastResponse');
            }
        },
    );

    it.each([false, true])(
        'only flagged presentation requests forward a previous result reference: %s',
        async (enabled) => {
            const ctx = new AgentContext([validExplore]);
            ctx.previousQueryUuid = 'previous-query';
            const run = vi.fn().mockResolvedValue({
                queryUuid: 'previous-query',
                rows: [{ a_dim1: 'x', a_met1: 0 }],
                fields: {},
                cacheMetadata: {
                    cacheHit: enabled,
                    queryReuseHit: enabled,
                },
            });
            const decisions = enabled
                ? new AiDecisionClient({
                      apiKey: null,
                      model: 'test',
                      timeoutMs: 100,
                  })
                : undefined;
            const output = await executeTool(
                run,
                true,
                makePrompt(),
                false,
                false,
                decisions,
                toolInput,
                false,
                validExplore,
                ctx,
            );
            expect(output.metadata.status).toBe('success');
            expect(run.mock.calls[0].length).toBe(enabled ? 5 : 3);
            if (enabled) expect(run.mock.calls[0][4]).toBe('previous-query');
            expect(output.metadata.queryReuseHit).toBe(enabled);
        },
    );

    it('suggests an authorized dimension for an unknown expression-filter field without rewriting it', async () => {
        const decisions = new AiDecisionClient({
            apiKey: null,
            model: 'test',
            timeoutMs: 100,
        });
        vi.spyOn(decisions, 'evaluate').mockImplementation(
            async ({ questions }) => {
                const question = questions.field_0;
                if (question.type !== 'choice')
                    throw new Error('Expected choice');
                expect(Object.values(question.criteria)).not.toContain(
                    'a_met1',
                );
                const choice = Object.entries(question.criteria).find(
                    ([, value]) => value === 'a_dim1',
                )![0];
                return {
                    field_0: {
                        type: 'choice',
                        choice,
                        confidence: 0.99,
                        probabilities: { [choice]: 1 },
                    },
                };
            },
        );
        const runAsyncQuery = vi.fn();
        const input = {
            ...toolInput,
            queryConfig: {
                ...toolInput.queryConfig,
                filters: {
                    dimensions: 'customer_tier equals=gold',
                    metrics: null,
                    tableCalculations: null,
                },
            },
        };
        const output = await executeTool(
            runAsyncQuery,
            true,
            makePrompt(),
            false,
            false,
            decisions,
            input,
            true,
        );
        expect(output.metadata.status).toBe('error');
        expect(output.result).toContain('FILTER_EXPRESSION_UNKNOWN_FIELD');
        expect(output.result).toContain('"customer_tier" → "a_dim1"');
        expect(input.queryConfig.filters.dimensions).toBe(
            'customer_tier equals=gold',
        );
        expect(runAsyncQuery).not.toHaveBeenCalled();
    });

    it('returns bounded alias guidance for invalid fields without executing a rewritten query', async () => {
        const decisions = new AiDecisionClient({
            apiKey: null,
            model: 'test',
            timeoutMs: 100,
        });
        vi.spyOn(decisions, 'evaluate').mockImplementation(
            async ({ questions }) => {
                const question = questions.field_0;
                if (question.type !== 'choice')
                    throw new Error('Expected choice');
                const choice = Object.entries(question.criteria).find(
                    ([, value]) => value === 'a_met1',
                )![0];
                return {
                    field_0: {
                        type: 'choice',
                        choice,
                        confidence: 0.99,
                        probabilities: { [choice]: 1 },
                    },
                };
            },
        );
        const runAsyncQuery = vi.fn();
        const input = {
            ...toolInput,
            queryConfig: { ...toolInput.queryConfig, metrics: ['total_sales'] },
        };
        const output = await executeTool(
            runAsyncQuery,
            true,
            makePrompt(),
            false,
            false,
            decisions,
            input,
        );
        expect(output.metadata.status).toBe('error');
        expect(output.result).toContain('"total_sales" → "a_met1"');
        expect(output.result).toContain('Unknown or incompatible metric IDs');
        expect(output.result).toContain('Full field inventory omitted');
        expect(output.result).not.toContain('Available fields:');
        const legacy = await executeTool(
            runAsyncQuery,
            true,
            makePrompt(),
            false,
            false,
            undefined,
            input,
        );
        expect(legacy.result).toContain('Available fields:');
        expect(legacy.result).not.toContain('Full field inventory omitted');
        expect(runAsyncQuery).not.toHaveBeenCalled();
        expect(input.queryConfig.metrics).toEqual(['total_sales']);
    });

    it.each([false, true])(
        'runs a merge and registers export only when enabled (%s)',
        async (enableChartExport) => {
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
            const createOrUpdateArtifact = vi.fn().mockResolvedValue({
                artifactUuid: 'stored-chart',
                versionUuid: 'stored-version',
            });
            const context = new AgentContext([validExplore]);
            const queryTool = getRunQuery({
                agentContext: context,
                enableChartExport,
                updateProgress: vi.fn().mockResolvedValue(undefined),
                runAsyncQuery,
                runAsyncMergeQuery,
                enableMergeQueries: true,
                enableFilterExpressions: false,
                projectParameterDefinitions: {},
                getPrompt: vi.fn().mockResolvedValue(makePrompt()),
                sendFile: vi.fn().mockResolvedValue(undefined),
                createOrUpdateArtifact,
                maxLimit: 500,
                maxContextRows: Number.POSITIVE_INFINITY,
                exposeQueryUuid: false,
                enableDataAccess: true,
                slackLinksOnly: false,
                resolveCustomChartType: vi.fn().mockResolvedValue(null),
                exportCustomChartTypeImage:
                    vi.fn() as ExportCustomChartTypeImageFn,
            });
            const output = await queryTool.execute!(mergeInput, {
                messages: [],
                toolCallId: 'tool-call-1',
                context: {},
            });
            if (Symbol.asyncIterator in output) {
                throw new Error('Expected a non-streaming tool result');
            }

            if (enableChartExport) {
                expect(
                    context.getChartExport(
                        '22222222-2222-4222-8222-222222222222',
                    ).mergeQuery,
                ).toEqual(vi.mocked(runAsyncMergeQuery).mock.calls[0][0]);
                expect(output.result).toContain('exportChartAsCode');
                expect(output.result).toContain(
                    'artifactUuid=stored-chart, versionUuid=stored-version',
                );
                expect(output.result).toContain('queryUuid set to null');
                expect(output.result).not.toContain(
                    'queryUuid=22222222-2222-4222-8222-222222222222',
                );
            } else {
                expect(() =>
                    context.getChartExport(
                        '22222222-2222-4222-8222-222222222222',
                    ),
                ).toThrow();
                expect(output.result).not.toContain('exportChartAsCode');
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
                    vizConfig: expect.objectContaining({
                        source: 'merge',
                        schemaVersion: 1,
                        config: mergeInput,
                    }),
                }),
            );
            if (enableChartExport) {
                expect(createOrUpdateArtifact).toHaveBeenCalledWith(
                    expect.objectContaining({
                        vizConfig: expect.objectContaining({
                            contentAsCode: expect.objectContaining({
                                contentType: 'chart',
                                name: 'Baseline',
                            }),
                        }),
                    }),
                );
            }
            expect(output.metadata).toMatchObject({
                status: 'success',
                queryUuid: '22222222-2222-4222-8222-222222222222',
            });
        },
    );

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
        const context = new AgentContext([validExplore]);
        const queryTool = getRunQuery({
            agentContext: context,
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
            slackLinksOnly: false,
            resolveCustomChartType: vi.fn().mockResolvedValue(null),
            exportCustomChartTypeImage: vi.fn() as ExportCustomChartTypeImageFn,
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
            context: {},
        });
        if (Symbol.asyncIterator in output) {
            throw new Error('Expected a non-streaming tool result');
        }

        expect(output.metadata.status).toBe('success');
        expect(runAsyncMergeQuery).toHaveBeenCalledOnce();
        expect(createOrUpdateArtifact).toHaveBeenCalledWith(
            expect.objectContaining({
                vizConfig: expect.objectContaining({
                    source: 'merge',
                    schemaVersion: 1,
                    config: expect.objectContaining({
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
            agentContext: new AgentContext([validExplore]),
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
            slackLinksOnly: false,
            resolveCustomChartType: vi.fn().mockResolvedValue(null),
            exportCustomChartTypeImage: vi.fn() as ExportCustomChartTypeImageFn,
        });

        await queryTool.execute!(toolInput, {
            messages: [],
            toolCallId: 'tool-call-1',
            context: {},
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

    it('returns data answers without creating or configuring a chart artifact', async () => {
        const createOrUpdateArtifact = vi.fn().mockResolvedValue(undefined);
        const runAsyncQuery: RunAsyncQueryFn = vi.fn().mockResolvedValue({
            queryUuid: '11111111-1111-4111-8111-111111111111',
            rows: [{ a_dim1: 'one', a_met1: 1 }],
            cacheMetadata: { cacheHit: false },
            fields: {},
        });
        const decisions = new AiDecisionClient({
            apiKey: null,
            model: 'test',
            timeoutMs: 100,
        });
        const presentation = vi.spyOn(decisions, 'evaluate');
        const queryTool = getRunQuery({
            purpose: 'answer',
            agentContext: new AgentContext([validExplore]),
            decisions,
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
            slackLinksOnly: false,
            resolveCustomChartType: vi.fn().mockResolvedValue(null),
            exportCustomChartTypeImage: vi.fn() as ExportCustomChartTypeImageFn,
        });

        const output = await queryTool.execute!(toolInput, {
            messages: [],
            toolCallId: 'tool-call-1',
            context: {},
        });
        if (Symbol.asyncIterator in output) {
            throw new Error('Expected a non-streaming tool result');
        }

        expect(runAsyncQuery).toHaveBeenCalledOnce();
        expect(createOrUpdateArtifact).not.toHaveBeenCalled();
        expect(presentation).not.toHaveBeenCalledWith(
            expect.objectContaining({ operation: 'chart-presentation' }),
        );
        expect(output.result).toContain('a_met1');
    });

    it('keeps a table artifact for fast data answers in web chat', async () => {
        const createOrUpdateArtifact = vi.fn().mockResolvedValue(undefined);
        const runAsyncQuery: RunAsyncQueryFn = vi.fn().mockResolvedValue({
            queryUuid: '11111111-1111-4111-8111-111111111111',
            rows: [{ a_dim1: 'one', a_met1: 1 }],
            cacheMetadata: { cacheHit: false },
            fields: {},
        });
        const queryTool = getRunQuery({
            purpose: 'answer',
            enableFastResponse: true,
            agentContext: new AgentContext([validExplore]),
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
            slackLinksOnly: false,
            resolveCustomChartType: vi.fn().mockResolvedValue(null),
            exportCustomChartTypeImage: vi.fn() as ExportCustomChartTypeImageFn,
        });

        await queryTool.execute!(toolInput, {
            messages: [],
            toolCallId: 'tool-call-1',
            context: {},
        });

        expect(createOrUpdateArtifact).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                artifactType: 'chart',
                vizConfig: expect.objectContaining({
                    config: expect.objectContaining({ chartConfig: null }),
                }),
            }),
        );
    });

    it('resolves filter expressions before execution and persists replay args', async () => {
        const createOrUpdateArtifact = vi.fn().mockResolvedValue(undefined);
        const runAsyncQuery: RunAsyncQueryFn = vi.fn().mockResolvedValue({
            queryUuid: '11111111-1111-4111-8111-111111111111',
            rows: [{ a_dim1: 'one', a_met1: 1 }],
            cacheMetadata: { cacheHit: false },
            fields: {},
        });
        const queryTool = getRunQuery({
            agentContext: new AgentContext([validExplore]),
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
            slackLinksOnly: false,
            resolveCustomChartType: vi.fn().mockResolvedValue(null),
            exportCustomChartTypeImage: vi.fn() as ExportCustomChartTypeImageFn,
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
            context: {},
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
                    source: 'semantic',
                    config: expect.objectContaining({
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
        expect(createOrUpdateArtifact.mock.calls[0]?.[0]).not.toHaveProperty(
            'vizConfig.inputProvenance',
        );
    });

    it('expands period-comparison output in persisted replay args', async () => {
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
            agentContext: new AgentContext([popExplore]),
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
            slackLinksOnly: false,
            resolveCustomChartType: vi.fn().mockResolvedValue(null),
            exportCustomChartTypeImage: vi.fn() as ExportCustomChartTypeImageFn,
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
            context: {},
        });

        expect(createOrUpdateArtifact).toHaveBeenCalledWith(
            expect.objectContaining({
                vizConfig: expect.objectContaining({
                    source: 'semantic',
                    config: expect.objectContaining({
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
            agentContext: new AgentContext([validExplore]),
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
            slackLinksOnly: false,
            resolveCustomChartType: vi.fn().mockResolvedValue(null),
            exportCustomChartTypeImage: vi.fn() as ExportCustomChartTypeImageFn,
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
                context: {},
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

    it('returns custom metric category failures without execution or Sentry capture', async () => {
        vi.mocked(Sentry.captureException).mockClear();
        const runAsyncQuery = vi.fn<RunAsyncQueryFn>();
        const createOrUpdateArtifact = vi.fn().mockResolvedValue(undefined);
        const queryTool = getRunQuery({
            agentContext: new AgentContext([validExplore]),
            updateProgress: vi.fn().mockResolvedValue(undefined),
            runAsyncQuery,
            runAsyncMergeQuery: vi.fn<RunAsyncMergeQueryFn>(),
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
            slackLinksOnly: false,
            resolveCustomChartType: vi.fn().mockResolvedValue(null),
            exportCustomChartTypeImage: vi.fn<ExportCustomChartTypeImageFn>(),
        });

        if (!queryTool.execute) {
            throw new Error('Expected run query to be executable');
        }
        const output = await queryTool.execute(
            {
                ...toolInput,
                queryConfig: {
                    ...toolInput.queryConfig,
                    customMetrics: [
                        {
                            kind: 'aggregation',
                            name: 'conditional_count',
                            label: 'Conditional count',
                            description: 'Count with an internal filter',
                            baseDimensionName: 'a_dim1',
                            table: 'a',
                            type: MetricType.COUNT,
                            filters: 'a_met1 equals=one',
                        },
                    ],
                },
            },
            {
                messages: [],
                toolCallId: 'tool-call-1',
                context: {},
            },
        );
        if (Symbol.asyncIterator in output) {
            throw new Error('Expected a non-streaming tool result');
        }

        expect(output).toMatchObject({
            result: expect.stringContaining(
                '[FILTER_EXPRESSION_CUSTOM_METRIC_WRONG_CATEGORY]',
            ),
            metadata: { status: 'error' },
        });
        expect(output.result).toContain('dimension field ID');
        expect(output.result).not.toContain('parserMessage');
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
                queryCacheHit: false,
            },
        });
    });

    it('returns the artifact version in successful web visualization metadata', async () => {
        const runAsyncQuery: RunAsyncQueryFn = vi.fn().mockResolvedValue({
            queryUuid: '11111111-1111-4111-8111-111111111111',
            rows: [{ a_dim1: 'one', a_met1: 1 }],
            cacheMetadata: { cacheHit: false },
            fields: {},
        });

        await expect(
            executeTool(
                runAsyncQuery,
                true,
                makePrompt(),
                false,
                false,
                undefined,
                toolInput,
                false,
                validExplore,
                new AgentContext([validExplore]),
                false,
                'visualization',
                {
                    artifactUuid: 'artifact-uuid',
                    versionUuid: 'version-uuid',
                },
            ),
        ).resolves.toMatchObject({
            metadata: {
                status: 'success',
                artifactVersionUuid: 'version-uuid',
            },
        });
    });

    it('reports reuse when the query result cache was hit', async () => {
        const runAsyncQuery: RunAsyncQueryFn = vi.fn().mockResolvedValue({
            queryUuid: '11111111-1111-4111-8111-111111111111',
            rows: [{ a_dim1: 'one', a_met1: 1 }],
            cacheMetadata: { cacheHit: true },
            fields: {},
        });

        await expect(executeTool(runAsyncQuery)).resolves.toMatchObject({
            metadata: { queryCacheHit: true },
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

describe('getRunQuery custom chart types', () => {
    const vizSchema = {
        fields: [
            {
                name: 'x',
                label: 'X axis',
                type: 'dimension' as const,
                required: true,
            },
            {
                name: 'y',
                label: 'Y axis',
                type: 'metric' as const,
                required: true,
            },
            {
                name: 'series',
                label: 'Series',
                type: 'series' as const,
                required: false,
            },
        ],
        configOptions: [
            {
                name: 'showLegend',
                label: 'Show legend',
                type: 'boolean' as const,
                default: true,
            },
        ],
        colorPalette: null,
    };

    const makeQueryResults = () => ({
        queryUuid: '11111111-1111-4111-8111-111111111111',
        rows: [{ a_dim1: 'one', a_met1: 1 }],
        cacheMetadata: { cacheHit: false },
        fields: {},
    });

    const executeCustom = async ({
        chartConfig,
        resolveCustomChartType = vi.fn().mockResolvedValue({
            dataAppVizUuid: '4c25c1d5-cbc9-4d76-b58e-b1c9ee399fd9',
            dataAppVizVersion: 2,
            schema: vizSchema,
        }) as ResolveCustomChartTypeFn,
        runAsyncQuery = vi
            .fn()
            .mockResolvedValue(makeQueryResults()) as RunAsyncQueryFn,
        exportCustomChartTypeImage = vi.fn() as ExportCustomChartTypeImageFn,
        enableFilterExpressions = false,
        enableChartExport = false,
    }: {
        chartConfig: ToolRunQueryCustomChartTypeConfig;
        resolveCustomChartType?: ResolveCustomChartTypeFn;
        runAsyncQuery?: RunAsyncQueryFn;
        exportCustomChartTypeImage?: ExportCustomChartTypeImageFn;
        enableFilterExpressions?: boolean;
        enableChartExport?: boolean;
    }) => {
        const createOrUpdateArtifact = vi.fn().mockResolvedValue(undefined);
        const context = new AgentContext([validExplore]);
        const queryTool = getRunQuery({
            agentContext: context,
            updateProgress: vi.fn().mockResolvedValue(undefined),
            runAsyncQuery,
            runAsyncMergeQuery: vi.fn() as RunAsyncMergeQueryFn,
            enableMergeQueries: false,
            enableFilterExpressions,
            enableChartExport,
            projectParameterDefinitions: {},
            getPrompt: vi.fn().mockResolvedValue(makePrompt()),
            sendFile: vi.fn().mockResolvedValue(undefined),
            createOrUpdateArtifact,
            maxLimit: 500,
            maxContextRows: Number.POSITIVE_INFINITY,
            exposeQueryUuid: false,
            enableDataAccess: true,
            slackLinksOnly: false,
            resolveCustomChartType,
            exportCustomChartTypeImage,
        });
        const input = {
            ...toolInput,
            queryConfig: {
                ...toolInput.queryConfig,
                filters: enableFilterExpressions
                    ? {
                          dimensions: 'a_dim1 equals=one',
                          metrics: null,
                          tableCalculations: null,
                      }
                    : null,
            },
            chartConfig,
        };
        const output = await queryTool.execute!(input, {
            messages: [],
            toolCallId: 'tool-call-1',
            context: {},
        });
        if (Symbol.asyncIterator in output) {
            throw new Error('Expected a non-streaming tool result');
        }
        return {
            output,
            createOrUpdateArtifact,
            runAsyncQuery,
            input,
            context,
        };
    };

    const customChartConfig = {
        customChartTypeSlug: 'cohort-waterfall',
        fieldMapping: { x: 'a_dim1', y: 'a_met1' },
        options: { showLegend: true },
    };

    it('registers a custom export from the resolved version and executed query', async () => {
        const { context, output, runAsyncQuery } = await executeCustom({
            chartConfig: customChartConfig,
            enableChartExport: true,
        });
        const exportSource = context.getChartExport(
            '11111111-1111-4111-8111-111111111111',
        );
        expect(exportSource.customChartType).toMatchObject({
            dataAppVizVersion: 2,
            fields: vizSchema.fields,
        });
        expect(exportSource.queryTool.chartConfig).toEqual(customChartConfig);
        expect(exportSource.metricQuery.exploreName).toBe(validExplore.name);
        expect(output.result).toContain('exportChartAsCode');
        expect(runAsyncQuery).toHaveBeenCalledTimes(1);
    });

    it('runs the query and persists the envelope with the verbatim tool args', async () => {
        const { output, createOrUpdateArtifact, runAsyncQuery, input } =
            await executeCustom({ chartConfig: customChartConfig });

        expect(output.metadata).toMatchObject({ status: 'success' });
        expect(runAsyncQuery).toHaveBeenCalled();
        expect(createOrUpdateArtifact).toHaveBeenCalledWith(
            expect.objectContaining({
                vizConfig: {
                    source: 'customChartType',
                    schemaVersion: 1,
                    dataAppVizUuid: '4c25c1d5-cbc9-4d76-b58e-b1c9ee399fd9',
                    dataAppVizVersion: 2,
                    // Model output stored unmodified — slug config intact.
                    config: input,
                },
            }),
        );
    });

    it.each([false, true])(
        'persists ordered multi-field bindings with filter expressions %s',
        async (enableFilterExpressions) => {
            const chartConfig: ToolRunQueryCustomChartTypeConfig = {
                ...customChartConfig,
                fieldMapping: { x: 'a_dim1', y: ['a_met1'] },
            };
            const multiSchema = {
                ...vizSchema,
                fields: vizSchema.fields.map((field) =>
                    field.name === 'y' ? { ...field, multiple: true } : field,
                ),
            };
            const { output, createOrUpdateArtifact } = await executeCustom({
                chartConfig,
                enableFilterExpressions,
                resolveCustomChartType: vi.fn().mockResolvedValue({
                    dataAppVizUuid: '4c25c1d5-cbc9-4d76-b58e-b1c9ee399fd9',
                    dataAppVizVersion: 2,
                    schema: multiSchema,
                }) as ResolveCustomChartTypeFn,
            });

            expect(output.metadata).toMatchObject({ status: 'success' });
            expect(createOrUpdateArtifact).toHaveBeenCalledWith(
                expect.objectContaining({
                    vizConfig: expect.objectContaining({
                        source: 'customChartType',
                        dataAppVizVersion: 2,
                        config: expect.objectContaining({ chartConfig }),
                    }),
                }),
            );
        },
    );

    it('persists resolved expression args for custom chart types', async () => {
        const { output, createOrUpdateArtifact } = await executeCustom({
            chartConfig: customChartConfig,
            enableFilterExpressions: true,
        });

        expect(output.metadata).toMatchObject({ status: 'success' });
        expect(createOrUpdateArtifact).toHaveBeenCalledWith(
            expect.objectContaining({
                vizConfig: expect.objectContaining({
                    source: 'customChartType',
                    schemaVersion: 1,
                    dataAppVizUuid: '4c25c1d5-cbc9-4d76-b58e-b1c9ee399fd9',
                    dataAppVizVersion: 2,
                    config: expect.objectContaining({
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
                        chartConfig: customChartConfig,
                    }),
                }),
            }),
        );
    });

    it('returns a descriptive error for an unknown slug without running the query', async () => {
        const { output, runAsyncQuery, createOrUpdateArtifact } =
            await executeCustom({
                chartConfig: customChartConfig,
                resolveCustomChartType: vi
                    .fn()
                    .mockResolvedValue(null) as ResolveCustomChartTypeFn,
            });

        expect(output.metadata).toEqual({ status: 'error' });
        expect(output.result).toContain(
            'Custom chart type "cohort-waterfall" was not found in this project',
        );
        expect(output.result).toContain('findCustomChartTypes');
        expect(runAsyncQuery).not.toHaveBeenCalled();
        expect(createOrUpdateArtifact).not.toHaveBeenCalled();
    });

    it('returns a descriptive error for an unknown slot', async () => {
        const { output, runAsyncQuery } = await executeCustom({
            chartConfig: {
                ...customChartConfig,
                fieldMapping: { x: 'a_dim1', y: 'a_met1', nope: 'a_dim1' },
            },
        });

        expect(output.metadata).toEqual({ status: 'error' });
        expect(output.result).toContain('Unknown field slots');
        expect(output.result).toContain('nope');
        expect(output.result).toContain('x, y, series');
        expect(runAsyncQuery).not.toHaveBeenCalled();
    });

    it('returns a descriptive error for an unbound required slot', async () => {
        const { output, runAsyncQuery } = await executeCustom({
            chartConfig: {
                ...customChartConfig,
                fieldMapping: { x: 'a_dim1' },
            },
        });

        expect(output.metadata).toEqual({ status: 'error' });
        expect(output.result).toContain(
            'Required field slots not bound in fieldMapping: y',
        );
        expect(runAsyncQuery).not.toHaveBeenCalled();
    });

    it('returns a descriptive error for a field id outside the query', async () => {
        const { output, runAsyncQuery } = await executeCustom({
            chartConfig: {
                ...customChartConfig,
                fieldMapping: { x: 'a_dim1', y: 'other_metric' },
            },
        });

        expect(output.metadata).toEqual({ status: 'error' });
        expect(output.result).toContain('y → other_metric');
        expect(output.result).toContain('a_dim1, a_met1');
        expect(runAsyncQuery).not.toHaveBeenCalled();
    });

    it('returns a descriptive error for a field bound outside the slot pool', async () => {
        const { output, runAsyncQuery } = await executeCustom({
            chartConfig: {
                ...customChartConfig,
                fieldMapping: { x: 'a_met1', y: 'a_met1' },
            },
        });

        expect(output.metadata).toEqual({ status: 'error' });
        expect(output.result).toContain(
            'Slot "x" (dimension) only accepts dimensions, but "a_met1" is a metric',
        );
        expect(runAsyncQuery).not.toHaveBeenCalled();
    });

    it('returns a descriptive error for an invalid option value', async () => {
        const { output, runAsyncQuery } = await executeCustom({
            chartConfig: {
                ...customChartConfig,
                options: { showLegend: 'yes' },
            },
        });

        expect(output.metadata).toEqual({ status: 'error' });
        expect(output.result).toContain(
            'Option "showLegend" (boolean) expects true or false, received "yes"',
        );
        expect(runAsyncQuery).not.toHaveBeenCalled();
    });

    it('rejects mergeConfig combined with a custom chart type', async () => {
        const runAsyncMergeQuery = vi.fn() as RunAsyncMergeQueryFn;
        const runAsyncQuery = vi.fn() as RunAsyncQueryFn;
        const createOrUpdateArtifact = vi.fn().mockResolvedValue(undefined);
        const queryTool = getRunQuery({
            agentContext: new AgentContext([validExplore]),
            updateProgress: vi.fn().mockResolvedValue(undefined),
            runAsyncQuery,
            runAsyncMergeQuery,
            enableMergeQueries: true,
            enableFilterExpressions: false,
            projectParameterDefinitions: {},
            getPrompt: vi.fn().mockResolvedValue(makePrompt()),
            sendFile: vi.fn().mockResolvedValue(undefined),
            createOrUpdateArtifact,
            maxLimit: 500,
            maxContextRows: Number.POSITIVE_INFINITY,
            exposeQueryUuid: false,
            enableDataAccess: true,
            slackLinksOnly: false,
            resolveCustomChartType: vi.fn().mockResolvedValue({
                dataAppVizUuid: '4c25c1d5-cbc9-4d76-b58e-b1c9ee399fd9',
                dataAppVizVersion: 2,
                schema: vizSchema,
            }) as ResolveCustomChartTypeFn,
            exportCustomChartTypeImage: vi.fn() as ExportCustomChartTypeImageFn,
        });

        const mergeCustomInput = {
            ...toolInput,
            chartConfig: customChartConfig,
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
                joinType: MergeJoinType.FULL,
            },
        };
        const output = await queryTool.execute!(mergeCustomInput, {
            messages: [],
            toolCallId: 'tool-call-1',
            context: {},
        });
        if (Symbol.asyncIterator in output) {
            throw new Error('Expected a non-streaming tool result');
        }

        expect(output.metadata).toEqual({ status: 'error' });
        expect(output.result).toContain(
            'Custom chart types cannot be combined with mergeConfig',
        );
        expect(runAsyncMergeQuery).not.toHaveBeenCalled();
        expect(runAsyncQuery).not.toHaveBeenCalled();
        expect(createOrUpdateArtifact).not.toHaveBeenCalled();
    });

    it('does not call the image exporter for web prompts', async () => {
        const exportCustomChartTypeImage =
            vi.fn() as ExportCustomChartTypeImageFn;

        const { output } = await executeCustom({
            chartConfig: customChartConfig,
            exportCustomChartTypeImage,
        });

        expect(exportCustomChartTypeImage).not.toHaveBeenCalled();
        expect(output.metadata).toMatchObject({ status: 'success' });
    });

    describe('in Slack', () => {
        beforeEach(() => {
            vi.mocked(renderEcharts).mockClear();
        });

        const artifact = {
            artifactUuid: 'artifact-uuid',
            versionUuid: 'version-uuid',
        };

        const executeCustomSlack = async ({
            exportCustomChartTypeImage,
            deferSlackVisualization,
            sendFile = vi
                .fn()
                .mockResolvedValue(
                    'https://lightdash.example/api/v1/slack/card-image/abc',
                ) as SendFileFn,
        }: {
            exportCustomChartTypeImage: ExportCustomChartTypeImageFn;
            sendFile?: SendFileFn;
            deferSlackVisualization?: DeferSlackVisualizationFn;
        }) => {
            const queryTool = getRunQuery({
                agentContext: new AgentContext([validExplore]),
                updateProgress: vi.fn().mockResolvedValue(undefined),
                runAsyncQuery: vi
                    .fn()
                    .mockResolvedValue(makeQueryResults()) as RunAsyncQueryFn,
                runAsyncMergeQuery: vi.fn() as RunAsyncMergeQueryFn,
                enableMergeQueries: false,
                enableFilterExpressions: false,
                projectParameterDefinitions: {},
                getPrompt: vi.fn().mockResolvedValue(makeSlackPrompt()),
                sendFile,
                deferSlackVisualization,
                createOrUpdateArtifact: vi.fn().mockResolvedValue(artifact),
                maxLimit: 500,
                maxContextRows: Number.POSITIVE_INFINITY,
                exposeQueryUuid: false,
                enableDataAccess: true,
                slackLinksOnly: false,
                resolveCustomChartType: vi.fn().mockResolvedValue({
                    dataAppVizUuid: '4c25c1d5-cbc9-4d76-b58e-b1c9ee399fd9',
                    dataAppVizVersion: 2,
                    schema: vizSchema,
                }) as ResolveCustomChartTypeFn,
                exportCustomChartTypeImage,
            });
            const output = await queryTool.execute!(
                { ...toolInput, chartConfig: customChartConfig },
                {
                    messages: [],
                    toolCallId: 'tool-call-1',
                    context: {},
                },
            );
            if (Symbol.asyncIterator in output) {
                throw new Error('Expected a non-streaming tool result');
            }
            return { output, sendFile };
        };

        it('defers a custom chart after binding its original execution', async () => {
            const exportCustomChartTypeImage =
                vi.fn() as ExportCustomChartTypeImageFn;
            const deferSlackVisualization = vi.fn().mockResolvedValue(true);
            const { output, sendFile } = await executeCustomSlack({
                exportCustomChartTypeImage,
                deferSlackVisualization,
            });
            expect(output.metadata.status).toBe('success');
            expect(output.metadata).toHaveProperty(
                'artifactVersionUuid',
                artifact.versionUuid,
            );
            expect(deferSlackVisualization).toHaveBeenCalledExactlyOnceWith(
                expect.objectContaining({
                    artifactUuid: artifact.artifactUuid,
                    versionUuid: artifact.versionUuid,
                    queryUuid: makeQueryResults().queryUuid,
                    queryTool: expect.objectContaining({
                        chartConfig: customChartConfig,
                    }),
                }),
            );
            expect(exportCustomChartTypeImage).not.toHaveBeenCalled();
            expect(sendFile).not.toHaveBeenCalled();
        });

        it('attaches the rendered image through the file-send path on success', async () => {
            const image = Buffer.from('custom-chart-png');
            const exportCustomChartTypeImage = vi
                .fn()
                .mockResolvedValue(image) as ExportCustomChartTypeImageFn;

            const { output, sendFile } = await executeCustomSlack({
                exportCustomChartTypeImage,
            });

            expect(exportCustomChartTypeImage).toHaveBeenCalledWith(artifact);
            expect(sendFile).toHaveBeenCalledTimes(1);
            expect(sendFile).toHaveBeenCalledWith(
                expect.objectContaining({
                    filename: 'lightdash-chart.png',
                    file: image,
                }),
            );
            expect(output.metadata).toMatchObject({
                status: 'success',
                chartImageUrl:
                    'https://lightdash.example/api/v1/slack/card-image/abc',
            });
            // Custom chart types never take the builtin echarts render path.
            expect(vi.mocked(renderEcharts)).not.toHaveBeenCalled();
        });

        it('retries once and attaches the image when the second attempt succeeds', async () => {
            const image = Buffer.from('custom-chart-png');
            const exportCustomChartTypeImage = vi
                .fn()
                .mockRejectedValueOnce(new Error('render crashed'))
                .mockResolvedValueOnce(image) as ExportCustomChartTypeImageFn;

            const { output, sendFile } = await executeCustomSlack({
                exportCustomChartTypeImage,
            });

            expect(exportCustomChartTypeImage).toHaveBeenCalledTimes(2);
            expect(sendFile).toHaveBeenCalledWith(
                expect.objectContaining({
                    filename: 'lightdash-chart.png',
                    file: image,
                }),
            );
            expect(output.metadata).toMatchObject({ status: 'success' });
        });

        it('falls back to CSV without failing the answer when the export keeps failing', async () => {
            const exportCustomChartTypeImage = vi
                .fn()
                .mockRejectedValue(
                    new Error('render crashed'),
                ) as ExportCustomChartTypeImageFn;

            const { output, sendFile } = await executeCustomSlack({
                exportCustomChartTypeImage,
            });

            expect(exportCustomChartTypeImage).toHaveBeenCalledTimes(2);
            expect(sendFile).toHaveBeenCalledTimes(1);
            expect(sendFile).toHaveBeenCalledWith(
                expect.objectContaining({
                    filename: 'lightdash-results.csv',
                }),
            );
            expect(output.metadata).toMatchObject({ status: 'success' });
            expect(output.metadata.chartImageUrl).toBeUndefined();
        });

        it('falls back to CSV when the export exhausts the time budget', async () => {
            vi.useFakeTimers();
            try {
                const exportCustomChartTypeImage = vi
                    .fn()
                    .mockReturnValue(
                        new Promise<never>(() => {}),
                    ) as ExportCustomChartTypeImageFn;

                const pending = executeCustomSlack({
                    exportCustomChartTypeImage,
                });
                await vi.advanceTimersByTimeAsync(60_000);
                const { output, sendFile } = await pending;

                // Budget exhausted on the first attempt — no retry.
                expect(exportCustomChartTypeImage).toHaveBeenCalledTimes(1);
                expect(sendFile).toHaveBeenCalledWith(
                    expect.objectContaining({
                        filename: 'lightdash-results.csv',
                    }),
                );
                expect(output.metadata).toMatchObject({ status: 'success' });
            } finally {
                vi.useRealTimers();
            }
        });
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
            agentContext: new AgentContext([parameterizedExplore]),
            updateProgress: vi.fn().mockResolvedValue(undefined),
            runAsyncQuery,
            runAsyncMergeQuery: vi.fn() as RunAsyncMergeQueryFn,
            enableMergeQueries: false,
            enableFilterExpressions: false,
            projectParameterDefinitions: {},
            getPrompt: vi.fn().mockResolvedValue(makePrompt()),
            sendFile: vi.fn().mockResolvedValue(undefined),
            createOrUpdateArtifact: vi.fn().mockResolvedValue(undefined),
            maxLimit: 500,
            maxContextRows: Number.POSITIVE_INFINITY,
            exposeQueryUuid: false,
            enableDataAccess: true,
            slackLinksOnly: false,
            resolveCustomChartType: vi.fn().mockResolvedValue(null),
            exportCustomChartTypeImage: vi.fn() as ExportCustomChartTypeImageFn,
        });
        const output = await queryTool.execute!(
            {
                ...toolInput,
                queryConfig: { ...toolInput.queryConfig, parameters },
            },
            {
                messages: [],
                toolCallId: 'tool-call-1',
                context: {},
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
            agentContext: new AgentContext([noDefaultExplore]),
            updateProgress: vi.fn().mockResolvedValue(undefined),
            runAsyncQuery,
            runAsyncMergeQuery: vi.fn() as RunAsyncMergeQueryFn,
            enableMergeQueries: false,
            enableFilterExpressions: false,
            projectParameterDefinitions: {},
            getPrompt: vi.fn().mockResolvedValue(makePrompt()),
            sendFile: vi.fn().mockResolvedValue(undefined),
            createOrUpdateArtifact: vi.fn().mockResolvedValue(undefined),
            maxLimit: 500,
            maxContextRows: Number.POSITIVE_INFINITY,
            exposeQueryUuid: false,
            enableDataAccess: true,
            slackLinksOnly: false,
            resolveCustomChartType: vi.fn().mockResolvedValue(null),
            exportCustomChartTypeImage: vi.fn() as ExportCustomChartTypeImageFn,
        });
        const output = await queryTool.execute!(
            {
                ...toolInput,
                queryConfig: { ...toolInput.queryConfig, parameters: null },
            },
            {
                messages: [],
                toolCallId: 'tool-call-1',
                context: {},
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

describe('getRunQuery Slack links only', () => {
    const executeLinksOnly = async ({
        enableDataAccess,
        slackLinksOnly,
        deferSlackVisualization,
        merge = false,
        input = merge ? mergeInput : toolInput,
        purpose = 'visualization',
    }: {
        enableDataAccess: boolean;
        slackLinksOnly: boolean;
        deferSlackVisualization?: DeferSlackVisualizationFn;
        input?: ToolRunQueryArgs;
        merge?: boolean;
        purpose?: 'answer' | 'visualization';
    }) => {
        const runAsyncQuery = vi.fn().mockResolvedValue({
            queryUuid: 'query-uuid',
            rows: [{ a_dim1: 'one', a_met1: 1 }],
            cacheMetadata: { cacheHit: false },
            fields: {},
        }) as RunAsyncQueryFn;
        const runAsyncMergeQuery = vi.fn().mockResolvedValue({
            queryUuid: 'query-uuid',
            rows: [{ merge_key: 'one', primary_a_met1: 1 }],
            cacheMetadata: { cacheHit: false },
            fields: {},
            metricQuery: metricQueryMock,
        });
        const sendFile = vi
            .fn()
            .mockResolvedValue(
                'https://lightdash.example/api/v1/slack/card-image/abc',
            ) as SendFileFn;
        const createOrUpdateArtifact = vi.fn().mockResolvedValue({
            artifactUuid: 'artifact-uuid',
            versionUuid: 'version-uuid',
        });
        const queryTool = getRunQuery({
            purpose,
            agentContext: new AgentContext([validExplore]),
            updateProgress: vi.fn().mockResolvedValue(undefined),
            runAsyncQuery,
            runAsyncMergeQuery,
            enableMergeQueries: merge,
            enableFilterExpressions: false,
            projectParameterDefinitions: {},
            getPrompt: vi.fn().mockResolvedValue(makeSlackPrompt()),
            sendFile,
            deferSlackVisualization,
            createOrUpdateArtifact,
            maxLimit: 500,
            maxContextRows: Number.POSITIVE_INFINITY,
            exposeQueryUuid: false,
            enableDataAccess,
            slackLinksOnly,
            resolveCustomChartType: vi.fn().mockResolvedValue(null),
            exportCustomChartTypeImage: vi.fn() as ExportCustomChartTypeImageFn,
        });
        const output = await queryTool.execute!(input, {
            messages: [],
            toolCallId: 'tool-call-1',
            context: {},
        });
        if (Symbol.asyncIterator in output) {
            throw new Error('Expected a non-streaming tool result');
        }
        return {
            output,
            runAsyncQuery,
            runAsyncMergeQuery,
            sendFile,
            createOrUpdateArtifact,
        };
    };

    it.each([
        { slackLinksOnly: false, merge: false },
        { slackLinksOnly: true, merge: false },
        { slackLinksOnly: false, merge: true },
        { slackLinksOnly: true, merge: true },
    ])(
        'keeps the result card for answer-only Slack queries (%j)',
        async ({ slackLinksOnly, merge }) => {
            const {
                output,
                runAsyncQuery,
                runAsyncMergeQuery,
                sendFile,
                createOrUpdateArtifact,
            } = await executeLinksOnly({
                purpose: 'answer',
                merge,
                enableDataAccess: true,
                slackLinksOnly,
            });
            expect(
                merge ? runAsyncMergeQuery : runAsyncQuery,
            ).toHaveBeenCalledTimes(1);
            expect(
                merge ? runAsyncQuery : runAsyncMergeQuery,
            ).not.toHaveBeenCalled();
            expect(createOrUpdateArtifact).toHaveBeenCalledExactlyOnceWith(
                expect.objectContaining({
                    promptUuid: 'prompt-uuid',
                    artifactType: 'chart',
                    vizConfig: expect.objectContaining({
                        config: expect.objectContaining({ chartConfig: null }),
                    }),
                }),
            );
            expect(output.metadata).toMatchObject({
                status: 'success',
                queryUuid: 'query-uuid',
            });
            if (slackLinksOnly) expect(sendFile).not.toHaveBeenCalled();
        },
    );

    it('returns query evidence immediately after durable image registration', async () => {
        const deferSlackVisualization = vi.fn().mockResolvedValue(true);
        const previousRenders = vi.mocked(renderEcharts).mock.calls.length;
        const { output, runAsyncQuery, sendFile } = await executeLinksOnly({
            enableDataAccess: true,
            slackLinksOnly: false,
            deferSlackVisualization,
        });
        expect(output.metadata.status).toBe('success');
        expect(output.result).toContain('one');
        expect(output.metadata).not.toHaveProperty(
            'chartImageUrl',
            expect.any(String),
        );
        expect(deferSlackVisualization).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                artifactUuid: 'artifact-uuid',
                versionUuid: 'version-uuid',
                queryUuid: 'query-uuid',
                rowLimit: 1,
                queryTool: expect.objectContaining({
                    chartConfig: expect.objectContaining({
                        defaultVizType: 'bar',
                    }),
                }),
            }),
        );
        expect(runAsyncQuery).toHaveBeenCalledTimes(1);
        expect(sendFile).not.toHaveBeenCalled();
        expect(vi.mocked(renderEcharts).mock.calls).toHaveLength(
            previousRenders,
        );
    });

    it.each(['declined', 'failed'] as const)(
        'keeps immediate rendering when durable registration is %s',
        async (reason) => {
            const deferSlackVisualization = vi.fn();
            if (reason === 'failed')
                deferSlackVisualization.mockRejectedValue(
                    new Error('Storage unavailable'),
                );
            else deferSlackVisualization.mockResolvedValue(false);
            const { output, sendFile } = await executeLinksOnly({
                enableDataAccess: true,
                slackLinksOnly: false,
                deferSlackVisualization,
            });
            expect(output.metadata.status).toBe('success');
            expect(sendFile).toHaveBeenCalledExactlyOnceWith(
                expect.objectContaining({ filename: 'lightdash-chart.png' }),
            );
            expect(output.metadata).toHaveProperty(
                'chartImageUrl',
                'https://lightdash.example/api/v1/slack/card-image/abc',
            );
        },
    );

    it('never registers deferred images for links-only responses', async () => {
        const deferSlackVisualization = vi.fn();
        const { sendFile } = await executeLinksOnly({
            enableDataAccess: true,
            slackLinksOnly: true,
            deferSlackVisualization,
        });
        expect(deferSlackVisualization).not.toHaveBeenCalled();
        expect(sendFile).not.toHaveBeenCalled();
    });

    it('keeps table CSV delivery on its existing path', async () => {
        const deferSlackVisualization = vi.fn();
        const { sendFile } = await executeLinksOnly({
            enableDataAccess: true,
            slackLinksOnly: false,
            deferSlackVisualization,
            input: {
                ...toolInput,
                chartConfig: {
                    ...toolInput.chartConfig,
                    defaultVizType: 'table',
                },
            },
        });
        expect(deferSlackVisualization).not.toHaveBeenCalled();
        expect(sendFile).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({ filename: 'lightdash-results.csv' }),
        );
    });

    it('posts neither a chart image nor a CSV into Slack while the model still sees the rows', async () => {
        const { output, runAsyncQuery, sendFile } = await executeLinksOnly({
            enableDataAccess: true,
            slackLinksOnly: true,
        });

        expect(runAsyncQuery).toHaveBeenCalledTimes(1);
        expect(sendFile).not.toHaveBeenCalled();
        expect(output.metadata).toMatchObject({
            status: 'success',
            chartImageUrl: undefined,
        });
        expect(output.result).toContain('one');
    });

    it('skips the query entirely when the agent has no data access', async () => {
        const { output, runAsyncQuery, sendFile, createOrUpdateArtifact } =
            await executeLinksOnly({
                enableDataAccess: false,
                slackLinksOnly: true,
            });

        expect(runAsyncQuery).not.toHaveBeenCalled();
        expect(sendFile).not.toHaveBeenCalled();
        expect(createOrUpdateArtifact).toHaveBeenCalledTimes(1);
        expect(output.result).toBe('Success');
    });

    it('keeps posting the chart image when the setting is off', async () => {
        const { output, sendFile } = await executeLinksOnly({
            enableDataAccess: true,
            slackLinksOnly: false,
        });

        expect(sendFile).toHaveBeenCalledWith(
            expect.objectContaining({ filename: 'lightdash-chart.png' }),
        );
        expect(output.metadata).toMatchObject({
            chartImageUrl:
                'https://lightdash.example/api/v1/slack/card-image/abc',
        });
    });
});

describe('query intent advice', () => {
    it('returns code-checked ranking advice alongside the original executed rows', async () => {
        const decisions = new AiDecisionClient({
            apiKey: null,
            model: 'test',
            timeoutMs: 100,
        });
        const evaluate = vi
            .spyOn(decisions, 'evaluate')
            .mockImplementation(async ({ operation }) =>
                operation === 'query-intent'
                    ? {
                          ranking: { type: 'noul', noul: 0.86 },
                          rankingRequest: {
                              type: 'choice',
                              choice: '0',
                              confidence: 0.99,
                              probabilities: { '0': 0.99 },
                          },
                          rankingMeasure: {
                              type: 'choice',
                              choice: 'a_met1',
                              confidence: 0.99,
                              probabilities: { a_met1: 0.99 },
                          },
                      }
                    : null,
            );
        const input: ToolRunQueryArgs = {
            ...toolInput,
            queryConfig: {
                ...toolInput.queryConfig,
                limit: 3,
                sorts: [
                    { fieldId: 'a_met1', descending: false, nullsFirst: null },
                ],
            },
        };
        const before = structuredClone(input);
        const runAsyncQuery = vi.fn().mockResolvedValue({
            queryUuid: 'query',
            rows: [{ a_dim1: 'customer', a_met1: 42 }],
            fields: {},
            metricQuery: metricQueryMock,
            cacheMetadata: { cacheHit: false },
        });
        const output = await executeTool(
            runAsyncQuery,
            true,
            { ...makePrompt(), prompt: 'Top 3 customers by revenue' },
            false,
            false,
            decisions,
            input,
        );
        expect(output.metadata.status).toBe('success');
        expect(output.result).toContain('sort first by a_met1 descending');
        expect(output.result).toContain('42');
        expect(runAsyncQuery).toHaveBeenCalledOnce();
        expect(runAsyncQuery.mock.calls[0][0]).toMatchObject({
            sorts: [{ fieldId: 'a_met1', descending: false }],
            limit: 3,
        });
        expect(
            evaluate.mock.calls.filter(
                ([call]) => call.operation === 'query-intent',
            ),
        ).toHaveLength(1);
        expect(input).toEqual(before);
    });

    it.each([0, 1])(
        'returns deterministic date advice with %s rows and preserves executed filters',
        async (rowCount) => {
            const explore = structuredClone(validExplore);
            explore.tables.a.dimensions.dim1.type = DimensionType.DATE;
            const decisions = new AiDecisionClient({
                apiKey: null,
                model: 'test',
                timeoutMs: 100,
            });
            const evaluate = vi
                .spyOn(decisions, 'evaluate')
                .mockImplementation(async ({ operation }) =>
                    operation === 'query-intent'
                        ? {
                              datePeriod: {
                                  type: 'choice',
                                  choice: '0',
                                  confidence: 0.99,
                                  probabilities: { '0': 0.99 },
                              },
                              dateField: {
                                  type: 'choice',
                                  choice: 'a_dim1',
                                  confidence: 0.99,
                                  probabilities: { a_dim1: 0.99 },
                              },
                              dateScopeInDefinitions: {
                                  type: 'noul',
                                  noul: 0.01,
                              },
                          }
                        : null,
                );
            const input: ToolRunQueryArgs = {
                ...toolInput,
                queryConfig: {
                    ...toolInput.queryConfig,
                    limit: 1_000,
                    filters: {
                        type: 'and',
                        dimensions: [
                            {
                                fieldId: 'a_dim1',
                                fieldType: DimensionType.DATE,
                                fieldFilterType: FilterType.DATE,
                                operator: FilterOperator.IN_BETWEEN,
                                values: ['2024-02-01', '2024-02-28'],
                            },
                        ],
                        metrics: [],
                        tableCalculations: [],
                    },
                },
            };
            const before = structuredClone(input);
            const runAsyncQuery = vi.fn().mockResolvedValue({
                queryUuid: 'query',
                rows: rowCount ? [{ a_dim1: '2024-02-01', a_met1: 42 }] : [],
                fields: {},
                metricQuery: metricQueryMock,
                cacheMetadata: { cacheHit: false },
            });
            const output = await executeTool(
                runAsyncQuery,
                true,
                { ...makePrompt(), prompt: 'Orders in February 2024' },
                false,
                false,
                decisions,
                input,
                false,
                explore,
            );
            expect(output.metadata.status).toBe('success');
            expect(output.result).toContain(
                'do not cover exactly "February 2024"',
            );
            expect(runAsyncQuery).toHaveBeenCalledTimes(1);
            expect(
                getTotalFilterRules(runAsyncQuery.mock.calls[0][0].filters)[0]
                    .values,
            ).toEqual(['2024-02-01', '2024-02-28']);
            expect(
                evaluate.mock.calls.find(
                    ([call]) => call.operation === 'query-intent',
                )?.[0].state,
            ).toMatchObject({ query: { limit: 500 } });
            expect(input).toEqual(before);
        },
    );
    it('runs valid intermediate queries and includes the advisory without changing data', async () => {
        const decisions = new AiDecisionClient(
            { apiKey: 'test', model: 'test', timeoutMs: 100 },
            async () =>
                Response.json({
                    model: 'test',
                    answers: Object.fromEntries(
                        [
                            'measure',
                            'conditions',
                            'grain',
                            'time',
                            'ranking',
                        ].map((key) => [
                            key,
                            {
                                type: 'noul',
                                noul: key === 'conditions' ? 0.99 : 0.01,
                            },
                        ]),
                    ),
                }),
        );
        const runAsyncQuery = vi.fn().mockResolvedValue({
            queryUuid: 'query',
            rows: [{ a_dim1: 'one', a_met1: 42 }],
            fields: {},
            metricQuery: metricQueryMock,
            cacheMetadata: { cacheHit: false },
        });
        const output = await executeTool(
            runAsyncQuery,
            true,
            makePrompt(),
            false,
            false,
            decisions,
        );
        expect(output.metadata.status).toBe('success');
        expect(output.result).toContain(
            'possible mismatches, not established errors',
        );
        expect(output.result).toContain('42');
        expect(runAsyncQuery).toHaveBeenCalledTimes(1);
        expect(
            getTotalFilterRules(runAsyncQuery.mock.calls[0][0].filters),
        ).toEqual([]);
    });

    it('keeps provider failure transparent to query execution', async () => {
        const decisions = new AiDecisionClient(
            { apiKey: 'test', model: 'test', timeoutMs: 100 },
            async () => {
                throw new Error('offline');
            },
        );
        const runAsyncQuery = vi.fn().mockResolvedValue({
            queryUuid: 'query',
            rows: [{ a_dim1: 'one', a_met1: 42 }],
            fields: {},
            metricQuery: metricQueryMock,
            cacheMetadata: { cacheHit: false },
        });
        const output = await executeTool(
            runAsyncQuery,
            true,
            makePrompt(),
            false,
            false,
            decisions,
        );
        expect(output.metadata.status).toBe('success');
        expect(output.result).not.toContain('Query/question review');
    });
});

describe('validated default chart publication', () => {
    it.each([false, true])(
        'persists defaults after one query and preserves filters (expressions=%s)',
        async (enableFilterExpressions) => {
            const decisions = new AiDecisionClient({
                apiKey: null,
                model: 'test',
                timeoutMs: 100,
            });
            vi.spyOn(decisions, 'evaluate').mockImplementation(
                async ({ operation, questions }) =>
                    Object.fromEntries(
                        Object.keys(questions).map((key) => {
                            if (
                                operation === 'chart-presentation' &&
                                (key === 'type' || key === 'x')
                            ) {
                                const value = key === 'type' ? 'bar' : 'a_dim1';
                                return [
                                    key,
                                    {
                                        type: 'choice' as const,
                                        choice: value,
                                        confidence: 0.99,
                                        probabilities: { [value]: 1 },
                                    },
                                ];
                            }
                            return [
                                key,
                                {
                                    type: 'noul' as const,
                                    noul: key.startsWith('metric_')
                                        ? 0.99
                                        : 0.01,
                                },
                            ];
                        }),
                    ),
            );
            const createOrUpdateArtifact = vi.fn().mockResolvedValue(undefined);
            const runAsyncQuery = vi.fn().mockResolvedValue({
                queryUuid: 'query',
                rows: [{ a_dim1: 'one', a_met1: 42 }],
                fields: {},
                cacheMetadata: { cacheHit: false },
            });
            const context = new AgentContext([validExplore]);
            const queryTool = getRunQuery({
                agentContext: context,
                decisions,
                enableChartExport: true,
                updateProgress: vi.fn().mockResolvedValue(undefined),
                runAsyncQuery,
                runAsyncMergeQuery: vi.fn() as RunAsyncMergeQueryFn,
                enableMergeQueries: false,
                enableFilterExpressions,
                projectParameterDefinitions: {},
                getPrompt: vi.fn().mockResolvedValue(makePrompt()),
                sendFile: vi.fn().mockResolvedValue(undefined),
                createOrUpdateArtifact,
                maxLimit: 500,
                maxContextRows: 100,
                exposeQueryUuid: false,
                enableDataAccess: true,
                slackLinksOnly: false,
                resolveCustomChartType: vi.fn().mockResolvedValue(null),
                exportCustomChartTypeImage:
                    vi.fn() as ExportCustomChartTypeImageFn,
            });
            const input = {
                ...toolInput,
                chartConfig: null,
                queryConfig: {
                    ...toolInput.queryConfig,
                    filters: enableFilterExpressions
                        ? {
                              dimensions: 'a_dim1 equals=one',
                              metrics: null,
                              tableCalculations: null,
                          }
                        : null,
                },
            };
            const output = await queryTool.execute!(input, {
                messages: [],
                toolCallId: 'default-chart',
                context: {},
            });
            if (Symbol.asyncIterator in output)
                throw new Error('Expected a non-streaming result');
            expect(output.metadata.status).toBe('success');
            expect(output.result).toContain('Chart presentation selected');
            expect(output.result).toContain('42');
            expect(output.result).toContain('exportChartAsCode');
            const source = context.getChartExport('query');
            expect(source.metricQuery.limit).toBe(500);
            expect(source.queryTool.chartConfig).toMatchObject({
                defaultVizType: 'bar',
            });
            expect(
                getTotalFilterRules(source.metricQuery.filters),
            ).toHaveLength(enableFilterExpressions ? 1 : 0);
            expect(runAsyncQuery).toHaveBeenCalledTimes(1);
            expect(
                getTotalFilterRules(runAsyncQuery.mock.calls[0][0].filters),
            ).toHaveLength(enableFilterExpressions ? 1 : 0);
            expect(createOrUpdateArtifact).toHaveBeenCalledTimes(1);
            expect(createOrUpdateArtifact).toHaveBeenCalledWith(
                expect.objectContaining({
                    vizConfig: expect.objectContaining({
                        source: 'semantic',
                        config: expect.objectContaining({
                            title: toolInput.title,
                            description: toolInput.description,
                            chartConfig: expect.objectContaining({
                                defaultVizType: 'bar',
                                xAxisDimension: 'a_dim1',
                                yAxisMetrics: ['a_met1'],
                            }),
                            queryConfig: expect.objectContaining({
                                dimensions: toolInput.queryConfig.dimensions,
                                metrics: toolInput.queryConfig.metrics,
                                limit: null,
                            }),
                        }),
                    }),
                }),
            );
            if (enableFilterExpressions)
                expect(
                    createOrUpdateArtifact.mock.calls[0][0].vizConfig.config
                        .queryConfig.filters.dimensions[0].values,
                ).toEqual(['one']);
            else
                expect(
                    createOrUpdateArtifact.mock.calls[0][0].vizConfig.config
                        .queryConfig,
                ).toEqual(toolInput.queryConfig);
            expect(input.chartConfig).toBeNull();
        },
    );
});

describe('merged chart defaults', () => {
    it('uses merged field IDs without rewriting either source or the join', async () => {
        const decisions = new AiDecisionClient({
            apiKey: null,
            model: 'test',
            timeoutMs: 100,
        });
        const evaluate = vi
            .spyOn(decisions, 'evaluate')
            .mockImplementation(async ({ questions, operation }) =>
                Object.fromEntries(
                    Object.keys(questions).map((key) => {
                        if (key === 'type' || key === 'x') {
                            const value = key === 'type' ? 'bar' : 'merge_key';
                            return [
                                key,
                                {
                                    type: 'choice' as const,
                                    choice: value,
                                    confidence: 0.99,
                                    probabilities: { [value]: 1 },
                                },
                            ];
                        }
                        return [
                            key,
                            {
                                type: 'noul' as const,
                                noul:
                                    key.startsWith('metric_') ||
                                    (operation === 'query-plan-intent' &&
                                        key === 'conditions')
                                        ? 0.99
                                        : 0.01,
                            },
                        ];
                    }),
                ),
            );
        const runAsyncMergeQuery = vi.fn().mockResolvedValue({
            queryUuid: 'merge-query',
            rows: [
                {
                    merge_key: 'one',
                    primary_a_met1: 10,
                    comparison_a_met1: 20,
                },
            ],
            fields: {},
            cacheMetadata: { cacheHit: false },
            metricQuery: {
                ...metricQueryMock,
                dimensions: ['merge_key'],
                metrics: ['primary_a_met1', 'comparison_a_met1'],
            },
        });
        const runAsyncQuery = vi.fn();
        const createOrUpdateArtifact = vi.fn().mockResolvedValue(undefined);
        const queryTool = getRunQuery({
            decisions,
            agentContext: new AgentContext([validExplore]),
            updateProgress: vi.fn().mockResolvedValue(undefined),
            runAsyncQuery,
            runAsyncMergeQuery,
            enableMergeQueries: true,
            enableFilterExpressions: false,
            projectParameterDefinitions: {},
            getPrompt: vi.fn().mockResolvedValue(makePrompt()),
            sendFile: vi.fn().mockResolvedValue(undefined),
            createOrUpdateArtifact,
            maxLimit: 500,
            maxContextRows: 100,
            exposeQueryUuid: false,
            enableDataAccess: true,
            slackLinksOnly: false,
            resolveCustomChartType: vi.fn().mockResolvedValue(null),
            exportCustomChartTypeImage: vi.fn() as ExportCustomChartTypeImageFn,
        });
        const input = { ...mergeInput, chartConfig: null };
        const output = await queryTool.execute!(input, {
            messages: [],
            toolCallId: 'merge-default',
            context: {},
        });
        if (Symbol.asyncIterator in output)
            throw new Error('Expected a non-streaming result');
        expect(output.metadata.status).toBe('success');
        expect(output.result).toContain('Query/question review');
        expect(
            evaluate.mock.calls.filter(
                ([call]) => call.operation === 'query-plan-intent',
            ),
        ).toHaveLength(1);
        expect(
            evaluate.mock.calls.find(
                ([call]) => call.operation === 'query-plan-intent',
            )?.[0].state,
        ).toMatchObject({
            plan: { kind: 'merge', query: runAsyncMergeQuery.mock.calls[0][0] },
        });
        expect(runAsyncQuery).not.toHaveBeenCalled();
        expect(runAsyncMergeQuery).toHaveBeenCalledTimes(1);
        expect(createOrUpdateArtifact).toHaveBeenCalledWith(
            expect.objectContaining({
                vizConfig: {
                    source: 'merge',
                    schemaVersion: 1,
                    config: {
                        ...input,
                        chartConfig: expect.objectContaining({
                            defaultVizType: 'bar',
                            xAxisDimension: 'merge_key',
                            yAxisMetrics: [
                                'primary_a_met1',
                                'comparison_a_met1',
                            ],
                        }),
                    },
                },
            }),
        );
        expect(input.chartConfig).toBeNull();
    });
});
