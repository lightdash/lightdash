import type * as MantineHooks from '@mantine/hooks';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePopoverTransition } from './popoverMotion';

const mockReduced = vi.hoisted(() => ({ current: false }));
vi.mock('@mantine/hooks', async (importOriginal) => ({
    ...(await importOriginal<typeof MantineHooks>()),
    useReducedMotion: () => mockReduced.current,
}));

describe('usePopoverTransition', () => {
    it('fades in from 4px up at the default duration, and takes no time under reduced motion', () => {
        mockReduced.current = false;
        const { result, rerender } = renderHook(() => usePopoverTransition());
        expect(result.current).not.toHaveProperty('duration');
        expect(result.current?.transition).toMatchObject({
            out: { opacity: 0, transform: 'translateY(-4px)' },
            in: { opacity: 1, transform: 'translateY(0)' },
        });

        mockReduced.current = true;
        rerender();
        expect(result.current?.duration).toBe(0);
    });
});
