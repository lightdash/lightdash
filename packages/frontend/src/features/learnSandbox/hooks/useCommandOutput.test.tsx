import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../../api';
import { useCommandOutput } from './useCommandOutput';

vi.mock('../../../api', () => ({ lightdashApi: vi.fn() }));

describe('useCommandOutput', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('accumulates chunks with an after cursor and stops when done', async () => {
        vi.useFakeTimers();
        const api = vi.mocked(lightdashApi);
        api.mockResolvedValueOnce({
            commandUuid: 'c',
            status: 'running',
            exitCode: null,
            argv: ['dbt', 'parse'],
            chunks: [{ seq: 1, stream: 'stdout', text: 'a' }],
            startedAt: 's',
            finishedAt: null,
        } as never).mockResolvedValueOnce({
            commandUuid: 'c',
            status: 'done',
            exitCode: 0,
            argv: ['dbt', 'parse'],
            chunks: [{ seq: 2, stream: 'stderr', text: 'b' }],
            startedAt: 's',
            finishedAt: 'f',
        } as never);

        const { result } = renderHook(() => useCommandOutput('p', 'c'));

        await act(async () => {
            await vi.advanceTimersByTimeAsync(0);
        });
        expect(result.current.chunks.map((c) => c.seq)).toEqual([1]);
        expect(result.current.isActive).toBe(true);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(500);
        });
        expect(result.current.chunks.map((c) => c.seq)).toEqual([1, 2]);
        expect(result.current.status).toBe('done');
        expect(result.current.isActive).toBe(false);
        expect(api).toHaveBeenLastCalledWith(
            expect.objectContaining({
                url: '/projects/p/learn/workspace/commands/c?after=1',
            }),
        );

        await act(async () => {
            await vi.advanceTimersByTimeAsync(2000);
        });
        expect(api).toHaveBeenCalledTimes(2); // stopped polling

        vi.useRealTimers();
    });

    it('resets when the command changes and surfaces fetch errors', async () => {
        vi.useFakeTimers();
        const api = vi.mocked(lightdashApi);
        api.mockResolvedValueOnce({
            commandUuid: 'c1',
            status: 'running',
            exitCode: null,
            argv: ['dbt', 'parse'],
            chunks: [{ seq: 1, stream: 'stdout', text: 'a' }],
            startedAt: 's',
            finishedAt: null,
        } as never);

        const { result, rerender } = renderHook(
            ({ commandUuid }: { commandUuid: string | null }) =>
                useCommandOutput('p', commandUuid),
            { initialProps: { commandUuid: 'c1' as string | null } },
        );

        await act(async () => {
            await vi.advanceTimersByTimeAsync(0);
        });
        expect(result.current.chunks.map((c) => c.seq)).toEqual([1]);

        api.mockRejectedValueOnce({
            status: 'error',
            error: { message: 'boom' },
        });
        rerender({ commandUuid: 'c2' });
        expect(result.current.chunks).toEqual([]);
        expect(result.current.status).toBeNull();

        await act(async () => {
            await vi.advanceTimersByTimeAsync(0);
        });
        expect(result.current.error).toBe('boom');
        expect(result.current.isActive).toBe(false);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(2000);
        });
        expect(api).toHaveBeenCalledTimes(2); // stopped after the error

        rerender({ commandUuid: null });
        expect(result.current.chunks).toEqual([]);
        expect(result.current.status).toBeNull();
        expect(result.current.error).toBeNull();

        vi.useRealTimers();
    });

    it('sanitizes each chunk of text as it is accumulated', async () => {
        vi.useFakeTimers();
        const api = vi.mocked(lightdashApi);
        api.mockResolvedValueOnce({
            commandUuid: 'c',
            status: 'done',
            exitCode: 0,
            argv: ['dbt', 'parse'],
            chunks: [
                {
                    seq: 1,
                    stream: 'stdout',
                    text: `[31mred[0m text`,
                },
            ],
            startedAt: 's',
            finishedAt: 'f',
        } as never);

        const { result } = renderHook(() => useCommandOutput('p', 'c'));

        await act(async () => {
            await vi.advanceTimersByTimeAsync(0);
        });

        expect(result.current.chunks[0].text).toBe('red text');

        vi.useRealTimers();
    });

    it('does not set an error from a poll that resolves after the effect stopped', async () => {
        vi.useFakeTimers();
        const api = vi.mocked(lightdashApi);
        let rejectPoll: (reason: unknown) => void = () => {};
        api.mockImplementationOnce(
            () =>
                new Promise((_resolve, reject) => {
                    rejectPoll = reject;
                }),
        );

        const { result, unmount } = renderHook(() =>
            useCommandOutput('p', 'c'),
        );

        unmount();
        rejectPoll({ status: 'error', error: { message: 'boom' } });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(0);
        });

        expect(result.current.error).toBeNull();

        vi.useRealTimers();
    });
});
