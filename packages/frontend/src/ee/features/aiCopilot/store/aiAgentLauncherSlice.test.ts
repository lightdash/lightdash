import { describe, expect, it } from 'vitest';
import {
    aiAgentLauncherSlice,
    attachContextOrStartThread,
    clearPinnedContext,
    closePanel,
    dockItemRemoved,
    openAnalysisPanel,
    openDefaultAgentPanel,
    openPanel,
    pendingContextResolved,
    resetActivePanel,
    setCurrentDashboard,
    unpinContext,
    type AiAgentLauncherState,
    type LauncherPinnedContextEntry,
} from './aiAgentLauncherSlice';

const { reducer } = aiAgentLauncherSlice;

const initial = (): AiAgentLauncherState =>
    reducer(undefined, { type: 'init' });

describe('aiAgentLauncherSlice view', () => {
    it('starts collapsed in chat view', () => {
        const state = initial();
        expect(state.mode).toBe('collapsed');
        expect(state.view).toBe('chat');
    });

    it('openAnalysisPanel opens the panel in analysis view', () => {
        const state = reducer(initial(), openAnalysisPanel());
        expect(state.mode).toBe('panel-open');
        expect(state.view).toBe('analysis');
    });

    it('openAnalysisPanel keeps the active thread for a later chat switch', () => {
        const withThread = reducer(
            initial(),
            openPanel({ threadId: 't1', agentUuid: 'a1' }),
        );
        const state = reducer(withThread, openAnalysisPanel());
        expect(state.activeThreadId).toBe('t1');
        expect(state.view).toBe('analysis');
    });

    it('openPanel switches back to chat view', () => {
        const analysis = reducer(initial(), openAnalysisPanel());
        const state = reducer(
            analysis,
            openPanel({ threadId: 't1', agentUuid: 'a1' }),
        );
        expect(state.view).toBe('chat');
        expect(state.activeThreadId).toBe('t1');
    });

    it('openDefaultAgentPanel switches back to chat view', () => {
        const analysis = reducer(initial(), openAnalysisPanel());
        const state = reducer(analysis, openDefaultAgentPanel({}));
        expect(state.view).toBe('chat');
    });

    it('closePanel collapses but keeps the view for reopen', () => {
        const analysis = reducer(initial(), openAnalysisPanel());
        const state = reducer(analysis, closePanel());
        expect(state.mode).toBe('collapsed');
        expect(state.view).toBe('analysis');
    });

    it('resetActivePanel returns to chat view', () => {
        const analysis = reducer(initial(), openAnalysisPanel());
        const state = reducer(analysis, resetActivePanel());
        expect(state.view).toBe('chat');
    });

    it('dockItemRemoved resets view only for the active thread', () => {
        const withThread = reducer(
            initial(),
            openPanel({ threadId: 't1', agentUuid: 'a1' }),
        );
        const analysis = reducer(withThread, openAnalysisPanel());
        const unrelated = reducer(
            analysis,
            dockItemRemoved({ threadId: 'other' }),
        );
        expect(unrelated.view).toBe('analysis');
        const removed = reducer(analysis, dockItemRemoved({ threadId: 't1' }));
        expect(removed.view).toBe('chat');
        expect(removed.mode).toBe('collapsed');
    });
});

describe('asking about content from a page', () => {
    const chart = { chartUuid: 'c1' };

    it('pins the content to the thread on screen', () => {
        const withThread = reducer(
            initial(),
            openPanel({ threadId: 't1', agentUuid: 'a1' }),
        );
        const state = reducer(
            withThread,
            attachContextOrStartThread({ pendingContext: chart }),
        );
        expect(state.activeThreadId).toBe('t1');
        expect(state.activeAgentUuid).toBe('a1');
        expect(state.pendingContext).toEqual(chart);
    });

    it('starts a new thread when no chat is open', () => {
        const state = reducer(
            initial(),
            attachContextOrStartThread({ pendingContext: chart }),
        );
        expect(state.mode).toBe('panel-open');
        expect(state.activeThreadId).toBeNull();
        expect(state.pendingContext).toEqual(chart);
    });

    it('starts a new thread when the chat was closed', () => {
        const closed = reducer(
            reducer(initial(), openPanel({ threadId: 't1', agentUuid: 'a1' })),
            closePanel(),
        );
        const state = reducer(
            closed,
            attachContextOrStartThread({ pendingContext: chart }),
        );
        expect(state.mode).toBe('panel-open');
        expect(state.activeThreadId).toBeNull();
    });

    it('starts a new thread when the panel shows the analysis view', () => {
        const analysis = reducer(
            reducer(initial(), openPanel({ threadId: 't1', agentUuid: 'a1' })),
            openAnalysisPanel(),
        );
        const state = reducer(
            analysis,
            attachContextOrStartThread({ pendingContext: chart }),
        );
        expect(state.view).toBe('chat');
        expect(state.activeThreadId).toBeNull();
    });

    it('drops the pinned content when another thread is opened', () => {
        const pinned = reducer(
            reducer(initial(), openPanel({ threadId: 't1', agentUuid: 'a1' })),
            attachContextOrStartThread({ pendingContext: chart }),
        );
        const state = reducer(
            pinned,
            openPanel({ threadId: 't2', agentUuid: 'a1' }),
        );
        expect(state.pendingContext).toBeNull();
    });
});

describe('content pinned to the next prompt', () => {
    const entry = (
        key: string,
        preview: LauncherPinnedContextEntry['preview'],
        input: LauncherPinnedContextEntry['input'],
    ): LauncherPinnedContextEntry => ({ key, preview, input });
    const chartEntry = (uuid: string) =>
        entry(
            `chart:${uuid}`,
            {
                type: 'chart',
                chartUuid: uuid,
                chartSlug: null,
                displayName: uuid,
                pinnedVersionUuid: null,
                runtimeOverrides: null,
                chartKind: null,
            },
            { type: 'chart', chartUuid: uuid, chartSlug: null },
        );
    const dashboardEntry = (uuid: string) =>
        entry(
            `dashboard:${uuid}`,
            {
                type: 'dashboard',
                dashboardUuid: uuid,
                dashboardSlug: null,
                displayName: uuid,
                pinnedVersionUuid: null,
                runtimeOverrides: null,
            },
            { type: 'dashboard', dashboardUuid: uuid, dashboardSlug: null },
        );
    const onDashboard = (uuid: string) =>
        reducer(
            reducer(initial(), openPanel({ threadId: 't1', agentUuid: 'a1' })),
            setCurrentDashboard({
                projectUuid: 'p1',
                uuid,
                name: uuid,
                activeTabUuid: null,
                runtimeOverrides: null,
            }),
        );
    const keys = (state: AiAgentLauncherState) =>
        state.pinnedContext.map(({ key }) => key);

    it('adds each piece of content once, in the order it was pinned', () => {
        const first = reducer(
            reducer(
                initial(),
                attachContextOrStartThread({
                    pendingContext: { chartUuid: 'c1' },
                }),
            ),
            pendingContextResolved([chartEntry('c1')]),
        );
        const state = reducer(
            first,
            pendingContextResolved([chartEntry('c2'), chartEntry('c1')]),
        );
        expect(keys(state)).toEqual(['chart:c1', 'chart:c2']);
        expect(state.pendingContext).toBeNull();
    });

    it('removes one piece of content and keeps the rest', () => {
        const pinned = reducer(
            initial(),
            pendingContextResolved([chartEntry('c1'), chartEntry('c2')]),
        );
        const state = reducer(
            pinned,
            unpinContext({ key: 'chart:c1', dashboardUuid: null }),
        );
        expect(keys(state)).toEqual(['chart:c2']);
    });

    it('holds back the dashboard on screen once its chip is removed', () => {
        const state = reducer(
            onDashboard('d1'),
            unpinContext({
                key: 'dashboard:d1',
                dashboardUuid: 'd1',
            }),
        );
        expect(state.pageContextDismissed).toBe(true);
    });

    it('brings the dashboard on screen back when it is pinned again', () => {
        const dismissed = reducer(
            onDashboard('d1'),
            unpinContext({
                key: 'dashboard:d1',
                dashboardUuid: 'd1',
            }),
        );
        const state = reducer(
            dismissed,
            pendingContextResolved([dashboardEntry('d1')]),
        );
        expect(state.pageContextDismissed).toBe(false);
    });

    it('keeps the dashboard dismissed for the thread after a prompt is sent', () => {
        const dismissed = reducer(
            reducer(
                onDashboard('d1'),
                pendingContextResolved([chartEntry('c1')]),
            ),
            unpinContext({
                key: 'dashboard:d1',
                dashboardUuid: 'd1',
            }),
        );
        const state = reducer(dismissed, clearPinnedContext());
        expect(state.pinnedContext).toEqual([]);
        expect(state.pageContextDismissed).toBe(true);
    });

    it('starts clean when another thread is opened', () => {
        const dismissed = reducer(
            reducer(
                onDashboard('d1'),
                pendingContextResolved([chartEntry('c1')]),
            ),
            unpinContext({
                key: 'dashboard:d1',
                dashboardUuid: 'd1',
            }),
        );
        const state = reducer(
            dismissed,
            openPanel({ threadId: 't2', agentUuid: 'a1' }),
        );
        expect(state.pinnedContext).toEqual([]);
        expect(state.pageContextDismissed).toBe(false);
    });

    it('keeps pinned content when the agent of a new thread is switched', () => {
        const pinned = reducer(
            reducer(initial(), openDefaultAgentPanel({})),
            pendingContextResolved([chartEntry('c1')]),
        );
        const state = reducer(
            pinned,
            openPanel({ threadId: null, agentUuid: 'a2' }),
        );
        expect(keys(state)).toEqual(['chart:c1']);
    });
});
