import { describe, expect, it } from 'vitest';
import {
    compareBattleQueries,
    getLatestBattleQuerySignature,
} from './battleQueryComparison';

const assistant = (queryConfig: Record<string, unknown>) => ({
    role: 'assistant',
    toolCalls: [
        {
            toolName: 'runQuery',
            toolArgs: { queryConfig, chartConfig: null },
        },
    ],
});

describe('battle query comparison', () => {
    it('flags answers that use different metrics', () => {
        const comparison = compareBattleQueries(
            [
                assistant({
                    exploreName: 'orders',
                    dimensions: [],
                    metrics: ['orders_completed_order_count'],
                }),
            ],
            [
                assistant({
                    exploreName: 'orders',
                    dimensions: [],
                    metrics: ['orders_unique_order_count'],
                }),
            ],
        );

        expect(comparison).toMatchObject({
            same: false,
            left: { summary: 'orders_completed_order_count' },
            right: { summary: 'orders_unique_order_count' },
        });
    });

    it('explains differing filter fields in the summary', () => {
        const signature = getLatestBattleQuerySignature([
            assistant({
                exploreName: 'orders',
                dimensions: [],
                metrics: ['orders_unique_order_count'],
                filters: {
                    type: 'and',
                    dimensions: [{ fieldId: 'orders_order_date' }],
                },
            }),
        ]);

        expect(signature?.summary).toBe(
            'orders_unique_order_count · filters: orders_order_date',
        );
    });

    it('ignores field ordering and chart presentation', () => {
        const left = getLatestBattleQuerySignature([
            assistant({
                exploreName: 'orders',
                dimensions: ['orders_region', 'orders_date'],
                metrics: ['orders_revenue', 'orders_count'],
            }),
        ]);
        const right = getLatestBattleQuerySignature([
            {
                role: 'assistant',
                toolCalls: [
                    {
                        toolName: 'generateVisualization',
                        toolArgs: {
                            queryConfig: {
                                exploreName: 'orders',
                                dimensions: ['orders_date', 'orders_region'],
                                metrics: ['orders_count', 'orders_revenue'],
                            },
                            chartConfig: { type: 'line' },
                        },
                    },
                ],
            },
        ]);

        expect(left?.fingerprint).toBe(right?.fingerprint);
    });
});
