import {
    cleanColorArray,
    getColorFromRange,
    getInvalidHexColors,
    isHexCodeColor,
} from './colors';

const colorRange = { start: '#fff', end: '#000000' };

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

describe('getColorFromRange', () => {
    it('should interpolate a color for a value within the range', () => {
        expect(
            getColorFromRange(50, colorRange, { min: 0, max: 100 }),
        ).toBe('#808080');
    });

    it('should return the start color for the min value', () => {
        expect(getColorFromRange(0, colorRange, { min: 0, max: 100 })).toBe(
            '#fff',
        );
    });

    it('should return the end color for the max value', () => {
        expect(getColorFromRange(100, colorRange, { min: 0, max: 100 })).toBe(
            '#000',
        );
    });

    it('should saturate to the end color for values above the max', () => {
        expect(getColorFromRange(400, colorRange, { min: 0, max: 100 })).toBe(
            '#000',
        );
    });

    it('should saturate to the start color for values below the min', () => {
        expect(getColorFromRange(0, colorRange, { min: 10, max: 100 })).toBe(
            '#fff',
        );
    });

    it('should return undefined when min is greater than max', () => {
        expect(
            getColorFromRange(50, colorRange, { min: 100, max: 0 }),
        ).toBeUndefined();
    });

    it('should return the end color when min equals max', () => {
        expect(getColorFromRange(50, colorRange, { min: 50, max: 50 })).toBe(
            '#000',
        );
    });

    it('should return the start color for values below a min that equals max', () => {
        expect(getColorFromRange(10, colorRange, { min: 50, max: 50 })).toBe(
            '#fff',
        );
    });

    it('should return undefined for invalid color range', () => {
        expect(
            getColorFromRange(50, { start: 'red', end: '#000000' }, {
                min: 0,
                max: 100,
            }),
        ).toBeUndefined();
    });
});
