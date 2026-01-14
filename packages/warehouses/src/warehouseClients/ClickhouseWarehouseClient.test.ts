import type { Metric } from '@lightdash/common';
import { FieldType, MetricType } from '@lightdash/common';
import { ClickhouseSqlBuilder } from './ClickhouseWarehouseClient';

describe('ClickhouseSqlBuilder', () => {
    let sqlBuilder: ClickhouseSqlBuilder;

    beforeEach(() => {
        sqlBuilder = new ClickhouseSqlBuilder();
    });

    describe('getMetricSql', () => {
        it('should return varSamp for VARIANCE metric type', () => {
            const varianceMetric: Metric = {
                fieldType: FieldType.METRIC,
                type: MetricType.VARIANCE,
                name: 'test_variance',
                label: 'Test Variance',
                table: 'test_table',
                tableLabel: 'Test Table',
                sql: '${TABLE}.column',
                hidden: false,
                groups: [],
            };
            expect(sqlBuilder.getMetricSql('column_name', varianceMetric)).toBe(
                'varSamp(column_name)',
            );
        });

        it('should return stddevSamp for STANDARD_DEVIATION metric type', () => {
            const standardDeviationMetric: Metric = {
                fieldType: FieldType.METRIC,
                type: MetricType.STANDARD_DEVIATION,
                name: 'test_stddev',
                label: 'Test Standard Deviation',
                table: 'test_table',
                tableLabel: 'Test Table',
                sql: '${TABLE}.column',
                hidden: false,
                groups: [],
            };
            expect(
                sqlBuilder.getMetricSql('column_name', standardDeviationMetric),
            ).toBe('stddevSamp(column_name)');
        });

        it('should return quantile for PERCENTILE metric type', () => {
            const percentileMetric: Metric = {
                fieldType: FieldType.METRIC,
                type: MetricType.PERCENTILE,
                percentile: 90,
                name: 'test_percentile',
                label: 'Test Percentile',
                table: 'test_table',
                tableLabel: 'Test Table',
                sql: '${TABLE}.column',
                hidden: false,
                groups: [],
            };
            expect(
                sqlBuilder.getMetricSql('column_name', percentileMetric),
            ).toBe('quantile(0.9)(column_name)');
        });

        it('should fall back to default for AVERAGE metric type', () => {
            const averageMetric: Metric = {
                fieldType: FieldType.METRIC,
                type: MetricType.AVERAGE,
                name: 'test_avg',
                label: 'Test Average',
                table: 'test_table',
                tableLabel: 'Test Table',
                sql: '${TABLE}.column',
                hidden: false,
                groups: [],
            };
            expect(sqlBuilder.getMetricSql('column_name', averageMetric)).toBe(
                'AVG(column_name)',
            );
        });

        it('should fall back to default for SUM metric type', () => {
            const sumMetric: Metric = {
                fieldType: FieldType.METRIC,
                type: MetricType.SUM,
                name: 'test_sum',
                label: 'Test Sum',
                table: 'test_table',
                tableLabel: 'Test Table',
                sql: '${TABLE}.column',
                hidden: false,
                groups: [],
            };
            expect(sqlBuilder.getMetricSql('column_name', sumMetric)).toBe(
                'SUM(column_name)',
            );
        });
    });
});
