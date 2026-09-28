import { describe, expect, it, vi } from 'vitest';
import Logger from '../logging/logger';
import { trackSafely } from './trackSafely';

describe('trackSafely', () => {
    it('does not let a tracking failure change the action outcome', () => {
        const error = new Error('tracking unavailable');
        const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => Logger);
        const track = vi.fn(() => {
            throw error;
        });

        expect(() => trackSafely(track)).not.toThrow();
        expect(track).toHaveBeenCalledOnce();
        expect(warn).toHaveBeenCalledWith('Failed to track analytics event', {
            error,
        });
        warn.mockRestore();
    });
});
