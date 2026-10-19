import { describe, expect, it } from 'vitest';
import {
    aiAgentLauncherSlice,
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
