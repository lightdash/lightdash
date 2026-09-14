import { describe, expect, it } from 'vitest';
import {
    toolDashboardV2ArgsSchema,
    toolDashboardV2ArgsSchemaPersisted,
    toolDashboardV2ArgsSchemaTransformed,
} from './toolDashboardV2Args';

const visualization = (tableCalculations: unknown) => ({
    title: 'Revenue',
    description: 'Revenue',
    queryConfig: {
        exploreName: 'orders',
        dimensions: ['orders_created_month'],
        metrics: ['orders_revenue'],
        sorts: [],
        limit: 500,
        customMetrics: null,
        tableCalculations,
        filters: null,
    },
    chartConfig: null,
});

const templateCalc = {
    type: 'running_total',
    name: 'running_revenue',
    displayName: 'Running Revenue',
    fieldId: 'orders_revenue',
};

// Persisted dashboard artifacts predate the formula-only V4 contract; the V3
// parse path must keep accepting template table calcs.
describe('toolDashboardV2Args persisted parsing', () => {
    const persistedDashboard = {
        title: 'Revenue dashboard',
        description: 'Revenue dashboard',
        visualizations: [visualization([templateCalc]), visualization(null)],
    };

    it('V3 schema parses persisted dashboards with template table calcs', () => {
        expect(
            toolDashboardV2ArgsSchemaPersisted.safeParse(persistedDashboard)
                .success,
        ).toBe(true);
        expect(
            toolDashboardV2ArgsSchemaTransformed.safeParse(persistedDashboard)
                .success,
        ).toBe(true);
    });

    it('advertised schema only accepts formula table calcs', () => {
        expect(
            toolDashboardV2ArgsSchema.safeParse(persistedDashboard).success,
        ).toBe(false);
        expect(
            toolDashboardV2ArgsSchema.safeParse({
                ...persistedDashboard,
                visualizations: [
                    visualization([
                        {
                            type: 'formula',
                            name: 'aov',
                            displayName: 'AOV',
                            formula: 'orders_revenue / 2',
                            format: null,
                            resultType: null,
                        },
                    ]),
                    visualization(null),
                ],
            }).success,
        ).toBe(true);
    });
});
