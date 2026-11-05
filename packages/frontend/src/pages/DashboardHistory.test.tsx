import {
    AgentActorSurface,
    buildAgentIdentityClaim,
    type DashboardVersionSummary,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../testing/testUtils';
import DashboardHistory from './DashboardHistory';

const state = vi.hoisted(() => ({
    enabled: true,
    history: [] as DashboardVersionSummary[],
}));
vi.mock('../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: state.enabled } }),
}));
vi.mock('../hooks/useProjectUuid', () => ({ useProjectUuid: () => 'project' }));
vi.mock('../hooks/useProjectRoute', () => ({
    useProjectUrlIdentifier: () => 'project',
}));
vi.mock('../hooks/dashboard/useDashboard', () => ({
    useDashboardHistory: () => ({ data: { history: state.history } }),
    useDashboardQuery: () => ({ data: { uuid: 'dashboard' } }),
    useDashboardVersionRollbackMutation: () => ({ mutate: vi.fn() }),
}));
vi.mock('./DashboardVersionComparison', () => ({ default: () => null }));
const version: DashboardVersionSummary = {
    dashboardUuid: 'dashboard',
    versionUuid: 'version',
    createdAt: new Date('2026-10-01'),
    createdBy: { userUuid: 'person', firstName: 'Ada', lastName: 'Lovelace' },
};
const renderHistory = async () => {
    const result = renderWithProviders(
        <MemoryRouter>
            <DashboardHistory />
        </MemoryRouter>,
    );
    await userEvent
        .setup()
        .click(await screen.findByRole('button', { name: 'Versions' }));
    return result;
};
describe('DashboardHistory attribution', () => {
    beforeEach(() => {
        state.enabled = true;
        state.history = [{ ...version }];
    });
    it.each([
        [AgentActorSurface.MCP, 'MCP'],
        [AgentActorSurface.IN_APP_AGENT, 'In-app agent'],
        [AgentActorSurface.SLACK_AGENT, 'Slack agent'],
    ])('renders %s', async (surface, label) => {
        state.history[0].agentIdentity = buildAgentIdentityClaim({
            subject: { type: 'user', uuid: 'person' },
            surface: surface as AgentActorSurface,
            clientId: null,
        });
        await renderHistory();
        expect(
            screen.getByText(`Changed by an agent for Ada Lovelace · ${label}`),
        ).toBeVisible();
    });
    it.each(['service_account', 'unknown', 'legacy'] as const)(
        'renders %s claims',
        async (kind) => {
            const identity = buildAgentIdentityClaim({
                subject: {
                    type:
                        kind === 'service_account' ? 'service_account' : 'user',
                    uuid: kind === 'unknown' ? 'deleted' : 'person',
                },
                surface: AgentActorSurface.MCP,
                clientId: null,
            });
            if (kind === 'legacy')
                Reflect.deleteProperty(identity.act, 'agent_uuid');
            state.history[0].agentIdentity = identity;
            await renderHistory();
            expect(
                screen.getByText(
                    `Changed by an agent for ${kind === 'service_account' ? 'a service account' : kind === 'unknown' ? 'an unknown person' : 'Ada Lovelace'} · MCP`,
                ),
            ).toBeVisible();
        },
    );
    it('keeps flag-off and human description DOM identical', async () => {
        state.enabled = false;
        state.history[0].agentIdentity = buildAgentIdentityClaim({
            subject: { type: 'user', uuid: 'person' },
            surface: AgentActorSurface.MCP,
            clientId: null,
        });
        const { unmount } = await renderHistory();
        const original = screen.getByText('Updated by: Ada Lovelace').outerHTML;
        unmount();
        state.enabled = true;
        state.history[0].agentIdentity = null;
        await renderHistory();
        expect(screen.getByText('Updated by: Ada Lovelace').outerHTML).toBe(
            original,
        );
    });
});
