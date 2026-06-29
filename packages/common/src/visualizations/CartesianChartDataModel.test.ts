import { Format } from '../types/field';
import { CartesianChartDataModel } from './CartesianChartDataModel';

describe('CartesianChartDataModel formatters', () => {
    test('formats SI tooltip values dynamically', () => {
        const formatter = CartesianChartDataModel.getTooltipFormatter(
            Format.SI,
        );

        expect(formatter?.(999)).toEqual('999');
        expect(formatter?.(1200)).toEqual('1.2K');
        expect(formatter?.(1200000)).toEqual('1.2M');
    });

    test('formats SI value labels dynamically', () => {
        const formatter = CartesianChartDataModel.getValueFormatter(Format.SI);

        expect(
            formatter?.({
                dimensionNames: ['category', 'value'],
                encode: { y: [1] },
                value: { category: 'Jan', value: 1200000 },
            }),
        ).toEqual('1.2M');
    });
});
