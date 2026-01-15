import { describe, expect, it, vi } from 'vitest';
import { saveQueryState } from '../saveQueryState';

describe('saveQueryState', () => {
    it('persists state via settings', async () => {
        const set = vi.fn();
        const saveAsync = vi.fn((callback: (result: { status: string }) => void) => {
            callback({ status: 'succeeded' });
        });

        await saveQueryState({ set, saveAsync }, 'queryState', {
            metrics: ['orders.total_revenue'],
        });

        expect(set).toHaveBeenCalledWith('queryState', {
            metrics: ['orders.total_revenue'],
        });
        expect(saveAsync).toHaveBeenCalledTimes(1);
    });
});
