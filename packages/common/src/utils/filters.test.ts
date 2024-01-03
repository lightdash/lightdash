import { ConditionalOperator } from '../types/conditionalRule';
import { overrideChartFilter } from './filters';
import {
    chartAndFilterGroup,
    chartOrFilterGroup,
    dashboardFilterWithSameTargetAndOperator,
    dashboardFilterWithSameTargetButDifferentOperator,
} from './filters.mock';

describe('overrideChartFilter', () => {
    test('should override the chart and group filter', async () => {
        const result = overrideChartFilter(
            chartAndFilterGroup,
            dashboardFilterWithSameTargetAndOperator,
        );
        expect(result).toEqual({
            id: 'fillter-group-1',
            and: [
                {
                    id: '1',
                    target: { fieldId: 'field-1' },
                    values: ['1', '2', '3'],
                    disabled: false,
                    operator: ConditionalOperator.EQUALS,
                },
                {
                    id: '2',
                    target: { fieldId: 'field-2' },
                    values: ['2'],
                    disabled: false,
                    operator: ConditionalOperator.EQUALS,
                },
            ],
        });
    });

    test('should override the chart or group filter', async () => {
        const result = overrideChartFilter(
            chartOrFilterGroup,
            dashboardFilterWithSameTargetAndOperator,
        );
        expect(result).toEqual({
            id: 'fillter-group-1',
            or: [
                {
                    id: '3',
                    target: { fieldId: 'field-1' },
                    values: ['1', '2', '3'],
                    disabled: false,
                    operator: ConditionalOperator.EQUALS,
                },
                {
                    id: '4',
                    target: { fieldId: 'field-2' },
                    values: ['2'],
                    disabled: false,
                    operator: ConditionalOperator.EQUALS,
                },
            ],
        });
    });

    test('should not override the chart group filter when operator is different', async () => {
        const result = overrideChartFilter(
            chartAndFilterGroup,
            dashboardFilterWithSameTargetButDifferentOperator,
        );
        expect(result).toEqual({
            id: 'fillter-group-1',
            and: [
                {
                    id: '1',
                    target: { fieldId: 'field-1' },
                    values: ['1'],
                    disabled: false,
                    operator: ConditionalOperator.EQUALS,
                },
                {
                    id: '2',
                    target: { fieldId: 'field-2' },
                    values: ['2'],
                    disabled: false,
                    operator: ConditionalOperator.EQUALS,
                },
            ],
        });
    });
});
