import { type AiAgentMessageAssistant } from '@lightdash/common';
import { configureStore } from '@reduxjs/toolkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useContext, type PropsWithChildren } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { expect, it, vi } from 'vitest';
import { mockedLightdashApi } from '../../../../testing/mockedLightdashApi';
import EmbedProviderContext from '../../../providers/Embed/context';
import { useCreateEmbedEventEmitter } from '../../embed/hooks/useEmbedEventEmitter';
import {
    aiAgentThreadStreamSlice,
    markStreamRecovering,
    setParts,
    startStreaming,
    type StreamPart,
} from '../store/aiAgentThreadStreamSlice';
import { AiAgentThreadStreamAbortControllerContextProvider } from '../streaming/AiAgentThreadStreamAbortControllerContextProvider';
import { useEmitEmbedAgentContentEvents } from './useEmitEmbedAgentContentEvents';
import { usePendingThreadRefetch } from './usePendingThreadRefetch';
import {
    useAiAgentThread,
    useRetryAiAgentThreadMessageMutation,
} from './useProjectAiAgents';

vi.mock('../../../../api');
vi.mock('../../../../hooks/health/useHealth', () => ({
    default: () => ({ data: undefined }),
}));

const projectUuid = 'project';
const agentUuid = 'agent';

const save = (
    promptUuid: string,
    slug: string,
    type: 'chart' | 'dashboard',
    toolName: 'createContent' | 'editContent',
    toolCallId = `call-${promptUuid}-${slug}`,
) => {
    const href = `/projects/${projectUuid}/${slug}`;
    const metadata = {
        status: 'success' as const,
        slug,
        name: slug,
        uuid: `${slug}-uuid`,
        href,
        warnings: [],
        versionUuids: { before: null, after: null },
    };
    const identity = {
        promptUuid,
        toolCallId,
        toolType: 'built-in' as const,
        toolName,
        createdAt: new Date('2026-01-01T00:00:00Z'),
    };
    return {
        call: {
            ...identity,
            uuid: `request-${toolCallId}`,
            parentToolCallId: null,
            toolArgs:
                toolName === 'createContent'
                    ? { type, content: { slug } }
                    : { type, slug, patch: [] },
        },
        result: {
            ...identity,
            uuid: `result-${toolCallId}`,
            result: '{}',
            metadata,
        },
    };
};

type Message = Pick<
    AiAgentMessageAssistant,
    'uuid' | 'role' | 'status' | 'toolCalls' | 'toolResults'
>;

const assistant = (
    uuid: string,
    status: Message['status'],
    ...saves: ReturnType<typeof save>[]
): Message => ({
    uuid,
    status,
    role: 'assistant',
    toolCalls: saves.map(({ call }) => call),
    toolResults: saves.map(({ result }) => result),
});

const setup = (
    threadUuid: string | undefined,
    messages: Message[],
    hasListener = () => true,
) => {
    const onEvent = vi.fn();
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false, cacheTime: 0 } },
    });
    const store = configureStore({
        reducer: { aiAgentThreadStream: aiAgentThreadStreamSlice.reducer },
    });
    const respond = (messages: Message[]) =>
        mockedLightdashApi.mockResolvedValue({
            uuid: threadUuid,
            agentUuid,
            messages,
        });
    respond(messages);

    const Wrapper = ({ children }: PropsWithChildren) => {
        const context = useContext(EmbedProviderContext);
        const events = useCreateEmbedEventEmitter(
            'sdk',
            hasListener() ? onEvent : undefined,
        );
        return (
            <MemoryRouter>
                <QueryClientProvider client={client}>
                    <Provider store={store}>
                        <EmbedProviderContext.Provider
                            value={{
                                ...context,
                                ...events,
                                mode: 'sdk',
                                embedToken: 'jwt',
                            }}
                        >
                            <AiAgentThreadStreamAbortControllerContextProvider>
                                {children}
                            </AiAgentThreadStreamAbortControllerContextProvider>
                        </EmbedProviderContext.Provider>
                    </Provider>
                </QueryClientProvider>
            </MemoryRouter>
        );
    };
    const hook = renderHook(
        ({ threadUuid }) => {
            const query = useAiAgentThread(projectUuid, agentUuid, threadUuid);
            useEmitEmbedAgentContentEvents({
                projectUuid,
                agentUuid,
                threadUuid,
                thread: query.data,
            });
            usePendingThreadRefetch(
                query.data,
                threadUuid ?? '',
                query.refetch,
            );
            const { mutate: retry } = useRetryAiAgentThreadMessageMutation();
            return { ...query, retry };
        },
        { wrapper: Wrapper, initialProps: { threadUuid } },
    );

    return { onEvent, store, ...hook, respond };
};

it.each(['pending', 'idle'] as const)(
    'delivers each save once when the first recovery read is %s',
    async (firstStatus) => {
        const ids = {
            projectUuid,
            agentUuid,
            threadUuid: `thread-${firstStatus}`,
            messageUuid: `current-${firstStatus}`,
        };
        const { threadUuid, messageUuid } = ids;
        const chart = save(messageUuid, 'chart', 'chart', 'editContent');
        const dashboard = save(
            messageUuid,
            'dashboard',
            'dashboard',
            'createContent',
        );
        const older = assistant(
            'older',
            'idle',
            save('older', 'old-chart', 'chart', 'editContent'),
        );
        const pending = assistant(messageUuid, 'pending');
        const completed = assistant(messageUuid, 'idle', chart, dashboard);
        const { onEvent, store, result, respond } = setup(threadUuid, [
            older,
            pending,
        ]);

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(onEvent).not.toHaveBeenCalled();

        const part: StreamPart = {
            type: 'toolCall',
            toolCallId: chart.call.toolCallId,
            toolName: 'editContent',
            toolArgs: { type: 'chart', slug: 'chart', patch: [] },
            toolResult: {
                result: chart.result.result,
                metadata: chart.result.metadata,
                structuredContent: {
                    type: 'chart',
                    href: chart.result.metadata.href,
                    content: {},
                    warnings: [],
                },
            },
            isPreliminary: false,
        };
        act(() => {
            store.dispatch(startStreaming({ ...ids, autoApproveSql: false }));
            store.dispatch(setParts({ threadUuid, parts: [part] }));
        });
        const chartSaved = {
            type: 'chartSaved',
            payload: { chartUuid: 'chart-uuid', action: 'updated' },
        };
        await waitFor(() =>
            expect(onEvent).toHaveBeenCalledExactlyOnceWith(chartSaved),
        );

        respond([older, { ...completed, status: firstStatus }]);
        await act(async () => {
            store.dispatch(markStreamRecovering({ threadUuid }));
            await result.current.refetch();
        });
        await waitFor(() =>
            expect(onEvent).toHaveBeenNthCalledWith(2, {
                type: 'dashboardSaved',
                payload: { dashboardUuid: 'dashboard-uuid', action: 'created' },
            }),
        );

        respond([older, completed]);
        await act(async () => {
            await result.current.refetch();
        });
        await waitFor(() =>
            expect(
                store.getState().aiAgentThreadStream[threadUuid]?.connection
                    .status,
            ).toBe('complete'),
        );
        expect(onEvent).toHaveBeenCalledTimes(2);
    },
);

it('keeps historical saves quiet when opening a completed thread', async () => {
    const saved = save('older', 'old-dashboard', 'dashboard', 'editContent');
    const { onEvent, result } = setup('historical-thread', [
        assistant('older', 'idle', saved),
    ]);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(onEvent).not.toHaveBeenCalled();
});

it('delivers only the new save when an interrupted retry updates the same dashboard', async () => {
    const ids = {
        projectUuid,
        agentUuid,
        threadUuid: 'retried-thread',
        messageUuid: 'retried-message',
    };
    const { threadUuid, messageUuid } = ids;
    const oldSave = save(
        messageUuid,
        'retry-dashboard',
        'dashboard',
        'createContent',
    );
    let listening = false;
    const { onEvent, result, store, rerender } = setup(
        threadUuid,
        [assistant(messageUuid, 'error', oldSave)],
        () => listening,
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(onEvent).not.toHaveBeenCalled();

    const response = Promise.withResolvers<unknown>();
    mockedLightdashApi.mockReturnValue(response.promise);
    const stream =
        Promise.withResolvers<ReadableStreamDefaultController<Uint8Array>>();
    const body = new ReadableStream({ start: stream.resolve });
    mockedLightdashApi.stream.mockResolvedValueOnce({ body });
    act(() => result.current.retry(ids));
    await waitFor(() =>
        expect(
            store.getState().aiAgentThreadStream[threadUuid]?.connection.status,
        ).toBe('streaming'),
    );
    (await stream.promise).close();
    await waitFor(() => expect(result.current.isFetching).toBe(true));

    const newSave = save(
        messageUuid,
        'retry-dashboard',
        'dashboard',
        'editContent',
        'retry-update',
    );
    listening = true;
    rerender({ threadUuid });
    response.resolve({
        uuid: threadUuid,
        agentUuid,
        messages: [assistant(messageUuid, 'idle', oldSave, newSave)],
    });

    await waitFor(() =>
        expect(onEvent).toHaveBeenCalledExactlyOnceWith({
            type: 'dashboardSaved',
            payload: {
                dashboardUuid: 'retry-dashboard-uuid',
                action: 'updated',
            },
        }),
    );
});

it('keeps a late save quiet after leaving and reopening an interrupted thread', async () => {
    const ids = {
        projectUuid,
        agentUuid,
        threadUuid: 'left-thread',
        messageUuid: 'left-turn',
    };
    const { threadUuid, messageUuid } = ids;
    const { onEvent, result, store, rerender } = setup(threadUuid, [
        assistant(messageUuid, 'pending'),
    ]);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const response = Promise.withResolvers<unknown>();
    mockedLightdashApi.mockReturnValueOnce(response.promise);
    act(() => {
        store.dispatch(startStreaming({ ...ids, autoApproveSql: false }));
    });
    act(() => {
        store.dispatch(markStreamRecovering({ threadUuid }));
        void result.current.refetch();
    });
    const otherThread = { uuid: 'other-thread', agentUuid, messages: [] };
    mockedLightdashApi.mockResolvedValue(otherThread);
    rerender({ threadUuid: otherThread.uuid });
    await waitFor(() => expect(result.current.data).toEqual(otherThread));

    const saved = save(messageUuid, 'left', 'dashboard', 'editContent');
    const completed = {
        uuid: threadUuid,
        agentUuid,
        messages: [assistant(messageUuid, 'idle', saved)],
    };
    await act(async () => response.resolve(completed));
    expect(onEvent).not.toHaveBeenCalled();

    mockedLightdashApi.mockResolvedValue(completed);
    rerender({ threadUuid });
    await waitFor(() => expect(result.current.data).toEqual(completed));
    expect(onEvent).not.toHaveBeenCalled();
});

it('delivers saves when a new thread loses its stream before its route opens', async () => {
    const ids = {
        projectUuid,
        agentUuid,
        threadUuid: 'new-thread',
        messageUuid: 'first-turn',
    };
    const { threadUuid, messageUuid } = ids;
    const { onEvent, store, rerender } = setup(undefined, []);

    act(() => {
        store.dispatch(startStreaming({ ...ids, autoApproveSql: false }));
        store.dispatch(markStreamRecovering({ threadUuid }));
    });
    const saved = save(
        messageUuid,
        'new-dashboard',
        'dashboard',
        'createContent',
    );
    mockedLightdashApi.mockResolvedValue({
        uuid: threadUuid,
        agentUuid,
        messages: [assistant(messageUuid, 'idle', saved)],
    });
    rerender({ threadUuid });

    await waitFor(() =>
        expect(onEvent).toHaveBeenCalledExactlyOnceWith({
            type: 'dashboardSaved',
            payload: { dashboardUuid: 'new-dashboard-uuid', action: 'created' },
        }),
    );
});
