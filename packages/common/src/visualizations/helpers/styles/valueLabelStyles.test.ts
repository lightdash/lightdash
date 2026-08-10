import { CartesianSeriesType } from '../../../types/savedCharts';
import { getValueLabelStyle } from './valueLabelStyles';

describe('getValueLabelStyle', () => {
    test.each(['inside', 'insideTop', 'insideRight'] as const)(
        'gives %s bar labels a readable color on the bar',
        (position) => {
            expect(
                getValueLabelStyle(
                    position,
                    CartesianSeriesType.BAR,
                    '#000000',
                ),
            ).toEqual(
                expect.objectContaining({
                    backgroundColor: '#000000',
                    color: expect.any(String),
                }),
            );
        },
    );

    test('leaves labels outside the bar on the default foreground color', () => {
        expect(
            getValueLabelStyle('top', CartesianSeriesType.BAR, '#000000'),
        ).not.toHaveProperty('backgroundColor');
    });
});
