import { describe, expect, it } from 'vitest';
import { LAUNCHER_AUTO_AGENT } from '../aiCopilot/components/Launcher/launcherAgentSelection';
import { captureThreadTarget, imagesThatStillFit } from './captureThreadTarget';

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

describe('imagesThatStillFit', () => {
    it('sends up to five images to a fresh thread', () => {
        expect(imagesThatStillFit(0, 7)).toBe(5);
        expect(imagesThatStillFit(0, 3)).toBe(3);
    });

    it('sends only what is left of the ten a thread can hold', () => {
        expect(imagesThatStillFit(8, 5)).toBe(2);
        expect(imagesThatStillFit(10, 5)).toBe(0);
        expect(imagesThatStillFit(12, 5)).toBe(0);
    });
});
