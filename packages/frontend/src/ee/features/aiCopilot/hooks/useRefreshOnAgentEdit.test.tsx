import { configureStore } from '@reduxjs/toolkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    aiAgentThreadStreamSlice,
    setParts,
    startStreaming,
    type StreamPart,
} from '../store/aiAgentThreadStreamSlice';
import { resetHandledAgentToolCallIds } from '../streaming/handledAgentToolCalls';
import { useRefreshComposerChartOnAgentEdit } from './useRefreshComposerChartOnAgentEdit';
import { useRefreshSavedChartOnAgentEdit } from './useRefreshSavedChartOnAgentEdit';

beforeEach(resetHandledAgentToolCallIds);

const projectUuid = 'project';
const threadUuid = 'thread';

const text = (value: string): StreamPart => ({ type: 'text', text: value });

const edit = ({
    toolCallId,
    type,
    uuid,
    isPreliminary = false,
}: {
    toolCallId: string;
    type: 'chart' | 'composer_chart';
    uuid: string;
    isPreliminary?: boolean;
}) =>
    ({
        type: 'toolCall',
        toolCallId,
        toolName: 'editContent',
        isPreliminary,
        toolArgs: { type, slug: `${uuid}-slug`, patch: [] },
        toolResult: {
            result: '{}',
            metadata: {
                status: 'success',
                uuid,
                slug: `${uuid}-slug`,
                name: uuid,
                href: `/projects/${projectUuid}/${uuid}`,
                warnings: [],
                versionUuids: { before: null, after: null },
            },
            structuredContent: {
                type,
                href: `/projects/${projectUuid}/${uuid}`,
                content: {},
                warnings: [],
            },
        },
    }) as StreamPart;

const setup = (useHook: () => void) => {
    const store = configureStore({
        reducer: { aiAgentThreadStream: aiAgentThreadStreamSlice.reducer },
        // Notify on every dispatch so each chunk is observable
        enhancers: (getDefaultEnhancers) =>
            getDefaultEnhancers({ autoBatch: false }),
    });
    const queryClient = new QueryClient();
    const invalidate = vi
        .spyOn(queryClient, 'invalidateQueries')
        .mockResolvedValue();
    let renders = 0;
    const Consumer = () => {
        renders += 1;
        useHook();
        return null;
    };
    render(
        <QueryClientProvider client={queryClient}>
            <Provider store={store}>
                <Consumer />
            </Provider>
        </QueryClientProvider>,
    );
    act(() => {
        store.dispatch(
            startStreaming({
                threadUuid,
                messageUuid: 'message',
                projectUuid,
                agentUuid: 'agent',
                autoApproveSql: false,
            }),
        );
    });
    // Each chunk rebuilds every part, as the stream mutation does
    const stream = (parts: () => StreamPart[]) =>
        act(() => {
            store.dispatch(setParts({ threadUuid, parts: parts() }));
        });
    return { stream, invalidate, renders: () => renders };
};

describe('refresh on agent edit', () => {
    it('leaves the composer chart page alone until an edit of its chart finishes', () => {
        const { stream, invalidate, renders } = setup(() =>
            useRefreshComposerChartOnAgentEdit({
                projectUuid,
                composerChartUuid: 'composer',
            }),
        );
        const settled = renders();

        stream(() => [text('Edit')]);
        stream(() => [text('Editing')]);
        stream(() => [
            text('Editing'),
            edit({ toolCallId: 'other', type: 'composer_chart', uuid: 'x' }),
            edit({ toolCallId: 'classic', type: 'chart', uuid: 'composer' }),
            edit({
                toolCallId: 'mine',
                type: 'composer_chart',
                uuid: 'composer',
                isPreliminary: true,
            }),
        ]);
        expect(renders()).toBe(settled);
        expect(invalidate).not.toHaveBeenCalled();

        const finished = () => [
            text('Editing'),
            edit({
                toolCallId: 'mine',
                type: 'composer_chart',
                uuid: 'composer',
            }),
        ];
        stream(finished);
        expect(invalidate).toHaveBeenCalledExactlyOnceWith({
            queryKey: ['composerChart', projectUuid],
        });
        const refreshed = renders();

        stream(() => [...finished(), text('Done')]);
        expect(renders()).toBe(refreshed);
        expect(invalidate).toHaveBeenCalledOnce();
    });

    it('leaves the saved chart page alone until an edit of its chart finishes', () => {
        const { stream, invalidate, renders } = setup(() =>
            useRefreshSavedChartOnAgentEdit({
                projectUuid,
                chartUuid: 'chart',
                chartSlug: 'chart-page-slug',
            }),
        );
        const settled = renders();

        stream(() => [text('Edit')]);
        stream(() => [
            text('Editing'),
            edit({ toolCallId: 'other', type: 'chart', uuid: 'x' }),
            edit({
                toolCallId: 'composer',
                type: 'composer_chart',
                uuid: 'chart',
            }),
        ]);
        expect(renders()).toBe(settled);
        expect(invalidate).not.toHaveBeenCalled();

        stream(() => [
            edit({ toolCallId: 'mine', type: 'chart', uuid: 'chart' }),
        ]);
        const refreshed = renders();
        stream(() => [
            edit({ toolCallId: 'mine', type: 'chart', uuid: 'chart' }),
            text('Done'),
        ]);
        expect(renders()).toBe(refreshed);
        expect(invalidate.mock.calls).toEqual([
            [{ queryKey: ['saved_query', 'chart', projectUuid] }],
            [{ queryKey: ['saved_query', 'chart-page-slug', projectUuid] }],
            [{ queryKey: ['saved_query', 'chart-slug', projectUuid] }],
        ]);
    });
});
