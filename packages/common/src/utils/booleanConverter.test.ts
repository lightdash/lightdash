import { convertToBooleanValue } from './booleanConverter';

describe('convertToBooleanValue', () => {
    describe('Native boolean values', () => {
        it('should return true for boolean true', () => {
            expect(convertToBooleanValue(true)).toBe(true);
        });

        it('should return false for boolean false', () => {
            expect(convertToBooleanValue(false)).toBe(false);
        });
    });

    describe('String boolean representations', () => {
        it('should return false for string "false"', () => {
            expect(convertToBooleanValue('false')).toBe(false);
        });

        it('should return true for string "true"', () => {
            expect(convertToBooleanValue('true')).toBe(true);
        });

        it('should handle case insensitive strings', () => {
            expect(convertToBooleanValue('FALSE')).toBe(false);
            expect(convertToBooleanValue('TRUE')).toBe(true);
            expect(convertToBooleanValue('False')).toBe(false);
            expect(convertToBooleanValue('True')).toBe(true);
        });

        it('should handle whitespace around boolean strings', () => {
            expect(convertToBooleanValue(' false ')).toBe(false);
            expect(convertToBooleanValue(' true ')).toBe(true);
            expect(convertToBooleanValue('\tfalse\t')).toBe(false);
            expect(convertToBooleanValue('\ttrue\t')).toBe(true);
        });
    });

    describe('Fallback behavior for non-boolean types', () => {
        it('should use !! conversion for non-boolean strings', () => {
            expect(convertToBooleanValue('hello')).toBe(true);
            expect(convertToBooleanValue('')).toBe(false);
            expect(convertToBooleanValue('0')).toBe(true);
            expect(convertToBooleanValue('1')).toBe(true);
        });

        it('should use !! conversion for numbers', () => {
            expect(convertToBooleanValue(0)).toBe(false);
            expect(convertToBooleanValue(1)).toBe(true);
            expect(convertToBooleanValue(-1)).toBe(true);
        });

        it('should use !! conversion for objects', () => {
            expect(convertToBooleanValue({})).toBe(true);
            expect(convertToBooleanValue([])).toBe(true);
            expect(convertToBooleanValue(null)).toBe(false);
            expect(convertToBooleanValue(undefined)).toBe(false);
        });
    });

    describe('Edge cases', () => {
        it('should handle empty string', () => {
            expect(convertToBooleanValue('')).toBe(false);
        });

        it('should handle whitespace-only strings', () => {
            expect(convertToBooleanValue('   ')).toBe(true); // Non-empty string, so truthy
        });
    });
});
