import {
    cleanColorArray,
    getGradientColor,
    getInvalidHexColors,
    interpolateMultiColor,
    isHexCodeColor,
} from './colors';

describe('isHexCodeColor', () => {
    it('should return true for valid 3-digit hex colors', () => {
        const validColors = ['#123', '#abc', '#ABC', '#f00', '#0F0', '#00f'];

        validColors.forEach((color) => {
            expect(isHexCodeColor(color)).toBe(true);
        });
    });

    it('should return true for valid 6-digit hex colors', () => {
        const validColors = [
            '#123456',
            '#abcdef',
            '#ABCDEF',
            '#ff0000',
            '#00FF00',
            '#0000ff',
        ];

        validColors.forEach((color) => {
            expect(isHexCodeColor(color)).toBe(true);
        });
    });

    it('should return false for invalid hex colors', () => {
        const invalidColors = [
            'red', // named color
            '#1234', // 4 digits
            '#12345', // 5 digits
            '#1234567', // 7 digits
            '123456', // missing #
            '#12345g', // invalid character
            '#GHIJKL', // invalid characters
            'rgb(255,0,0)', // rgb format
            'rgba(255,0,0,0.5)', // rgba format
            '#', // just the hash
            '', // empty string
            ' #123456', // leading space
            '#123456 ', // trailing space
        ];

        invalidColors.forEach((color) => {
            expect(isHexCodeColor(color)).toBe(false);
        });
    });
});

describe('getInvalidHexColors', () => {
    it('should return an empty array when all colors are valid', () => {
        const validColors = ['#123', '#456789', '#abc', '#def012'];

        expect(getInvalidHexColors(validColors)).toEqual([]);
    });

    it('should return an array of invalid colors', () => {
        const mixedColors = ['#123', 'red', '#456789', '#12', 'blue'];
        const expectedInvalidColors = ['red', '#12', 'blue'];

        expect(getInvalidHexColors(mixedColors)).toEqual(expectedInvalidColors);
    });

    it('should return all colors when all are invalid', () => {
        const invalidColors = ['red', 'green', 'blue'];

        expect(getInvalidHexColors(invalidColors)).toEqual(invalidColors);
    });

    it('should handle an empty array', () => {
        expect(getInvalidHexColors([])).toEqual([]);
    });
});

describe('cleanColorArray', () => {
    it('should trim whitespace from color strings', () => {
        const colorsWithWhitespace = [' #123 ', '  #456789', '#abc  '];
        const expectedCleanedColors = ['#123', '#456789', '#abc'];

        expect(cleanColorArray(colorsWithWhitespace)).toEqual(
            expectedCleanedColors,
        );
    });

    it('should filter out empty strings', () => {
        const colorsWithEmpty = ['#123', '', '  ', '#456789'];
        const expectedCleanedColors = ['#123', '#456789'];

        expect(cleanColorArray(colorsWithEmpty)).toEqual(expectedCleanedColors);
    });

    it('should handle an array with only empty strings', () => {
        const onlyEmptyStrings = ['', '  ', '   '];

        expect(cleanColorArray(onlyEmptyStrings)).toEqual([]);
    });

    it('should handle an empty array', () => {
        expect(cleanColorArray([])).toEqual([]);
    });

    it('should preserve invalid hex colors (validation is not its responsibility)', () => {
        const mixedColors = [' #123 ', 'red', '  #456789', 'blue  '];
        const expectedCleanedColors = ['#123', 'red', '#456789', 'blue'];

        expect(cleanColorArray(mixedColors)).toEqual(expectedCleanedColors);
    });
});

describe('getGradientColor', () => {
    const gradient = {
        colors: ['#000000', '#ff0000', '#ffffff'],
        min: 0,
        max: 10,
    };

    it('maps the bounds and the middle to the stops', () => {
        expect(getGradientColor(gradient, 0)).toBe('#000000');
        expect(getGradientColor(gradient, 5)).toBe('#ff0000');
        expect(getGradientColor(gradient, 10)).toBe('#ffffff');
    });

    it('interpolates in oklab like the map chart scale', () => {
        expect(getGradientColor(gradient, 2.5)).toBe('#630000');
        expect(interpolateMultiColor(gradient.colors, 0.25)).toBe(
            'oklab(31.398% 0.11243 0.06292)',
        );
    });

    it('parses finite numeric strings', () => {
        expect(getGradientColor(gradient, '5')).toBe('#ff0000');
    });

    it('clamps values outside the range to the end colours', () => {
        expect(getGradientColor(gradient, -3)).toBe('#000000');
        expect(getGradientColor(gradient, 42)).toBe('#ffffff');
    });

    it.each([null, undefined, '', 'abc', NaN, Infinity, true, {}])(
        'returns null for %s',
        (value) => {
            expect(getGradientColor(gradient, value)).toBeNull();
        },
    );

    it('uses the last colour when min equals max', () => {
        expect(getGradientColor({ ...gradient, min: 3, max: 3 }, 1)).toBe(
            '#ffffff',
        );
    });

    it.each([NaN, Infinity, -Infinity])(
        'returns null for a %s bound',
        (bound) => {
            expect(getGradientColor({ ...gradient, min: bound }, 5)).toBeNull();
            expect(getGradientColor({ ...gradient, max: bound }, 5)).toBeNull();
        },
    );

    it('returns null when min is above max', () => {
        expect(
            getGradientColor({ ...gradient, min: 10, max: 0 }, 5),
        ).toBeNull();
    });
});
