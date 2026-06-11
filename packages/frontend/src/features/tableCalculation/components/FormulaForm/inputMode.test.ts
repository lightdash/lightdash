import { describe, expect, it } from 'vitest';
import { getInputMode } from './inputMode';

describe('getInputMode', () => {
    it('returns empty for empty string', () => {
        expect(getInputMode('')).toBe('empty');
    });

    it('returns empty for whitespace only', () => {
        expect(getInputMode('   \n\t')).toBe('empty');
    });

    it('returns formula when first non-whitespace char is =', () => {
        expect(getInputMode('=SUM(1,2)')).toBe('formula');
        expect(getInputMode('   =SUM(1,2)')).toBe('formula');
        expect(getInputMode('=')).toBe('formula');
    });

    it('returns prompt when first non-whitespace char is anything else', () => {
        expect(getInputMode('sum paid orders')).toBe('prompt');
        expect(getInputMode('SUM(1,2)')).toBe('prompt');
        expect(getInputMode('@orders')).toBe('prompt');
        expect(getInputMode('123')).toBe('prompt');
    });
});
