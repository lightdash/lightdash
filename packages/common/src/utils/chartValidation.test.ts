import { FilterOperator } from '../types/filter';
import { ChartType } from '../types/savedCharts';
import { getUnusedTableCalculations } from './chartValidation';

describe('getUnusedTableCalculations', () => {
    it('does not mark table calculations used by table calculation filters as unused', () => {
        const result = getUnusedTableCalculations({
            chartType: ChartType.CARTESIAN,
            chartConfig: {
                layout: {
                    xField: 'orders_created_week',
                    yField: ['running_total'],
                },
                eChartsConfig: {},
            },
            queryTableCalculations: ['running_total', 'after_date'],
            tableCalculationFilters: {
                id: 'table-calculation-filters',
                and: [
                    {
                        id: 'after-date-filter',
                        target: { fieldId: 'after_date' },
                        operator: FilterOperator.EQUALS,
                        values: [true],
                    },
                ],
            },
        });

        expect(result.unusedTableCalculations).toEqual([]);
    });

    it('marks table calculations unused when they are not on axes or in filters', () => {
        const result = getUnusedTableCalculations({
            chartType: ChartType.CARTESIAN,
            chartConfig: {
                layout: {
                    xField: 'orders_created_week',
                    yField: ['running_total'],
                },
                eChartsConfig: {},
            },
            queryTableCalculations: ['running_total', 'helper_calc'],
        });

        expect(result.unusedTableCalculations).toEqual(['helper_calc']);
    });
});
