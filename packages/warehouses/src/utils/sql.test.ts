import { MetricType } from '@lightdash/common';
import { getDefaultMetricSql } from './sql';

describe('getDefaultMetricSql', () => {
    it('should generate VARIANCE SQL correctly', () => {
        expect(getDefaultMetricSql('column_name', MetricType.VARIANCE)).toEqual(
            'VARIANCE(column_name)',
        );
    });

    it('should generate STANDARD_DEVIATION SQL correctly', () => {
        expect(
            getDefaultMetricSql('column_name', MetricType.STANDARD_DEVIATION),
        ).toEqual('STDDEV(column_name)');
    });

    it('should generate VARIANCE SQL with table-qualified column', () => {
        expect(
            getDefaultMetricSql('table.column_name', MetricType.VARIANCE),
        ).toEqual('VARIANCE(table.column_name)');
    });

    it('should generate STANDARD_DEVIATION SQL with table-qualified column', () => {
        expect(
            getDefaultMetricSql(
                'table.column_name',
                MetricType.STANDARD_DEVIATION,
            ),
        ).toEqual('STDDEV(table.column_name)');
    });

    it('should generate existing metric SQL correctly', () => {
        expect(getDefaultMetricSql('column_name', MetricType.AVERAGE)).toEqual(
            'AVG(column_name)',
        );
        expect(getDefaultMetricSql('column_name', MetricType.SUM)).toEqual(
            'SUM(column_name)',
        );
        expect(getDefaultMetricSql('column_name', MetricType.COUNT)).toEqual(
            'COUNT(column_name)',
        );
        expect(getDefaultMetricSql('column_name', MetricType.MIN)).toEqual(
            'MIN(column_name)',
        );
        expect(getDefaultMetricSql('column_name', MetricType.MAX)).toEqual(
            'MAX(column_name)',
        );
    });

    it('should return sql as-is for non-aggregate metrics', () => {
        expect(getDefaultMetricSql('column_name', MetricType.NUMBER)).toEqual(
            'column_name',
        );
        expect(getDefaultMetricSql('column_name', MetricType.STRING)).toEqual(
            'column_name',
        );
        expect(getDefaultMetricSql('column_name', MetricType.DATE)).toEqual(
            'column_name',
        );
        expect(getDefaultMetricSql('column_name', MetricType.BOOLEAN)).toEqual(
            'column_name',
        );
    });
});
