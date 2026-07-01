import {
    MetricType,
    type CustomMetricBaseTransformed,
} from '@lightdash/common';
import { mockOrdersExplore } from './validationExplore.mock';
import { validateCustomMetricsDefinition } from './validators';

const customMetric = (
    overrides: Partial<CustomMetricBaseTransformed>,
): CustomMetricBaseTransformed => ({
    table: 'orders',
    name: 'my_metric',
    label: 'My metric',
    description: 'desc',
    baseDimensionName: 'amount',
    type: MetricType.COUNT_DISTINCT,
    filters: undefined,
    ...overrides,
});

describe('validateCustomMetricsDefinition', () => {
    it('does not throw for a base dimension that exists', () => {
        expect(() =>
            validateCustomMetricsDefinition(mockOrdersExplore, [
                customMetric({ baseDimensionName: 'amount' }),
            ]),
        ).not.toThrow();
    });

    it('reports the resolved field id and lists available dimensions when the base dimension does not exist', () => {
        let error: Error | undefined;
        try {
            validateCustomMetricsDefinition(mockOrdersExplore, [
                // The agent's classic mistake: guessing a "<table>_id" column.
                customMetric({ baseDimensionName: 'missing_id' }),
            ]);
        } catch (e) {
            error = e as Error;
        }

        expect(error).toBeDefined();
        // Echoes the field id actually looked for, not the prefix-stripped name.
        expect(error!.message).toContain('orders_missing_id');
        // Gives the agent the real options to correct in one step.
        expect(error!.message).toContain('Available dimensions:');
        expect(error!.message).toContain('orders_customer_name');
    });
});
