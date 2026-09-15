import {
    getPieExternalLabelStyle,
    getPieInternalLabelStyle,
} from './pieChartStyles';

describe('pie chart value label colors', () => {
    test.each([
        ['#00171f', 'white'],
        ['#ffe31a', 'black'],
    ] as const)(
        'uses readable contrast for an inside label on %s',
        (sliceColor, expectedLabelColor) => {
            expect(getPieInternalLabelStyle(sliceColor)).toEqual(
                expect.objectContaining({ color: expectedLabelColor }),
            );
        },
    );

    test('uses the slice color for all parts of an outside label', () => {
        expect(getPieExternalLabelStyle('#123456')).toEqual(
            expect.objectContaining({
                rich: {
                    name: expect.objectContaining({ color: '#123456' }),
                    value: expect.objectContaining({ color: '#123456' }),
                },
            }),
        );
    });

    test('allows the inside automatic color to be overridden', () => {
        expect(getPieInternalLabelStyle('#00171f', '#ff00ff')).toEqual(
            expect.objectContaining({ color: '#ff00ff' }),
        );
    });

    test('allows the outside automatic color to be overridden', () => {
        expect(getPieExternalLabelStyle('#ff00ff')).toEqual(
            expect.objectContaining({
                rich: {
                    name: expect.objectContaining({ color: '#ff00ff' }),
                    value: expect.objectContaining({ color: '#ff00ff' }),
                },
            }),
        );
    });
});
