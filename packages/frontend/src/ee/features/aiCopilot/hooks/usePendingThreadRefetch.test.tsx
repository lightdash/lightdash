import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePendingThreadRefetch } from './usePendingThreadRefetch';

vi.mock('../streaming/useAiAgentThreadStreamQuery', () => ({
    useAiAgentThreadStreaming: () => false,
}));

const pendingThread = (createdAt: Date | string) =>
    ({
        messages: [
            {
                role: 'assistant',
                status: 'idle',
                toolResults: [
                    {
                        toolType: 'built-in',
                        toolName: 'editDbtProject',
                        metadata: {
                            status: 'pending',
                            aiWritebackRunUuid: 'run-1',
                        },
                        createdAt,
                    },
                ],
            },
        ],
    }) as Parameters<typeof usePendingThreadRefetch>[0];

describe('usePendingThreadRefetch', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('does not keep a thread pending for a stale writeback result', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-11T12:10:00.000Z'));

        const { result } = renderHook(() =>
            usePendingThreadRefetch(
                pendingThread('2026-08-11T12:04:59.999Z'),
                'thread-1',
                vi.fn(),
            ),
        );

        expect(result.current.isPending).toBe(false);
    });

    it('refetches once more before expiring an active writeback', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-11T12:00:00.000Z'));
        const refetch = vi.fn(() => new Promise<never>(() => undefined));

        const { result } = renderHook(() =>
            usePendingThreadRefetch(
                pendingThread('2026-08-11T12:00:00.001Z'),
                'thread-1',
                refetch,
            ),
        );

        expect(result.current.isPending).toBe(true);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
        });
        expect(result.current.isPending).toBe(true);
        refetch.mockClear();

        await act(async () => {
            await vi.advanceTimersByTimeAsync(1);
        });

        expect(refetch).toHaveBeenCalledTimes(1);
        expect(result.current.isPending).toBe(false);
    });
});
