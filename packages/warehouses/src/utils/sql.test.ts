import { MetricType } from '@lightdash/common';
import { getDefaultMetricSql } from './sql';

describe('getDefaultMetricSql', () => {
    describe('VARIANCE metric type', () => {
        it('should return VARIANCE SQL for simple column name', () => {
            expect(
                getDefaultMetricSql('column_name', MetricType.VARIANCE),
            ).toBe('VARIANCE(column_name)');
        });

        it('should return VARIANCE SQL for table.column format', () => {
            expect(
                getDefaultMetricSql('table.column', MetricType.VARIANCE),
            ).toBe('VARIANCE(table.column)');
        });

        it('should return VARIANCE SQL for wrapped SQL expression', () => {
            expect(
                getDefaultMetricSql('(table.column)', MetricType.VARIANCE),
            ).toBe('VARIANCE((table.column))');
        });

        it('should return VARIANCE SQL for complex SQL expression', () => {
            expect(
                getDefaultMetricSql(
                    'SUM(table.column) / COUNT(*)',
                    MetricType.VARIANCE,
                ),
            ).toBe('VARIANCE(SUM(table.column) / COUNT(*))');
        });
    });

    describe('STANDARD_DEVIATION metric type', () => {
        it('should return STDDEV SQL for simple column name', () => {
            expect(
                getDefaultMetricSql(
                    'column_name',
                    MetricType.STANDARD_DEVIATION,
                ),
            ).toBe('STDDEV(column_name)');
        });

        it('should return STDDEV SQL for table.column format', () => {
            expect(
                getDefaultMetricSql(
                    'table.column',
                    MetricType.STANDARD_DEVIATION,
                ),
            ).toBe('STDDEV(table.column)');
        });

        it('should return STDDEV SQL for wrapped SQL expression', () => {
            expect(
                getDefaultMetricSql(
                    '(table.column)',
                    MetricType.STANDARD_DEVIATION,
                ),
            ).toBe('STDDEV((table.column))');
        });

        it('should return STDDEV SQL for complex SQL expression', () => {
            expect(
                getDefaultMetricSql(
                    'SUM(table.column) / COUNT(*)',
                    MetricType.STANDARD_DEVIATION,
                ),
            ).toBe('STDDEV(SUM(table.column) / COUNT(*))');
        });
    });

    describe('other metric types', () => {
        it('should return AVG SQL for AVERAGE type', () => {
            expect(getDefaultMetricSql('column', MetricType.AVERAGE)).toBe(
                'AVG(column)',
            );
        });

        it('should return SUM SQL for SUM type', () => {
            expect(getDefaultMetricSql('column', MetricType.SUM)).toBe(
                'SUM(column)',
            );
        });
    });
});
