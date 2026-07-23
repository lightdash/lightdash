import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { subscribeToDeepResearchComposerPrompt } from '../deepResearch/deepResearchRegistry';
import { type DeepResearchRunRegistration } from '../deepResearch/types';
import {
    useDeepResearchRun,
    useStartDeepResearchMutation,
} from './useDeepResearch';

const lightdashApiMock = vi.fn();
const showToastApiErrorMock = vi.fn();

vi.mock('../../../../api', () => ({
    lightdashApi: (args: unknown) => lightdashApiMock(args),
}));

vi.mock('../../../../hooks/toaster/useToaster', () => ({
    default: () => ({ showToastApiError: showToastApiErrorMock }),
}));

vi.mock('../../../../hooks/user/useUser', () => ({
    default: () => ({ data: { userUuid: 'user-1' } }),
}));

const registration: DeepResearchRunRegistration = {
    runUuid: 'run-1',
    projectUuid: 'project-1',
    agentUuid: 'agent-1',
    threadUuid: 'thread-1',
    promptUuid: 'prompt-1',
    mcpServerUuids: ['mcp-1'],
    userUuid: 'user-1',
    question: 'Why did enterprise retention fall in Q2?',
    depth: 'standard',
    createdAt: '2026-07-15T09:00:00.000Z',
    state: 'started',
};

const getRun = (status: 'running' | 'completed') => ({
    aiDeepResearchRunUuid: 'run-1',
    projectUuid: 'project-1',
    status,
    result:
        status === 'completed'
            ? {
                  summary:
                      'Three incident-affected renewals drove the decline.',
                  findings: [],
                  caveats: [],
                  scope: 'Q2 enterprise renewal cohort.',
                  unresolvedQuestions: [],
                  nextSteps: [],
              }
            : null,
    budget: {
        maxTokens: 10_000,
        maxToolCalls: 25,
        maxWarehouseQueries: 25,
        maxResultRows: 10_000,
    },
    errorMessage: null,
    cancellationRequestedAt: null,
    createdAt: '2026-07-15T09:00:00.000Z',
    updatedAt: '2026-07-15T09:05:00.000Z',
    startedAt: '2026-07-15T09:00:02.000Z',
    completedAt: status === 'completed' ? '2026-07-15T09:05:00.000Z' : null,
});

const getWrapper = () => {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, cacheTime: 0 } },
    });
    return ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
};

describe('useStartDeepResearchMutation', () => {
    afterEach(() => {
        window.localStorage.clear();
        lightdashApiMock.mockReset();
        showToastApiErrorMock.mockReset();
    });

    it('restores the composer prompt when a run fails to start', async () => {
        const apiError = {
            error: {
                message: 'Could not enqueue run',
                statusCode: 500,
            },
        };
        lightdashApiMock.mockRejectedValueOnce(apiError);
        const promptListener = vi.fn();
        const unsubscribe =
            subscribeToDeepResearchComposerPrompt(promptListener);
        const { result } = renderHook(
            () =>
                useStartDeepResearchMutation({
                    projectUuid: 'project-1',
                    agentUuid: 'agent-1',
                    threadUuid: 'thread-1',
                }),
            { wrapper: getWrapper() },
        );

        await act(async () => {
            await expect(
                result.current.mutateAsync({
                    question: 'Why did retention fall?',
                    depth: 'standard',
                    mcpServerUuids: ['mcp-1'],
                    promptUuid: 'prompt-1',
                }),
            ).rejects.toEqual(apiError);
        });

        expect(promptListener).toHaveBeenCalledWith({
            threadUuid: 'thread-1',
            prompt: 'Why did retention fall?',
        });
        expect(showToastApiErrorMock).toHaveBeenCalledOnce();
        expect(
            JSON.parse(
                window.localStorage.getItem(
                    'lightdash.deep-research-runs.v1',
                ) ?? '[]',
            ),
        ).toEqual([
            expect.objectContaining({
                promptUuid: 'prompt-1',
                state: 'start_failed',
            }),
        ]);
        unsubscribe();
    });
});

describe('useDeepResearchRun', () => {
    beforeEach(() => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        let runReads = 0;
        lightdashApiMock.mockImplementation(({ url }: { url: string }) => {
            if (url.includes('/events')) {
                return Promise.resolve({ events: [], nextCursor: null });
            }
            runReads += 1;
            return Promise.resolve(
                getRun(runReads === 1 ? 'running' : 'completed'),
            );
        });
    });

    afterEach(() => {
        vi.useRealTimers();
        lightdashApiMock.mockReset();
    });

    it('stops polling after a terminal state and cleans up on unmount', async () => {
        const wrapper = getWrapper();
        const { result, unmount } = renderHook(
            () => useDeepResearchRun(registration),
            { wrapper },
        );

        await waitFor(() =>
            expect(result.current.data?.status).toBe('running'),
        );

        await act(async () => {
            await vi.advanceTimersByTimeAsync(2_100);
        });
        await waitFor(() =>
            expect(result.current.data?.status).toBe('completed'),
        );

        const callsAtCompletion = lightdashApiMock.mock.calls.length;
        await act(async () => {
            await vi.advanceTimersByTimeAsync(5_000);
        });
        expect(lightdashApiMock).toHaveBeenCalledTimes(callsAtCompletion);

        unmount();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(5_000);
        });
        expect(lightdashApiMock).toHaveBeenCalledTimes(callsAtCompletion);
    });

    it('loads every event page before calculating activity counts', async () => {
        lightdashApiMock.mockImplementation(({ url }: { url: string }) => {
            if (url.includes('/events') && !url.includes('cursor=')) {
                return Promise.resolve({
                    events: Array.from({ length: 100 }, (_, index) => ({
                        aiDeepResearchEventUuid: `event-${index}`,
                        aiDeepResearchRunUuid: 'run-1',
                        eventType: 'status_changed',
                        payload: { status: 'running' },
                        createdAt: '2026-07-15T09:00:30.000Z',
                    })),
                    nextCursor: 'next page',
                });
            }
            if (url.includes('cursor=next%20page')) {
                return Promise.resolve({
                    events: [
                        {
                            aiDeepResearchEventUuid: 'event-101',
                            aiDeepResearchRunUuid: 'run-1',
                            eventType: 'progress',
                            payload: {
                                progress: {
                                    phase: 'investigating',
                                    activity: 'warehouse_query',
                                    current: null,
                                    total: null,
                                },
                            },
                            createdAt: '2026-07-15T09:01:00.000Z',
                        },
                    ],
                    nextCursor: null,
                });
            }
            return Promise.resolve(getRun('completed'));
        });

        const { result } = renderHook(() => useDeepResearchRun(registration), {
            wrapper: getWrapper(),
        });

        await waitFor(() => expect(result.current.data?.queryCount).toBe(1));
        expect(
            lightdashApiMock.mock.calls.filter(([args]) =>
                (args as { url: string }).url.includes('/events'),
            ),
        ).toHaveLength(2);
    });

    it('stops paging when the backend returns a reusable unchanged cursor', async () => {
        lightdashApiMock.mockImplementation(({ url }: { url: string }) => {
            if (url.includes('/events') && !url.includes('cursor=')) {
                return Promise.resolve({
                    events: Array.from({ length: 100 }, (_, index) => ({
                        aiDeepResearchEventUuid: `event-${index}`,
                        aiDeepResearchRunUuid: 'run-1',
                        eventType: 'status_changed',
                        payload: { status: 'running' },
                        createdAt: '2026-07-15T09:00:30.000Z',
                    })),
                    nextCursor: 'stable cursor',
                });
            }
            if (url.includes('cursor=stable%20cursor')) {
                return Promise.resolve({
                    events: [],
                    nextCursor: 'stable cursor',
                });
            }
            return Promise.resolve(getRun('completed'));
        });

        const { result } = renderHook(() => useDeepResearchRun(registration), {
            wrapper: getWrapper(),
        });

        await waitFor(() =>
            expect(result.current.data?.status).toBe('completed'),
        );
        expect(
            lightdashApiMock.mock.calls.filter(([args]) =>
                (args as { url: string }).url.includes('/events'),
            ),
        ).toHaveLength(2);
    });
});
