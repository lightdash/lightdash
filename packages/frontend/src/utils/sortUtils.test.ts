import type { Field } from '@lightdash/common';
import { FieldType, MetricType } from '@lightdash/common';
import { getSortLabel, SortDirection } from './sortUtils';

describe('getSortLabel', () => {
    describe('VARIANCE metric type', () => {
        it('should return numeric sort label for ascending direction', () => {
            const varianceMetric: Field = {
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
            expect(getSortLabel(varianceMetric, SortDirection.ASC)).toBe('1-9');
        });

        it('should return numeric sort label for descending direction', () => {
            const varianceMetric: Field = {
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
            expect(getSortLabel(varianceMetric, SortDirection.DESC)).toBe(
                '9-1',
            );
        });
    });

    describe('STANDARD_DEVIATION metric type', () => {
        it('should return numeric sort label for ascending direction', () => {
            const standardDeviationMetric: Field = {
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
            expect(
                getSortLabel(standardDeviationMetric, SortDirection.ASC),
            ).toBe('1-9');
        });

        it('should return numeric sort label for descending direction', () => {
            const standardDeviationMetric: Field = {
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
            expect(
                getSortLabel(standardDeviationMetric, SortDirection.DESC),
            ).toBe('9-1');
        });
    });
});
