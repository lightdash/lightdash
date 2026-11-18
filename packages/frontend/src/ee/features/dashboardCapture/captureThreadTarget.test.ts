import { describe, expect, it } from 'vitest';
import { LAUNCHER_AUTO_AGENT } from '../aiCopilot/components/Launcher/launcherAgentSelection';
import {
    captureThreadTarget,
    screenshotsFitInThread,
} from './captureThreadTarget';

const open = {
    mode: 'panel-open' as const,
    view: 'chat' as const,
    activeThreadId: 'thread-1',
    activeAgentUuid: 'agent-1',
};

describe('captureThreadTarget', () => {
    it('continues the thread open in the agent panel', () => {
        expect(captureThreadTarget(open)).toEqual({
            threadId: 'thread-1',
            agentUuid: 'agent-1',
        });
    });

    it('starts a new thread when the panel is closed', () => {
        expect(captureThreadTarget({ ...open, mode: 'collapsed' })).toBeNull();
    });

    it('starts a new thread when the panel shows a new chat', () => {
        expect(
            captureThreadTarget({ ...open, activeThreadId: null }),
        ).toBeNull();
    });

    it('starts a new thread when the panel shows the analysis view', () => {
        expect(captureThreadTarget({ ...open, view: 'analysis' })).toBeNull();
    });

    it('starts a new thread when no concrete agent is known', () => {
        expect(
            captureThreadTarget({
                ...open,
                activeAgentUuid: LAUNCHER_AUTO_AGENT,
            }),
        ).toBeNull();
        expect(
            captureThreadTarget({ ...open, activeAgentUuid: null }),
        ).toBeNull();
    });
});

describe('screenshotsFitInThread', () => {
    it('fits when the conversation has room for every screenshot', () => {
        expect(screenshotsFitInThread(0, 5)).toBe(true);
        expect(screenshotsFitInThread(5, 5)).toBe(true);
    });

    it('does not fit when any screenshot would go over the limit', () => {
        expect(screenshotsFitInThread(8, 3)).toBe(false);
        expect(screenshotsFitInThread(10, 1)).toBe(false);
    });

    it('always fits a recording with no screenshots', () => {
        expect(screenshotsFitInThread(10, 0)).toBe(true);
    });
});
