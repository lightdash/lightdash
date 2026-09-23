import { describe, expect, it, vi } from 'vitest';
import {
    metricQueryMock,
    validExplore,
} from '../../../../services/ProjectService/ProjectService.mock';
import { AiDecisionClient } from '../decisions/AiDecisionClient';
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
