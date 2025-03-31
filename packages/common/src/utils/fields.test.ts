import { CustomFormatType, isField, NumberSeparator } from '../types/field';
import { FilterOperator, UnitOfTime } from '../types/filter';
import {
    compareMetricAndCustomMetric,
    getFieldsFromMetricQuery,
} from './fields';
import {
    customMetric,
    emptyExplore,
    emptyMetricQuery,
    explore,
    metric,
    metricFilterRule,
    metricQuery,
} from './fields.mock';

describe('getFieldsFromMetricQuery', () => {
    test('should return all valid fields', async () => {
        const result = getFieldsFromMetricQuery(metricQuery, explore);
        expect(Object.keys(result)).toEqual([
            'table1_dim1',
            'table1_metric1',
            'calc2',
            'custom_dimension_1',
            'table1_additional_metric_1',
        ]);

        // Check a few types of items
        expect(isField(result.table1_metric1)).toEqual(true);

        expect(
            isField(result.table1_metric1) && result.table1_metric1.fieldType,
        ).toEqual('metric');
        expect(
            isField(result.table1_metric1) && result.table1_metric1.type,
        ).toEqual('average');
    });

    test('should test with empty explore', async () => {
        // With an empty explore, we can't get dimensions or metrics, but we still return table calculations and custom dimensions
        const result = getFieldsFromMetricQuery(metricQuery, emptyExplore);
        expect(Object.keys(result)).toEqual(['calc2', 'custom_dimension_1']);
    });

    test('should test with empty metric query', async () => {
        const result = getFieldsFromMetricQuery(emptyMetricQuery, explore);
        expect(Object.keys(result)).toEqual([]);
    });

    test('should not return custom metric or dimensions if not selected', async () => {
        const result = getFieldsFromMetricQuery(
            {
                ...metricQuery,
                dimensions: ['table1_dim1', 'table2_dim2'],
                metrics: ['table1_metric1', 'table2_metric2'],
            },
            explore,
        );
        expect(Object.keys(result)).toEqual([
            'table1_dim1',
            'table1_metric1',
            'calc2',
            // 'custom_dimension_1',
            // 'table1_additional_metric_1',
        ]);
    });
});

describe('compareMetricAndCustomMetric', () => {
    test('should return exact match for simple custom metric', async () => {
        const result = compareMetricAndCustomMetric({
            customMetric,
            metric,
        });
        expect(result.isExactMatch).toEqual(true);
        expect(result.isSuggestedMatch).toEqual(true);
    });
    const mismatchButSuggestCases = [
        ['name', 'diff_name'],
        ['label', 'diff label'],
    ];
    test.each(mismatchButSuggestCases)(
        'should not match but suggest when %s has different value',
        (key, value) => {
            const result = compareMetricAndCustomMetric({
                customMetric: {
                    ...customMetric,
                    [key]: value,
                },
                metric,
            });
            expect(result.isExactMatch).toEqual(false);
            expect(result.isSuggestedMatch).toEqual(true);
        },
    );
    const mismatchCases = [
        ['sql', 'diff_sql'],
        ['baseDimensionName', 'diff_baseDimensionName'],
        ['table', 'diff_table'],
        ['type', 'max'],
    ];
    test.each(mismatchCases)(
        'should not match or suggest when %s has different value',
        (key, value) => {
            const result = compareMetricAndCustomMetric({
                customMetric: {
                    ...customMetric,
                    [key]: value,
                },
                metric,
            });
            expect(result.isExactMatch).toEqual(false);
            expect(result.isSuggestedMatch).toEqual(false);
        },
    );

    test('should return exact match when comparing format expression with format object', async () => {
        const result = compareMetricAndCustomMetric({
            customMetric: {
                ...customMetric,
                formatOptions: {
                    type: CustomFormatType.CURRENCY,
                    currency: 'JPY',
                    round: 3,
                    separator: NumberSeparator.COMMA_PERIOD,
                },
            },
            metric: {
                ...metric,
                format: '[$¥]#,##0.000',
            },
        });
        expect(result.isExactMatch).toEqual(true);
        expect(result.isSuggestedMatch).toEqual(true);
    });

    test('should return exact match with multiple filters', async () => {
        const result = compareMetricAndCustomMetric({
            customMetric: {
                ...customMetric,
                filters: [
                    metricFilterRule(),
                    metricFilterRule({
                        fieldRef: 'b_dim2',
                        values: ['2', '4'],
                        operator: FilterOperator.IN_BETWEEN,
                    }),
                    metricFilterRule({
                        operator: FilterOperator.IN_THE_PAST,
                        settings: {
                            unitOfTime: UnitOfTime.years,
                        },
                    }),
                ],
            },
            metric: {
                ...metric,
                filters: [
                    metricFilterRule(),
                    metricFilterRule({
                        fieldRef: 'b_dim2',
                        values: ['2', '4'],
                        operator: FilterOperator.IN_BETWEEN,
                    }),
                    metricFilterRule({
                        operator: FilterOperator.IN_THE_PAST,
                        settings: {
                            unitOfTime: UnitOfTime.years,
                        },
                    }),
                ],
            },
        });
        expect(result.isExactMatch).toEqual(true);
        expect(result.isSuggestedMatch).toEqual(true);
    });

    test('should not match or suggest when filter has different value', async () => {
        // Different filters length
        const result = compareMetricAndCustomMetric({
            customMetric: {
                ...customMetric,
                filters: [metricFilterRule(), metricFilterRule()],
            },
            metric: {
                ...metric,
                filters: [metricFilterRule()],
            },
        });
        expect(result.isExactMatch).toEqual(false);
        expect(result.isSuggestedMatch).toEqual(false);

        // Different operator
        const result2 = compareMetricAndCustomMetric({
            customMetric: {
                ...customMetric,
                filters: [metricFilterRule()],
            },
            metric: {
                ...metric,
                filters: [
                    metricFilterRule({
                        operator: FilterOperator.NOT_EQUALS,
                    }),
                ],
            },
        });
        expect(result2.isExactMatch).toEqual(false);
        expect(result2.isSuggestedMatch).toEqual(false);

        // Different values
        const result3 = compareMetricAndCustomMetric({
            customMetric: {
                ...customMetric,
                filters: [metricFilterRule()],
            },
            metric: {
                ...metric,
                filters: [
                    metricFilterRule({
                        values: ['2'],
                    }),
                ],
            },
        });
        expect(result3.isExactMatch).toEqual(false);
        expect(result3.isSuggestedMatch).toEqual(false);

        // Different fieldRef
        const result4 = compareMetricAndCustomMetric({
            customMetric: {
                ...customMetric,
                filters: [metricFilterRule()],
            },
            metric: {
                ...metric,
                filters: [
                    metricFilterRule({
                        fieldRef: 'b_dim2',
                    }),
                ],
            },
        });
        expect(result4.isExactMatch).toEqual(false);
        expect(result4.isSuggestedMatch).toEqual(false);

        // Different unit of time
        const result5 = compareMetricAndCustomMetric({
            customMetric: {
                ...customMetric,
                filters: [
                    metricFilterRule({
                        operator: FilterOperator.IN_THE_PAST,
                        settings: {
                            unitOfTime: UnitOfTime.days,
                        },
                    }),
                ],
            },
            metric: {
                ...metric,
                filters: [
                    metricFilterRule({
                        operator: FilterOperator.IN_THE_PAST,
                        settings: {
                            unitOfTime: UnitOfTime.years,
                            completed: true,
                        },
                    }),
                ],
            },
        });
        expect(result5.isExactMatch).toEqual(false);
        expect(result5.isSuggestedMatch).toEqual(false);

        // Different filter types (one time filter, one not)
        const result6 = compareMetricAndCustomMetric({
            customMetric: {
                ...customMetric,
                filters: [
                    metricFilterRule({
                        operator: FilterOperator.IN_THE_PAST,
                        settings: {
                            unitOfTime: UnitOfTime.days,
                        },
                    }),
                ],
            },
            metric: {
                ...metric,
                filters: [metricFilterRule()],
            },
        });
        expect(result6.isExactMatch).toEqual(false);
        expect(result6.isSuggestedMatch).toEqual(false);
    });
});
