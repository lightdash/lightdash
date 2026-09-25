import { describe, expect, it } from 'vitest';
import { SCOPE_TOURS } from './generated';
import { tourFor } from './tourFor';

describe('tourFor', () => {
    it('answers a generated tour by its scope name', () => {
        const [scope] = Object.keys(SCOPE_TOURS);
        expect(tourFor(scope)).toBe(SCOPE_TOURS[scope]);
    });
    it('answers nothing for names that only exist on Object.prototype', () => {
        expect(tourFor('constructor')).toBeUndefined();
        expect(tourFor('toString')).toBeUndefined();
        expect(tourFor('hasOwnProperty')).toBeUndefined();
        expect(tourFor('__proto__')).toBeUndefined();
    });
    it('answers nothing for an empty or missing name', () => {
        expect(tourFor('')).toBeUndefined();
        expect(tourFor(null)).toBeUndefined();
        expect(tourFor(undefined)).toBeUndefined();
    });
});
