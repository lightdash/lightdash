import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useBoundedHold } from './useBoundedHold';

describe('useBoundedHold', () => {
    it('holds while waiting, then releases after the max wait', async () => {
        const { result } = renderHook(() => useBoundedHold(true, 'a', 20));

        expect(result.current).toBe(true);
        await waitFor(() => expect(result.current).toBe(false));
    });

    it('releases as soon as waiting stops', () => {
        const { result, rerender } = renderHook(
            ({ isWaiting }) => useBoundedHold(isWaiting, 'a', 10_000),
            { initialProps: { isWaiting: true } },
        );

        rerender({ isWaiting: false });

        expect(result.current).toBe(false);
    });

    it('holds again for a new key after an earlier key expired', async () => {
        const { result, rerender } = renderHook(
            ({ holdKey }) => useBoundedHold(true, holdKey, 20),
            { initialProps: { holdKey: 'a' } },
        );
        await waitFor(() => expect(result.current).toBe(false));

        rerender({ holdKey: 'b' });

        expect(result.current).toBe(true);
    });

    it('never holds without a key', () => {
        const { result } = renderHook(() =>
            useBoundedHold(true, undefined, 10_000),
        );

        expect(result.current).toBe(false);
    });
});
