import { describe, expect, it } from 'vitest';
import {
    aiAgentLauncherSlice,
    attachContextOrStartThread,
    closePanel,
    dockItemRemoved,
    openAnalysisPanel,
    openDefaultAgentPanel,
    openPanel,
    resetActivePanel,
    type AiAgentLauncherState,
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
