import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useBattleFollowUpQueue } from './useBattleFollowUpQueue';

const deferred = () => {
    let resolve: () => void = () => undefined;
    const promise = new Promise<void>((res) => {
        resolve = res;
    });
    return { promise, resolve };
};

describe('useBattleFollowUpQueue', () => {
    it('sends immediately when the side is idle', async () => {
        const send = vi.fn().mockResolvedValue(undefined);
        const { result } = renderHook(() =>
            useBattleFollowUpQueue<string>(false, send),
        );

        act(() => result.current.enqueue('first'));

        await waitFor(() => expect(send).toHaveBeenCalledWith('first'));
        expect(result.current.queuedCount).toBe(0);
    });

    it('accepts many follow-ups while busy and drains them in order', async () => {
        const sent: string[] = [];
        const inFlight: Array<() => void> = [];
        const send = vi.fn((input: string) => {
            sent.push(input);
            const { promise, resolve } = deferred();
            inFlight.push(resolve);
            return promise;
        });
        const { result, rerender } = renderHook(
            ({ busy }) => useBattleFollowUpQueue<string>(busy, send),
            { initialProps: { busy: true } },
        );

        act(() => {
            result.current.enqueue('one');
            result.current.enqueue('two');
            result.current.enqueue('three');
        });
        expect(result.current.queuedCount).toBe(3);
        expect(send).not.toHaveBeenCalled();

        rerender({ busy: false });
        await waitFor(() => expect(sent).toEqual(['one']));
        expect(result.current.queuedCount).toBe(2);

        await act(async () => inFlight[0]());
        await waitFor(() => expect(sent).toEqual(['one', 'two']));

        await act(async () => inFlight[1]());
        await waitFor(() => expect(sent).toEqual(['one', 'two', 'three']));
        expect(result.current.queuedCount).toBe(0);
    });

    it('keeps draining after a failed send', async () => {
        const send = vi
            .fn()
            .mockRejectedValueOnce(new Error('boom'))
            .mockResolvedValue(undefined);
        const { result } = renderHook(() =>
            useBattleFollowUpQueue<string>(false, send),
        );

        act(() => {
            result.current.enqueue('fails');
            result.current.enqueue('succeeds');
        });

        await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
        expect(send).toHaveBeenLastCalledWith('succeeds');
    });
});
