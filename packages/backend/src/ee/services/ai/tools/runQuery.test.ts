import {
    DimensionType,
    FilterOperator,
    FilterType,
    getTotalFilterRules,
    MergeJoinType,
    MetricType,
    TimeFrames,
    toolRunQueryOutputSchema,
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
    threadEmbedSpaceUuid: null,
    externalUserId: null,
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
            expect(output.metadata).toMatchObject({ queryReuseHit: enabled });
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
        expect(toolRunQueryOutputSchema.safeParse(output).success).toBe(true);
        expect(output.structuredContent).toEqual({ error: output.result });
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

    it('keeps data answers as a table artifact without configuring a chart', async () => {
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
        expect(createOrUpdateArtifact).toHaveBeenCalledOnce();
        expect(
            createOrUpdateArtifact.mock.calls[0][0].vizConfig.config
                .chartConfig ?? null,
        ).toBeNull();
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

    it('charts a multi-row fast data answer and summarises it in one line', async () => {
        const createOrUpdateArtifact = vi.fn().mockResolvedValue(undefined);
        const runAsyncQuery: RunAsyncQueryFn = vi.fn().mockResolvedValue({
            queryUuid: '11111111-1111-4111-8111-111111111111',
            rows: [
                { a_dim1: 'one', a_met1: 3 },
                { a_dim1: 'two', a_met1: 5 },
                { a_dim1: 'three', a_met1: 1 },
            ],
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

        const output = await queryTool.execute!(toolInput, {
            messages: [],
            toolCallId: 'tool-call-1',
            context: {},
        });
        if (Symbol.asyncIterator in output) {
            throw new Error('Expected a non-streaming tool result');
        }

        expect(
            createOrUpdateArtifact.mock.calls[0][0].vizConfig.config
                .chartConfig,
        ).toMatchObject({
            defaultVizType: 'bar',
            xAxisDimension: 'a_dim1',
            yAxisMetrics: ['a_met1'],
        });
        expect(output.metadata).toMatchObject({
            fastResponse:
                '**a_met1** by a_dim1, 3 rows. Highest: two at **5**. Lowest: three at **1**.',
        });
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
        expect(output.structuredContent).toEqual({ error: output.result });
        expect(toolRunQueryOutputSchema.safeParse(output).success).toBe(true);
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
        // Query evidence remains available without an early Slack image upload.
        expect(runAsyncQuery).toHaveBeenCalled();
        expect(vi.mocked(renderEcharts)).not.toHaveBeenCalled();
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

        expect(output.metadata).toMatchObject({ status: 'error' });
        expect(output.result).toContain('warehouse unavailable');
        expect(output.structuredContent).toEqual({ error: output.result });
        expect(toolRunQueryOutputSchema.safeParse(output).success).toBe(true);
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

        expect(output.metadata).toMatchObject({ status: 'error' });
        expect(output.result).toContain(
            'Custom chart type "cohort-waterfall" was not found in this project',
        );
        expect(output.result).toContain('findCustomChartTypes');
        expect(output.structuredContent).toEqual({ error: output.result });
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

        expect(output.metadata).toMatchObject({ status: 'error' });
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

        expect(output.metadata).toMatchObject({ status: 'error' });
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

        expect(output.metadata).toMatchObject({ status: 'error' });
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

        expect(output.metadata).toMatchObject({ status: 'error' });
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

        expect(output.metadata).toMatchObject({ status: 'error' });
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

        expect(output.metadata).toMatchObject({ status: 'error' });
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

        it('returns the saved custom chart reference without exporting or uploading its image', async () => {
            const exportCustomChartTypeImage = vi
                .fn()
                .mockResolvedValue(
                    Buffer.from('custom-chart-png'),
                ) as ExportCustomChartTypeImageFn;
            const { output, sendFile } = await executeCustomSlack({
                exportCustomChartTypeImage,
            });
            expect(exportCustomChartTypeImage).not.toHaveBeenCalled();
            expect(sendFile).not.toHaveBeenCalled();
            expect(vi.mocked(renderEcharts)).not.toHaveBeenCalled();
            expect(output.result).toContain(
                "This chart's versionUuid is version-uuid",
            );
            expect(output.metadata).toMatchObject({
                status: 'success',
                artifactVersionUuid: artifact.versionUuid,
            });
            expect(output.metadata).not.toHaveProperty(
                'chartImageUrl',
                expect.any(String),
            );
        });

        it.each(['declined', 'failed'] as const)(
            'retains the saved custom chart link without early uploads when deferral is %s',
            async (reason) => {
                const exportCustomChartTypeImage =
                    vi.fn() as ExportCustomChartTypeImageFn;
                const deferSlackVisualization = vi.fn();
                if (reason === 'failed') {
                    deferSlackVisualization.mockRejectedValue(
                        new Error('Storage unavailable'),
                    );
                } else {
                    deferSlackVisualization.mockResolvedValue(false);
                }
                const { output, sendFile } = await executeCustomSlack({
                    exportCustomChartTypeImage,
                    deferSlackVisualization,
                });
                expect(deferSlackVisualization).toHaveBeenCalledTimes(1);
                expect(exportCustomChartTypeImage).not.toHaveBeenCalled();
                expect(sendFile).not.toHaveBeenCalled();
                expect(output.metadata.status).toBe('success');
                expect(output.result).toContain(
                    "This chart's versionUuid is version-uuid",
                );
            },
        );
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

    it.each(['table', null] as const)(
        'exposes a successful Slack %s execution for final table selection',
        async (type) => {
            const output = await executeTool(
                runAsyncQuery,
                true,
                makeSlackPrompt(),
                false,
                false,
                undefined,
                {
                    ...toolInput,
                    chartConfig:
                        type === null
                            ? null
                            : {
                                  ...toolInput.chartConfig,
                                  defaultVizType: type,
                              },
                },
            );
            expect(output.result).toContain(
                "This execution's queryUuid is 11111111-1111-4111-8111-111111111111",
            );
        },
    );

    it.each([
        {
            slack: false,
            enableDataAccess: true,
            slackLinksOnly: false,
            type: 'table',
        },
        {
            slack: true,
            enableDataAccess: true,
            slackLinksOnly: true,
            type: 'table',
        },
        {
            slack: true,
            enableDataAccess: false,
            slackLinksOnly: false,
            type: 'table',
        },
        {
            slack: true,
            enableDataAccess: true,
            slackLinksOnly: false,
            type: 'bar',
        },
    ] as const)(
        'does not expose selection references for an ineligible execution: %j',
        async ({ slack, enableDataAccess, slackLinksOnly, type }) => {
            const output = await executeTool(
                runAsyncQuery,
                enableDataAccess,
                slack ? makeSlackPrompt() : makePrompt(),
                false,
                slackLinksOnly,
                undefined,
                {
                    ...toolInput,
                    chartConfig: {
                        ...toolInput.chartConfig,
                        defaultVizType: type,
                    },
                },
            );
            expect(output.result).not.toContain(
                '11111111-1111-4111-8111-111111111111',
            );
        },
    );

    it('exposes the UUID when the saved Slack presentation corrects a chart to a table', async () => {
        const decisions = new AiDecisionClient({
            apiKey: null,
            model: 'test',
            timeoutMs: 100,
        });
        vi.spyOn(decisions, 'evaluate').mockImplementation(
            async ({ operation }) =>
                operation === 'chart-presentation'
                    ? {
                          fit: { type: 'score', score: 0, confidence: 1 },
                          repair: { type: 'noul', noul: 1 },
                          explicitStyle: { type: 'noul', noul: 0 },
                          type: {
                              type: 'choice',
                              choice: 'table',
                              confidence: 1,
                              probabilities: { table: 1 },
                          },
                          x: {
                              type: 'choice',
                              choice: 'none',
                              confidence: 1,
                              probabilities: { none: 1 },
                          },
                      }
                    : null,
        );
        const output = await executeTool(
            runAsyncQuery,
            true,
            makeSlackPrompt(),
            false,
            false,
            decisions,
        );
        expect(output.result).toContain('Chart presentation selected');
        expect(output.result).toContain(
            "This execution's queryUuid is 11111111-1111-4111-8111-111111111111",
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
        expect(output.structuredContent).toMatchObject({
            outcome: 'results',
            parameters: {
                applied: { 'a.metric': 'active_users' },
                defaulted: {},
                unset: [],
            },
        });
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
        expect(output.structuredContent).toMatchObject({
            parameters: {
                applied: {},
                defaulted: { 'a.metric': 'revenue' },
                unset: [],
            },
        });
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
        expect(output.structuredContent).toEqual({ error: output.result });
        expect(toolRunQueryOutputSchema.safeParse(output).success).toBe(true);
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
        expect(output.structuredContent).toMatchObject({
            parameters: { applied: {}, defaulted: {}, unset: ['a.metric'] },
        });
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
        artifactVersionUuid = 'version-uuid',
    }: {
        enableDataAccess: boolean;
        slackLinksOnly: boolean;
        deferSlackVisualization?: DeferSlackVisualizationFn;
        input?: ToolRunQueryArgs;
        merge?: boolean;
        purpose?: 'answer' | 'visualization';
        artifactVersionUuid?: string;
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
            versionUuid: artifactVersionUuid,
        });
        const agentContext = new AgentContext([validExplore]);
        const queryTool = getRunQuery({
            purpose,
            agentContext,
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
            agentContext,
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
            expect(sendFile).not.toHaveBeenCalled();
        },
    );

    it.each(['table', null] as const)(
        'exposes a successful merged Slack %s execution for final table selection',
        async (type) => {
            const { output } = await executeLinksOnly({
                enableDataAccess: true,
                slackLinksOnly: false,
                merge: true,
                input: {
                    ...mergeInput,
                    chartConfig:
                        type === null
                            ? null
                            : {
                                  ...mergeInput.chartConfig,
                                  defaultVizType: type,
                              },
                },
            });
            expect(output.result).toContain(
                "This execution's queryUuid is query-uuid",
            );
        },
    );

    it.each([
        { enableDataAccess: true, slackLinksOnly: true },
        { enableDataAccess: false, slackLinksOnly: false },
    ])(
        'keeps merged selection references hidden when Slack sharing is disabled: %j',
        async ({ enableDataAccess, slackLinksOnly }) => {
            const { output } = await executeLinksOnly({
                enableDataAccess,
                slackLinksOnly,
                merge: true,
                input: { ...mergeInput, chartConfig: null },
            });
            expect(output.result).not.toContain("This execution's queryUuid");
        },
    );

    it.each([
        { enableDataAccess: true, slackLinksOnly: false },
        { enableDataAccess: true, slackLinksOnly: true },
        { enableDataAccess: false, slackLinksOnly: false },
        { enableDataAccess: false, slackLinksOnly: true },
    ])(
        'exposes saved normal and merged chart versions without granting row access: %j',
        async ({ enableDataAccess, slackLinksOnly }) => {
            const executions = await Promise.all(
                [false, true].map((merge) =>
                    executeLinksOnly({
                        enableDataAccess,
                        slackLinksOnly,
                        merge,
                    }),
                ),
            );
            for (const { output, sendFile } of executions) {
                expect(output.result).toContain(
                    "This chart's versionUuid is version-uuid",
                );
                expect(output.metadata).toMatchObject({
                    status: 'success',
                    artifactVersionUuid: 'version-uuid',
                });
                if (!enableDataAccess)
                    expect(output.result).not.toContain('```csv');
                expect(sendFile).not.toHaveBeenCalled();
            }
        },
    );

    it('distinguishes two chart versions that share an executed query', async () => {
        const first = await executeLinksOnly({
            enableDataAccess: true,
            slackLinksOnly: false,
            artifactVersionUuid: 'first-version',
        });
        const second = await executeLinksOnly({
            enableDataAccess: true,
            slackLinksOnly: false,
            artifactVersionUuid: 'second-version',
        });
        expect(first.output.metadata).toMatchObject({
            queryUuid: 'query-uuid',
        });
        expect(second.output.metadata).toMatchObject({
            queryUuid: 'query-uuid',
        });
        expect(first.output.result).toContain(
            "This chart's versionUuid is first-version",
        );
        expect(first.output.result).not.toContain('second-version');
        expect(second.output.result).toContain(
            "This chart's versionUuid is second-version",
        );
        expect(second.output.result).not.toContain('first-version');
    });

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
        'retains the saved chart link without early uploads when durable registration is %s',
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
            expect(sendFile).not.toHaveBeenCalled();
            expect(vi.mocked(renderEcharts)).not.toHaveBeenCalled();
            expect(output.metadata).not.toHaveProperty(
                'chartImageUrl',
                expect.any(String),
            );
            expect(output.result).toContain(
                "This chart's versionUuid is version-uuid",
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

    it.each([false, true])(
        'retains executed Slack table rows in context (merge=%s)',
        async (merge) => {
            const input = merge ? mergeInput : toolInput;
            const { output, agentContext, runAsyncQuery, runAsyncMergeQuery } =
                await executeLinksOnly({
                    enableDataAccess: true,
                    slackLinksOnly: false,
                    merge,
                    input: {
                        ...input,
                        chartConfig: {
                            ...input.chartConfig,
                            defaultVizType: 'table',
                        },
                    },
                });
            expect(output.metadata.status).toBe('success');
            expect(
                agentContext.getSlackTableResults().get('query-uuid'),
            ).toEqual({
                rows: merge
                    ? [{ merge_key: 'one', primary_a_met1: 1 }]
                    : [{ a_dim1: 'one', a_met1: 1 }],
                fields: {},
                truncated: false,
            });
            expect(
                merge ? runAsyncMergeQuery : runAsyncQuery,
            ).toHaveBeenCalledTimes(1);
        },
    );

    it.each([
        { enableDataAccess: false, slackLinksOnly: false },
        { enableDataAccess: true, slackLinksOnly: true },
    ])(
        'does not retain table rows when inline sharing is disabled (%j)',
        async (flags) => {
            const { agentContext } = await executeLinksOnly({
                ...flags,
                input: {
                    ...toolInput,
                    chartConfig: {
                        ...toolInput.chartConfig,
                        defaultVizType: 'table',
                    },
                },
            });
            expect(agentContext.getSlackTableResults().size).toBe(0);
        },
    );

    it('does not retain chart rows as Slack table previews', async () => {
        const { agentContext } = await executeLinksOnly({
            enableDataAccess: true,
            slackLinksOnly: false,
        });
        expect(agentContext.getSlackTableResults().size).toBe(0);
    });

    it('leaves tables in the final answer without rendering or uploading a CSV', async () => {
        const deferSlackVisualization = vi.fn();
        const previousRenders = vi.mocked(renderEcharts).mock.calls.length;
        const { output, sendFile } = await executeLinksOnly({
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
        expect(sendFile).not.toHaveBeenCalled();
        expect(vi.mocked(renderEcharts).mock.calls).toHaveLength(
            previousRenders,
        );
        expect(output.metadata.status).toBe('success');
        expect(output.result).toContain('one');
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
        expect(output.result).toContain(
            "Success This chart's versionUuid is version-uuid",
        );
        expect(output.metadata).toMatchObject({
            artifactVersionUuid: 'version-uuid',
        });
        expect(output.structuredContent).toEqual({
            outcome: 'chartOnly',
        });
        expect(toolRunQueryOutputSchema.safeParse(output).success).toBe(true);
    });

    it('never uploads an image before the final answer selects a chart', async () => {
        const { output, sendFile } = await executeLinksOnly({
            enableDataAccess: true,
            slackLinksOnly: false,
        });

        expect(sendFile).not.toHaveBeenCalled();
        expect(vi.mocked(renderEcharts)).not.toHaveBeenCalled();
        expect(output.result).toContain(
            "This chart's versionUuid is version-uuid",
        );
        expect(output.metadata).not.toHaveProperty(
            'chartImageUrl',
            expect.any(String),
        );
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
                          rankingDirection: {
                              type: 'choice',
                              choice: 'descending',
                              confidence: 0.99,
                              probabilities: { descending: 0.99 },
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

describe('getRunQuery structured content', () => {
    const rows = [
        { a_dim1: 'one', a_met1: 1 },
        { a_dim1: 'two', a_met1: 2 },
        { a_dim1: 'three', a_met1: 3 },
    ];

    const execute = async ({
        queryRows = rows,
        maxContextRows = Number.POSITIVE_INFINITY,
        maxLimit = 500,
        exposeQueryUuid = false,
        enableDataAccess = true,
        prompt = makePrompt(),
        input = toolInput,
    }: {
        queryRows?: Record<string, unknown>[];
        maxContextRows?: number;
        maxLimit?: number;
        exposeQueryUuid?: boolean;
        enableDataAccess?: boolean;
        prompt?: AiWebAppPrompt | SlackPrompt;
        input?: ToolRunQueryArgs;
    } = {}) => {
        const queryTool = getRunQuery({
            updateProgress: vi.fn().mockResolvedValue(undefined),
            runAsyncQuery: vi.fn().mockResolvedValue({
                queryUuid: '11111111-1111-4111-8111-111111111111',
                rows: queryRows,
                cacheMetadata: { cacheHit: false },
                fields: {},
            }) as RunAsyncQueryFn,
            runAsyncMergeQuery: vi.fn() as RunAsyncMergeQueryFn,
            enableMergeQueries: false,
            enableFilterExpressions: false,
            projectParameterDefinitions: {},
            getPrompt: vi.fn().mockResolvedValue(prompt),
            sendFile: vi.fn().mockResolvedValue(undefined),
            createOrUpdateArtifact: vi.fn().mockResolvedValue(undefined),
            maxLimit,
            maxContextRows,
            exposeQueryUuid,
            enableDataAccess,
            slackLinksOnly: false,
            resolveCustomChartType: vi.fn().mockResolvedValue(null),
            exportCustomChartTypeImage: vi.fn() as ExportCustomChartTypeImageFn,
            agentContext: new AgentContext([validExplore]),
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

    it('mirrors the rows, row count and limit the text reports', async () => {
        const output = await execute();

        expect(toolRunQueryOutputSchema.safeParse(output).success).toBe(true);
        expect(output.result).toContain('Returned all 3 rows');
        expect(output.result).toContain('The row limit of 500 was not reached');
        expect(output.structuredContent).toEqual({
            outcome: 'results',
            queryUuid: null,
            rowCount: 3,
            limit: { requested: null, effective: 500, max: 500 },
            parameters: null,
            data: { columns: ['a_dim1', 'a_met1'], rows },
        });
    });

    it('carries only the rows the text shows when the context is truncated', async () => {
        const output = await execute({ maxContextRows: 2 });

        expect(output.result).toContain(
            'Only the first 2 of those 3 rows are shown here',
        );
        expect(output.result).toContain('two');
        expect(output.result).not.toContain('three');
        expect(output.structuredContent).toMatchObject({
            rowCount: 3,
            data: { rows: rows.slice(0, 2) },
        });
    });

    it('reports a reached limit consistently with the text', async () => {
        const output = await execute({ maxLimit: 3 });

        expect(output.result).toContain(
            'Returned 3 rows, reaching the row limit of 3',
        );
        expect(output.structuredContent).toMatchObject({
            rowCount: 3,
            limit: { requested: null, effective: 3, max: 3 },
        });
    });

    it('cites the query uuid only when the text does', async () => {
        const hidden = await execute();
        const cited = await execute({ exposeQueryUuid: true });

        expect(hidden.structuredContent).toMatchObject({ queryUuid: null });
        expect(cited.result).toContain(
            "This execution's queryUuid is 11111111-1111-4111-8111-111111111111",
        );
        expect(cited.structuredContent).toMatchObject({
            queryUuid: '11111111-1111-4111-8111-111111111111',
        });
    });

    it('omits the data when the rows are hidden from the model', async () => {
        const output = await execute({
            enableDataAccess: false,
            prompt: makeSlackPrompt(),
        });

        expect(output.result).toContain('Success. Returned all 3 rows');
        expect(output.result).not.toContain('one');
        expect(output.structuredContent).toMatchObject({
            outcome: 'results',
            rowCount: 3,
            data: null,
        });
        expect(toolRunQueryOutputSchema.safeParse(output).success).toBe(true);
    });

    it('reports an empty result as noResults', async () => {
        const output = await execute({ queryRows: [] });

        expect(output.result).toContain('No results were returned');
        expect(output.structuredContent).toMatchObject({
            outcome: 'noResults',
            rowCount: 0,
            parameters: null,
        });
        expect(toolRunQueryOutputSchema.safeParse(output).success).toBe(true);
    });
});
