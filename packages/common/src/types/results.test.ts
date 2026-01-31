import type { Metric } from './field';
import { DimensionType, FieldType, MetricType } from './field';
import { convertItemTypeToDimensionType } from './results';

describe('convertItemTypeToDimensionType', () => {
    it('should convert VARIANCE metric to NUMBER dimension type', () => {
        const varianceMetric: Metric = {
            fieldType: FieldType.METRIC,
            type: MetricType.VARIANCE,
            name: 'test_variance',
            label: 'Test Variance',
            table: 'test_table',
            tableLabel: 'Test Table',
            sql: 'VARIANCE(${TABLE}.column)',
            hidden: false,
            groups: [],
        };
        expect(convertItemTypeToDimensionType(varianceMetric)).toBe(
            DimensionType.NUMBER,
        );
    });

    it('should convert STANDARD_DEVIATION metric to NUMBER dimension type', () => {
        const standardDeviationMetric: Metric = {
            fieldType: FieldType.METRIC,
            type: MetricType.STANDARD_DEVIATION,
            name: 'test_stddev',
            label: 'Test Standard Deviation',
            table: 'test_table',
            tableLabel: 'Test Table',
            sql: 'STDDEV(${TABLE}.column)',
            hidden: false,
            groups: [],
        };
        expect(convertItemTypeToDimensionType(standardDeviationMetric)).toBe(
            DimensionType.NUMBER,
        );
    });

    it('should convert other numeric metric types to NUMBER', () => {
        const averageMetric: Metric = {
            fieldType: FieldType.METRIC,
            type: MetricType.AVERAGE,
            name: 'test_avg',
            label: 'Test Average',
            table: 'test_table',
            tableLabel: 'Test Table',
            sql: 'AVG(${TABLE}.column)',
            hidden: false,
            groups: [],
        };
        expect(convertItemTypeToDimensionType(averageMetric)).toBe(
            DimensionType.NUMBER,
        );
    });
});
