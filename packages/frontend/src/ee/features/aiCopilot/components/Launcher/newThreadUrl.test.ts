import { type AiAgentSummary } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { LAUNCHER_AUTO_AGENT } from './launcherAgentSelection';
import { buildNewThreadUrl } from './newThreadUrl';

const agent = { uuid: 'agent-1' } as AiAgentSummary;

describe('buildNewThreadUrl', () => {
    it('targets the agent thread route with the data app query param', () => {
        expect(
            buildNewThreadUrl({
                projectUuid: 'p1',
                agent,
                pendingContext: { dataAppUuid: 'app-1' },
            }),
        ).toBe('/projects/p1/ai-agents/agent-1/threads?dataAppUuid=app-1');
    });

    it('carries chart and dashboard params', () => {
        expect(
            buildNewThreadUrl({
                projectUuid: 'p1',
                agent,
                pendingContext: { chartUuid: 'c1', dashboardUuid: 'd1' },
            }),
        ).toBe(
            '/projects/p1/ai-agents/agent-1/threads?chartUuid=c1&dashboardUuid=d1',
        );
    });

    it('omits the query string without context', () => {
        expect(
            buildNewThreadUrl({
                projectUuid: 'p1',
                agent,
                pendingContext: null,
            }),
        ).toBe('/projects/p1/ai-agents/agent-1/threads');
    });

    it('targets the auto-routing page for the auto agent', () => {
        expect(
            buildNewThreadUrl({
                projectUuid: 'p1',
                agent: LAUNCHER_AUTO_AGENT,
                pendingContext: { dataAppUuid: 'app-1' },
            }),
        ).toBe('/projects/p1/ai-agents?dataAppUuid=app-1&routing=auto');
    });
});
