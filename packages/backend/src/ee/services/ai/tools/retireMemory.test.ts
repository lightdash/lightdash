import { describe, expect, it, vi } from 'vitest';
import { getRetireMemory } from './retireMemory';

describe('retireMemory tool', () => {
    it('confirms the retired title and slug and mentions reactivation', async () => {
        const retireMemory = vi.fn().mockResolvedValue({
            slug: 'net-revenue-ab12cd34',
            title: 'Use net revenue',
        });
        const tool = getRetireMemory({ retireMemory });

        const output = await tool.execute!(
            { slug: 'net-revenue-ab12cd34' },
            { toolCallId: 'call-1', messages: [] },
        );

        expect(retireMemory).toHaveBeenCalledWith({
            slug: 'net-revenue-ab12cd34',
        });
        expect(output).toMatchObject({
            result: expect.stringContaining(
                'Retired memory "Use net revenue" (net-revenue-ab12cd34)',
            ),
            metadata: {
                status: 'success',
                slug: 'net-revenue-ab12cd34',
                title: 'Use net revenue',
            },
        });
        expect(output).toMatchObject({
            result: expect.stringContaining('reactivate'),
        });
    });
});
