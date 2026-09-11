import { Ability } from '@casl/ability';
import { type PossibleAbilities } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../../api';
import { createExplorerStore } from '../../../features/explorer/store';
import { AbilityContext } from '../../../providers/Ability/context';
import {
    manageChartRule,
    mockSavedChartResponse,
} from '../../../testing/savedChartResponse.mock';
import { renderWithProviders } from '../../../testing/testUtils';
import { buildDashboardEditorInitialState } from '../../DashboardTiles/buildDashboardEditorInitialState';
import ChartActionsMenu, { type ChartActionsHost } from './ChartActionsMenu';

vi.mock('../../../api', () => ({
    lightdashApi: vi.fn(() => new Promise(() => {})),
}));

vi.mock('../../../hooks/useExplorerQuery', () => ({
    useExplorerQuery: () => ({ query: { data: undefined } }),
}));

vi.mock(
    '../../../ee/features/aiCopilot/components/AskAiAgentMenuItem/AskAiAgentMenuItem',
    () => ({ AskAiAgentMenuItem: () => null }),
);

vi.mock('../../../hooks/useProjectRoute', () => ({
    useOptionalProjectRoute: () => undefined,
    useProjectUrlIdentifier: () => 'project-uuid',
}));

const chart = mockSavedChartResponse({
    spaceUuid: 'space-uuid',
    spaceName: 'Payments',
    dashboardUuid: 'dashboard-uuid',
});

const renderMenu = (host: ChartActionsHost) => {
    const onOpenVersionHistory = vi.fn();
    const store = createExplorerStore({
        explorer: buildDashboardEditorInitialState({
            exploreId: chart.tableName,
            editChart: chart,
            seededMetrics: [],
        }),
    });
    vi.mocked(lightdashApi).mockImplementation(() => new Promise(() => {}));
    renderWithProviders(
        <MemoryRouter
            initialEntries={['/projects/project-uuid/saved/chart-uuid']}
        >
            <AbilityContext.Provider
                value={new Ability<PossibleAbilities>([manageChartRule])}
            >
                <Provider store={store}>
                    <ChartActionsMenu
                        host={host}
                        onOpenVersionHistory={onOpenVersionHistory}
                        onDeleted={vi.fn()}
                        onMovedToSpace={vi.fn()}
                    />
                </Provider>
            </AbilityContext.Provider>
        </MemoryRouter>,
        { user: { abilityRules: [manageChartRule] } },
    );
    return { onOpenVersionHistory };
};

describe('ChartActionsMenu', () => {
    it('in a modal host hides page-only items and opens history in place', async () => {
        const user = userEvent.setup();
        const { onOpenVersionHistory } = renderMenu('modal');

        await user.click(
            await screen.findByRole('button', { name: 'Chart actions' }),
        );

        expect(await screen.findByText('Version history')).toBeVisible();
        expect(screen.queryByText('Move to space')).toBeNull();

        await user.click(screen.getByText('Version history'));
        expect(onOpenVersionHistory).toHaveBeenCalledTimes(1);
    });

    it('on the chart page keeps the dashboard chart move', async () => {
        const user = userEvent.setup();
        const { onOpenVersionHistory } = renderMenu('page');

        await user.click(
            await screen.findByRole('button', { name: 'Chart actions' }),
        );

        expect(await screen.findByText('Move to space')).toBeInTheDocument();

        await user.click(screen.getByText('Version history'));
        expect(onOpenVersionHistory).toHaveBeenCalledTimes(1);
    });
});
