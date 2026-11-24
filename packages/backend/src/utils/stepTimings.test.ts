import { afterEach, describe, expect, it, vi } from 'vitest';
import { startStepTimings } from './stepTimings';

describe('startStepTimings', () => {
    afterEach(() => vi.restoreAllMocks());

    it('records each step since the previous mark, adds repeats, and totals', () => {
        const now = vi.spyOn(performance, 'now');
        now.mockReturnValue(1000);
        const timings = startStepTimings();
        now.mockReturnValue(1100.4);
        timings.mark('checkout');
        now.mockReturnValue(1400);
        timings.mark('check');
        now.mockReturnValue(1450);
        timings.mark('checkout');
        now.mockReturnValue(1500);
        expect(timings.summary()).toEqual({
            checkoutMs: 150,
            checkMs: 300,
            totalMs: 500,
        });
    });
});
