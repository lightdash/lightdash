import { describe, expect, it } from 'vitest';
import { formatElapsed, getWritebackStepIndex } from './writebackProgress';

describe('writeback progress', () => {
    it('maps run stages onto the steps a person sees', () => {
        expect(getWritebackStepIndex('pending')).toBe(0);
        expect(getWritebackStepIndex('clone')).toBe(1);
        expect(getWritebackStepIndex('agent')).toBe(2);
        expect(getWritebackStepIndex('push')).toBe(3);
    });

    it('formats elapsed time as minutes and seconds', () => {
        expect(formatElapsed(0)).toBe('0:00');
        expect(formatElapsed(84_500)).toBe('1:24');
        expect(formatElapsed(-5)).toBe('0:00');
    });
});
