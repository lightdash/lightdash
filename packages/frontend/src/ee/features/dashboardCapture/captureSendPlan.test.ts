import { type AiAgentSummary } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { LAUNCHER_AUTO_AGENT } from '../aiCopilot/components/Launcher/launcherAgentSelection';
import { captureSendPlan, toPendingContext } from './captureSendPlan';

const agent = { uuid: 'default-agent' } as AiAgentSummary;

describe('captureSendPlan', () => {
    it('continues the conversation open in the panel', () => {
        expect(
            captureSendPlan({
                openThread: { threadId: 't1', agentUuid: 'open-agent' },
                selectedAgent: agent,
            }),
        ).toEqual({
            type: 'continue',
            threadId: 't1',
            agentUuid: 'open-agent',
        });
    });

    it("starts a new conversation with the user's default agent", () => {
        expect(
            captureSendPlan({ openThread: null, selectedAgent: agent }),
        ).toEqual({ type: 'create', agentUuid: 'default-agent' });
    });

    it('lets the panel pick the agent when the automatic picker is on', () => {
        expect(
            captureSendPlan({
                openThread: null,
                selectedAgent: LAUNCHER_AUTO_AGENT,
            }),
        ).toEqual({ type: 'panel' });
    });

    it('lets the panel pick the agent while the default is unknown', () => {
        expect(
            captureSendPlan({ openThread: null, selectedAgent: null }),
        ).toEqual({ type: 'panel' });
    });
});

describe('toPendingContext', () => {
    it('keeps the dashboard, first chart and data app', () => {
        expect(
            toPendingContext([
                { type: 'dashboard', dashboardUuid: 'd1' },
                { type: 'chart', chartUuid: 'c1' },
                { type: 'chart', chartUuid: 'c2' },
            ]),
        ).toEqual({ dashboardUuid: 'd1', chartUuid: 'c1' });
        expect(toPendingContext([{ type: 'data_app', appUuid: 'a1' }])).toEqual(
            { dataAppUuid: 'a1' },
        );
    });

    it('is null with nothing attached', () => {
        expect(toPendingContext([])).toBeNull();
    });
});
