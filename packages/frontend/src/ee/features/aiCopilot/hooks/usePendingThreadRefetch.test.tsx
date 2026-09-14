import { type AiAgentMessageAssistant } from '@lightdash/common';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    markStreamPolling,
    stopStreaming,
} from '../store/aiAgentThreadStreamSlice';
import { usePendingThreadRefetch } from './usePendingThreadRefetch';

const { dispatchMock, streamState } = vi.hoisted(() => ({
    dispatchMock: vi.fn(),
    streamState: { recovering: false, streaming: false },
}));

vi.mock('../store/hooks', () => ({
    useAiAgentStoreDispatch: () => dispatchMock,
}));

vi.mock('../streaming/useAiAgentThreadStreamQuery', () => ({
    useAiAgentThreadRecoveryActive: () => streamState.recovering,
    useAiAgentThreadStreaming: () => streamState.streaming,
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

const threadWithAssistantStatus = (status: AiAgentMessageAssistant['status']) =>
    ({
        uuid: 'thread-1',
        agentUuid: 'agent-1',
        createdAt: '2026-08-11T12:00:00.000Z',
        createdFrom: 'web_app',
        title: null,
        titleGeneratedAt: null,
        pinnedAt: null,
        liveStatus: null,
        firstMessage: { uuid: 'message-1', message: 'Question' },
        user: { uuid: 'user-1', name: 'User' },
        compactions: [],
        messages: [
            {
                role: 'assistant',
                status,
                uuid: 'message-1',
                threadUuid: 'thread-1',
                message: status === 'idle' ? 'Answer' : null,
                errorMessage: null,
                interrupted: false,
                createdAt: '2026-08-11T12:00:00.000Z',
                humanScore: null,
                toolCalls: [],
                toolResults: [],
                reasoning: [],
                savedQueryUuid: null,
                artifacts: null,
                referencedArtifacts: null,
                modelConfig: null,
                tokenUsage: null,
                responseTiming: null,
            },
        ],
    }) satisfies NonNullable<Parameters<typeof usePendingThreadRefetch>[0]>;

describe('usePendingThreadRefetch', () => {
    beforeEach(() => {
        dispatchMock.mockReset();
        streamState.recovering = false;
        streamState.streaming = false;
    });

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

        expect(result.current.isBackgroundWorkPending).toBe(false);
    });

    it('polls pending background work without marking the thread pending', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-11T12:00:00.000Z'));
        const refetch = vi.fn().mockResolvedValue({ isError: false });

        const { result } = renderHook(() =>
            usePendingThreadRefetch(
                pendingThread('2026-08-11T12:00:00.001Z'),
                'thread-1',
                refetch,
            ),
        );

        expect(result.current.isThreadPending).toBe(false);
        expect(result.current.isBackgroundWorkPending).toBe(true);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(5_000);
        });

        expect(refetch).toHaveBeenCalledOnce();
    });

    it('polls a pending thread while recovering its connection', async () => {
        vi.useFakeTimers();
        streamState.recovering = true;
        const refetch = vi.fn().mockResolvedValue({ isError: false });
        const thread = threadWithAssistantStatus('pending');

        const { result } = renderHook(() =>
            usePendingThreadRefetch(thread, 'thread-1', refetch),
        );

        expect(result.current.isThreadPending).toBe(true);
        expect(result.current.isBackgroundWorkPending).toBe(false);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(5_000);
        });

        expect(refetch).toHaveBeenCalledOnce();
        expect(dispatchMock).toHaveBeenCalledWith(
            markStreamPolling({ threadUuid: 'thread-1' }),
        );
    });

    it('keeps showing recovery when polling fails', async () => {
        vi.useFakeTimers();
        streamState.recovering = true;
        const refetch = vi.fn().mockRejectedValue(new Error('Offline'));
        const thread = threadWithAssistantStatus('pending');

        renderHook(() => usePendingThreadRefetch(thread, 'thread-1', refetch));

        await act(async () => {
            await vi.advanceTimersByTimeAsync(5_000);
        });

        expect(dispatchMock).not.toHaveBeenCalledWith(
            markStreamPolling({ threadUuid: 'thread-1' }),
        );
    });

    it('finishes recovery when the persisted response arrives', () => {
        streamState.recovering = true;
        const thread = threadWithAssistantStatus('idle');

        renderHook(() => usePendingThreadRefetch(thread, 'thread-1', vi.fn()));

        expect(dispatchMock).toHaveBeenCalledWith(
            stopStreaming({ threadUuid: 'thread-1' }),
        );
    });

    it('does not keep recovery active for pending background work', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-11T12:00:00.000Z'));
        streamState.recovering = true;

        renderHook(() =>
            usePendingThreadRefetch(
                pendingThread('2026-08-11T12:00:00.001Z'),
                'thread-1',
                vi.fn(),
            ),
        );

        expect(dispatchMock).toHaveBeenCalledWith(
            stopStreaming({ threadUuid: 'thread-1' }),
        );
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

        expect(result.current.isBackgroundWorkPending).toBe(true);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
        });
        expect(result.current.isBackgroundWorkPending).toBe(true);
        refetch.mockClear();

        await act(async () => {
            await vi.advanceTimersByTimeAsync(1);
        });

        expect(refetch).toHaveBeenCalledTimes(1);
        expect(result.current.isBackgroundWorkPending).toBe(false);
    });
});
