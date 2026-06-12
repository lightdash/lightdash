import { ChartType, type ChartAsCode } from '@lightdash/common';
import { AiAgentContentValidation } from './AiAgentContentValidation';

describe('AiAgentContentValidation', () => {
    it('validates chart-as-code chart artifacts', () => {
        const validator = new AiAgentContentValidation();
        const chart = {
            name: 'Orders',
            tableName: 'orders',
            metricQuery: {
                exploreName: 'orders',
                dimensions: [],
                metrics: ['orders_count'],
                filters: {},
                sorts: [],
                limit: 500,
                tableCalculations: [],
                additionalMetrics: [],
            },
            chartConfig: { type: ChartType.TABLE },
            slug: 'orders',
            spaceSlug: 'agent-suggestions',
            version: 1,
        } as unknown as ChartAsCode;

        expect(() => validator.validateContent('chart', chart)).not.toThrow();
    });

    it('validates canonical table styling in chart-as-code config', () => {
        const validator = new AiAgentContentValidation();

        expect(() =>
            validator.validateContent('chart', {
                name: 'Styled table',
                tableName: 'orders',
                metricQuery: {
                    exploreName: 'orders',
                    dimensions: [],
                    metrics: ['orders_count'],
                    filters: {},
                    sorts: [],
                    limit: 500,
                    tableCalculations: [],
                    additionalMetrics: [],
                },
                chartConfig: {
                    type: ChartType.TABLE,
                    config: {
                        columns: {
                            orders_count: {
                                displayStyle: 'bar',
                                color: '#4CAF50',
                            },
                        },
                    },
                },
                slug: 'styled-table',
                spaceSlug: 'agent-suggestions',
                version: 1,
            }),
        ).not.toThrow();
    });

    it('returns validation errors for invalid chart-as-code', () => {
        const validator = new AiAgentContentValidation();

        expect(() =>
            validator.validateContent('chart', {
                name: 'Broken',
                tableName: 'orders',
                metricQuery: {
                    exploreName: 'orders',
                    dimensions: [],
                    metrics: ['orders_count'],
                    filters: {},
                    sorts: [],
                    limit: 500,
                    tableCalculations: [],
                },
                chartConfig: { type: 'line' },
                slug: 'broken',
                spaceSlug: 'agent-suggestions',
                version: 1,
            }),
        ).toThrow('Edited chart is invalid');
    });

    it('rejects non-canonical table styling outside chart-as-code config', () => {
        const validator = new AiAgentContentValidation();

        expect(() =>
            validator.validateContent('chart', {
                name: 'Broken table',
                tableName: 'orders',
                metricQuery: {
                    exploreName: 'orders',
                    dimensions: [],
                    metrics: ['orders_count'],
                    filters: {},
                    sorts: [],
                    limit: 500,
                    tableCalculations: [],
                    additionalMetrics: [],
                },
                chartConfig: {
                    type: ChartType.TABLE,
                    columns: {
                        orders_count: {
                            dataBarColor: '#4CAF50',
                        },
                    },
                },
                slug: 'broken-table',
                spaceSlug: 'agent-suggestions',
                version: 1,
            }),
        ).toThrow('Edited chart is invalid');
    });
});
