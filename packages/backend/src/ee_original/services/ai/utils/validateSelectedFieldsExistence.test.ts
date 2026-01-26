import {
    MetricType,
    type AdditionalMetric,
    type CustomMetricBase,
    type TableCalcsSchema,
    type TableCalculation,
} from '@lightdash/common';

import { mockUsersOrdersExplore } from './validationExplore.mock';
import { validateSelectedFieldsExistence } from './validators';

describe('validateSelectedFieldsExistence', () => {
    describe('when selected fields are valid', () => {
        it('should not throw for base explore selections', () => {
            const selectedFieldIds = [
                'users_user_id',
                'users_user_name',
                'users_total_users',
            ];

            expect(() =>
                validateSelectedFieldsExistence(
                    mockUsersOrdersExplore,
                    selectedFieldIds,
                ),
            ).not.toThrow();

            expect(() =>
                validateSelectedFieldsExistence(mockUsersOrdersExplore, []),
            ).not.toThrow();
        });

        it('should not throw when joined table fields are selected', () => {
            const selectedFieldIds = ['users_user_id', 'orders_order_id'];

            expect(() =>
                validateSelectedFieldsExistence(
                    mockUsersOrdersExplore,
                    selectedFieldIds,
                ),
            ).not.toThrow();
        });

        it('should not throw when fields exist across all sources', () => {
            const selectedFieldIds = [
                'users_user_id',
                'users_avg_metric',
                'running_total_calc',
            ];

            const customMetrics: CustomMetricBase[] = [
                {
                    name: 'avg_metric',
                    label: 'Average Metric',
                    description: 'Average of user metric',
                    table: 'users',
                    baseDimensionName: 'user_id',
                    type: MetricType.AVERAGE,
                },
            ];

            const tableCalculations: TableCalcsSchema = [
                {
                    type: 'running_total',
                    name: 'running_total_calc',
                    displayName: 'Running Total',
                    fieldId: 'users_total_users',
                },
            ];

            expect(() =>
                validateSelectedFieldsExistence(
                    mockUsersOrdersExplore,
                    selectedFieldIds,
                    customMetrics,
                    tableCalculations,
                ),
            ).not.toThrow();
        });

        it('should not throw when fields exist only in custom metrics', () => {
            const customMetricSelectedFieldIds = ['users_custom_metric'];

            const customMetrics: CustomMetricBase[] = [
                {
                    name: 'custom_metric',
                    label: 'Custom Metric',
                    description: 'Sum of user values',
                    table: 'users',
                    baseDimensionName: 'user_id',
                    type: MetricType.SUM,
                },
            ];

            expect(() =>
                validateSelectedFieldsExistence(
                    mockUsersOrdersExplore,
                    customMetricSelectedFieldIds,
                    customMetrics,
                ),
            ).not.toThrow();

            const aiAdditionalMetricSelectedFieldIds = ['users_custom_average'];
            const aiAdditionalMetric: Omit<AdditionalMetric, 'sql'> = {
                table: 'users',
                name: 'custom_average',
                label: 'Custom Average',
                type: MetricType.AVERAGE,
            };

            expect(() =>
                validateSelectedFieldsExistence(
                    mockUsersOrdersExplore,
                    aiAdditionalMetricSelectedFieldIds,
                    [aiAdditionalMetric],
                ),
            ).not.toThrow();
        });

        it('should not throw when fields exist only in table calculations', () => {
            const tableCalcSchemaSelectedFieldIds = ['percent_change_calc'];

            const tableCalcSchema: TableCalcsSchema = [
                {
                    type: 'percent_change_from_previous',
                    name: 'percent_change_calc',
                    displayName: 'Percent Change',
                    fieldId: 'users_total_users',
                    orderBy: [],
                },
            ];

            expect(() =>
                validateSelectedFieldsExistence(
                    mockUsersOrdersExplore,
                    tableCalcSchemaSelectedFieldIds,
                    null,
                    tableCalcSchema,
                ),
            ).not.toThrow();

            const tableCalculationSelectedFieldIds = ['ai_running_total'];

            const tableCalculations: TableCalculation[] = [
                {
                    name: 'ai_running_total',
                    displayName: 'AI Running Total',
                    sql: '${TABLE}.total_users',
                },
            ];

            expect(() =>
                validateSelectedFieldsExistence(
                    mockUsersOrdersExplore,
                    tableCalculationSelectedFieldIds,
                    null,
                    tableCalculations,
                ),
            ).not.toThrow();
        });
    });

    describe('when selected fields are invalid', () => {
        it('should throw when fields do not exist in any source', () => {
            const selectedFieldIds = [
                'users_user_id',
                'non_existent_field',
                'another_missing_field',
            ];

            expect(() =>
                validateSelectedFieldsExistence(
                    mockUsersOrdersExplore,
                    selectedFieldIds,
                ),
            ).toThrow(
                /The following fields are neither in the explore nor in the custom metrics/,
            );

            expect(() =>
                validateSelectedFieldsExistence(
                    mockUsersOrdersExplore,
                    selectedFieldIds,
                ),
            ).toThrow(/non_existent_field/);

            expect(() =>
                validateSelectedFieldsExistence(
                    mockUsersOrdersExplore,
                    selectedFieldIds,
                ),
            ).toThrow(/another_missing_field/);
        });
    });
});
