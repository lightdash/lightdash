import { toolRunMetricQueryOutputSchema } from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { describe, expect, it, vi } from 'vitest';
import {
    metricQueryMock,
    validExplore,
} from '../../../../services/ProjectService/ProjectService.mock';
import { AiDecisionClient } from '../decisions/AiDecisionClient';
import { NO_RESULTS_RETRY_PROMPT } from '../prompts/noResultsRetry';
import type { RunAsyncQueryFn } from '../types/aiAgentDependencies';
import { AgentContext } from '../utils/AgentContext';
import { getRunMetricQuery } from './runMetricQuery';

describe('metric query intent review', () => {
    it.each([0, 1])(
        'reviews the current user question and effective query with %s rows',
        async (rowCount) => {
            const decisions = new AiDecisionClient({
                apiKey: null,
                model: 'test',
                timeoutMs: 100,
            });
            const evaluate = vi.spyOn(decisions, 'evaluate').mockResolvedValue({
                conditions: { type: 'noul', noul: 0.99 },
            });
            const runAsyncQuery = vi.fn().mockResolvedValue({
                queryUuid: 'query',
                rows: rowCount ? [{ a_dim1: 'active', a_met1: 42 }] : [],
                fields: {},
                cacheMetadata: { cacheHit: false },
            });
            const tool = getRunMetricQuery({
                agentContext: new AgentContext([validExplore]),
                decisions,
                runAsyncQuery,
                maxLimit: 50,
            });
            const output = await tool.execute!(
                {
                    vizConfig: {
                        exploreName: validExplore.name,
                        metrics: metricQueryMock.metrics,
                        dimensions: metricQueryMock.dimensions,
                        sorts: [],
                        limit: 100,
                    },
                    customMetrics: null,
                    tableCalculations: null,
                    filters: null,
                },
                {
                    toolCallId: 'call',
                    messages: [
                        {
                            role: 'user',
                            content: 'Count active orders by customer',
                        },
                    ],
                    context: {},
                },
            );
            expect(output).toMatchObject({
                metadata: { status: 'success' },
                result: expect.stringContaining(
                    'grouping alone does not apply a filter',
                ),
            });
            expect(runAsyncQuery).toHaveBeenCalledOnce();
            expect(evaluate).toHaveBeenCalledTimes(rowCount ? 1 : 2);
            expect(evaluate.mock.calls[0][0].state).toMatchObject({
                question: 'Count active orders by customer',
                query: { limit: 50 },
            });
            if (!rowCount)
                expect(output).toMatchObject({
                    result: expect.stringContaining(
                        'Preserve the user’s scope',
                    ),
                });
        },
    );
    it('runs without review when the feature is disabled', async () => {
        const runAsyncQuery = vi.fn().mockResolvedValue({
            queryUuid: 'query',
            rows: [{ a_met1: 42 }],
            fields: {},
            cacheMetadata: { cacheHit: false },
        });
        const tool = getRunMetricQuery({
            agentContext: new AgentContext([validExplore]),
            runAsyncQuery,
            maxLimit: 50,
        });
        const output = await tool.execute!(
            {
                vizConfig: {
                    exploreName: validExplore.name,
                    metrics: metricQueryMock.metrics,
                    dimensions: metricQueryMock.dimensions,
                    sorts: [],
                    limit: 100,
                },
                customMetrics: null,
                tableCalculations: null,
                filters: null,
            },
            {
                toolCallId: 'call',
                messages: [],
                context: {},
            },
        );
        expect(output).toMatchObject({
            metadata: { status: 'success' },
            result: expect.not.stringContaining('Query/question review'),
        });
        expect(runAsyncQuery).toHaveBeenCalledOnce();
    });
});

vi.mock('@sentry/node', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@sentry/node')>();
    return { ...actual, captureException: vi.fn() };
});

const toolInput = {
    vizConfig: {
        exploreName: validExplore.name,
        dimensions: metricQueryMock.dimensions,
        metrics: metricQueryMock.metrics,
        sorts: [],
        limit: null,
    },
    customMetrics: null,
    tableCalculations: null,
    filters: null,
};

const queryFields = {
    a_dim1: validExplore.tables.a.dimensions.dim1,
    a_met1: validExplore.tables.a.metrics.met1,
};

const executeTool = async (
    runAsyncQuery: RunAsyncQueryFn,
    input: typeof toolInput = toolInput,
) => {
    const metricQueryTool = getRunMetricQuery({
        runAsyncQuery,
        maxLimit: 500,
        agentContext: new AgentContext([validExplore]),
    });
    if (metricQueryTool.execute === undefined) {
        throw new Error('Expected the tool to define execute');
    }
    const output = await metricQueryTool.execute(input, {
        messages: [],
        toolCallId: 'tool-call-1',
        context: {},
    });
    if (Symbol.asyncIterator in output) {
        throw new Error('Expected a non-streaming tool result');
    }
    return output;
};

describe('getRunMetricQuery', () => {
    it('returns the CSV text and the same rows as structured content', async () => {
        const runAsyncQuery: RunAsyncQueryFn = vi.fn().mockResolvedValue({
            queryUuid: '11111111-1111-4111-8111-111111111111',
            rows: [
                { a_dim1: 'one', a_met1: 1 },
                { a_dim1: 'two', a_met1: null },
            ],
            cacheMetadata: { cacheHit: false },
            fields: queryFields,
        });

        const output = await executeTool(runAsyncQuery);

        expect(output).toEqual({
            result: ['```csv', 'dim1,met1\none,1\ntwo,\n', '```'].join('\n'),
            metadata: { status: 'success', queryCacheHit: false },
            structuredContent: {
                columns: [
                    { fieldId: 'a_dim1', label: 'dim1' },
                    { fieldId: 'a_met1', label: 'met1' },
                ],
                rows: [
                    { a_dim1: 'one', a_met1: 1 },
                    { a_dim1: 'two', a_met1: null },
                ],
                rowCount: 2,
            },
        });
        expect(toolRunMetricQueryOutputSchema.safeParse(output).success).toBe(
            true,
        );
    });

    it('reports no results with an empty structured result', async () => {
        const runAsyncQuery: RunAsyncQueryFn = vi.fn().mockResolvedValue({
            queryUuid: '11111111-1111-4111-8111-111111111111',
            rows: [],
            cacheMetadata: { cacheHit: false },
            fields: queryFields,
        });

        const output = await executeTool(runAsyncQuery);

        expect(output).toEqual({
            result: NO_RESULTS_RETRY_PROMPT,
            metadata: { status: 'success', queryCacheHit: false },
            structuredContent: { columns: [], rows: [], rowCount: 0 },
        });
        expect(toolRunMetricQueryOutputSchema.safeParse(output).success).toBe(
            true,
        );
    });

    it('mirrors the error text in structured content when the query fails', async () => {
        const runAsyncQuery: RunAsyncQueryFn = vi
            .fn()
            .mockRejectedValue(new Error('warehouse exploded'));

        const output = await executeTool(runAsyncQuery);

        expect(output.metadata).toMatchObject({ status: 'error' });
        expect(output.result).toContain('Error running metric query.');
        expect(output.result).toContain('warehouse exploded');
        expect(output.structuredContent).toEqual({ error: output.result });
        expect(toolRunMetricQueryOutputSchema.safeParse(output).success).toBe(
            true,
        );
        expect(Sentry.captureException).toHaveBeenCalled();
    });

    it('mirrors validation failures without running the query', async () => {
        const runAsyncQuery = vi.fn<RunAsyncQueryFn>();

        const output = await executeTool(runAsyncQuery, {
            ...toolInput,
            vizConfig: { ...toolInput.vizConfig, metrics: ['a_unknown'] },
        });

        expect(runAsyncQuery).not.toHaveBeenCalled();
        expect(output.metadata).toMatchObject({ status: 'error' });
        expect(output.structuredContent).toEqual({ error: output.result });
        expect(toolRunMetricQueryOutputSchema.safeParse(output).success).toBe(
            true,
        );
    });
});
