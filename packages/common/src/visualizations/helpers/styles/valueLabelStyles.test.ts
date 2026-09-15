import { CartesianSeriesType } from '../../../types/savedCharts';
import { getValueLabelStyle } from './valueLabelStyles';

describe('getValueLabelStyle', () => {
    test.each([
        ['inside', '#00171f', 'white'],
        ['insideTop', '#ffe31a', 'black'],
        ['insideRight', '#00171f', 'white'],
    ] as const)(
        'gives %s bar labels a readable color on the bar',
        (position, seriesColor, expectedLabelColor) => {
            expect(
                getValueLabelStyle(
                    position,
                    CartesianSeriesType.BAR,
                    seriesColor,
                ),
            ).toEqual(expect.objectContaining({ color: expectedLabelColor }));
        },
    );

    test.each(Object.values(CartesianSeriesType))(
        'uses the series color for %s labels outside the chart mark',
        (type) => {
            expect(getValueLabelStyle('top', type, '#123456')).toEqual(
                expect.objectContaining({
                    color: '#123456',
                }),
            );
        },
    );

    test.each([CartesianSeriesType.LINE, CartesianSeriesType.AREA])(
        'uses the series color for %s labels inside the chart mark',
        (type) => {
            expect(getValueLabelStyle('inside', type, '#123456')).toEqual(
                expect.objectContaining({
                    color: '#123456',
                }),
            );
        },
    );

    test('allows the automatic label color to be overridden', () => {
        expect(
            getValueLabelStyle(
                'inside',
                CartesianSeriesType.BAR,
                '#00171f',
                '#ff00ff',
            ),
        ).toEqual(
            expect.objectContaining({
                color: '#ff00ff',
            }),
        );
    });

    test('preserves the existing bar label background styling', () => {
        expect(
            getValueLabelStyle('inside', CartesianSeriesType.BAR, '#00171f'),
        ).toEqual({
            fontSize: 10,
            fontWeight: '400',
            color: 'white',
            backgroundColor: '#00171f',
            borderRadius: 4,
            padding: [1, 2],
        });
    });
});
