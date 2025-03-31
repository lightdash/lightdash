import { UnexpectedIndexError } from '../types/errors';
import { getArrayValue, getObjectValue, hasProperty } from './accessors';

describe('getArrayValue', () => {
    it('should return the correct value for a valid index', () => {
        const array = [1, 2, 3];
        expect(getArrayValue(array, 1)).toBe(2);
    });

    it('should throw an error for an undefined array', () => {
        expect(() => getArrayValue(undefined, 1)).toThrow(UnexpectedIndexError);
    });

    it('should throw an error for an out-of-bounds index', () => {
        const array = [1, 2, 3];
        expect(() => getArrayValue(array, 5)).toThrow(UnexpectedIndexError);
    });
});

describe('getObjectValue', () => {
    it('should return the correct value for a valid key', () => {
        const obj = { a: 1, b: 2 };
        expect(getObjectValue(obj, 'b')).toBe(2);
    });

    it('should throw an error for an undefined object', () => {
        expect(() => getObjectValue(undefined, 'a')).toThrow(
            UnexpectedIndexError,
        );
    });

    it('should throw an error for a non-existent key', () => {
        const obj = { a: 1, b: 2 };
        expect(() => getObjectValue(obj, 'c')).toThrow(UnexpectedIndexError);
    });
});

describe('hasProperty', () => {
    it('should return true if the object has the property', () => {
        const obj = { scope: 'value' };
        expect(hasProperty(obj, 'scope')).toBe(true);
    });

    it('should return false if the object does not have the property', () => {
        const obj = { other: 'value' };
        expect(hasProperty(obj, 'scope')).toBe(false);
    });

    it('should return false for non-object types', () => {
        expect(hasProperty(null, 'scope')).toBe(false);
        expect(hasProperty(undefined, 'scope')).toBe(false);
        expect(hasProperty(42, 'scope')).toBe(false);
        expect(hasProperty('string', 'scope')).toBe(false);
    });
});
