import { getBasicType } from './catalog';
import type { CompiledMetric } from './field';
import { FieldType, MetricType } from './field';

describe('getBasicType', () => {
    it('should return number for VARIANCE metric type', () => {
        const varianceMetric: CompiledMetric = {
            fieldType: FieldType.METRIC,
            type: MetricType.VARIANCE,
            name: 'test_variance',
            label: 'Test Variance',
            table: 'test_table',
            tableLabel: 'Test Table',
            sql: 'VARIANCE(${TABLE}.column)',
            compiledSql: 'VARIANCE("test_table"."column")',
            tablesReferences: ['test_table'],
            hidden: false,
            groups: [],
        };
        expect(getBasicType(varianceMetric)).toBe('number');
    });

    it('should return number for STANDARD_DEVIATION metric type', () => {
        const standardDeviationMetric: CompiledMetric = {
            fieldType: FieldType.METRIC,
            type: MetricType.STANDARD_DEVIATION,
            name: 'test_stddev',
            label: 'Test Standard Deviation',
            table: 'test_table',
            tableLabel: 'Test Table',
            sql: 'STDDEV(${TABLE}.column)',
            compiledSql: 'STDDEV("test_table"."column")',
            tablesReferences: ['test_table'],
            hidden: false,
            groups: [],
        };
        expect(getBasicType(standardDeviationMetric)).toBe('number');
    });

    it('should return number for other numeric metric types', () => {
        const averageMetric: CompiledMetric = {
            fieldType: FieldType.METRIC,
            type: MetricType.AVERAGE,
            name: 'test_avg',
            label: 'Test Average',
            table: 'test_table',
            tableLabel: 'Test Table',
            sql: 'AVG(${TABLE}.column)',
            compiledSql: 'AVG("test_table"."column")',
            tablesReferences: ['test_table'],
            hidden: false,
            groups: [],
        };
        expect(getBasicType(averageMetric)).toBe('number');
    });
});
