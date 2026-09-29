import { describe, expect, it, vi } from 'vitest';
import { createApiTransport } from './apiTransport';

describe('subtotal transport', () => {
    it('posts the expansion intent to the host route and returns rows directly', async () => {
        const rows = [{ region: { value: { raw: 'EU', formatted: 'EU' } } }];
        const adapter = vi.fn().mockResolvedValue({ rows });
        const transport = createApiTransport(
            { apiKey: '', baseUrl: '', projectUuid: 'project-1' },
            adapter,
        );
        const request = { level: 1, parentValues: ['Europe'] };

        await expect(transport.getVizSubtotals?.(request)).resolves.toEqual({
            rows,
        });
        expect(adapter).toHaveBeenCalledWith(
            'POST',
            '/__sdk/viz/subtotals',
            request,
        );
        expect(adapter).toHaveBeenCalledTimes(1);
    });
});
