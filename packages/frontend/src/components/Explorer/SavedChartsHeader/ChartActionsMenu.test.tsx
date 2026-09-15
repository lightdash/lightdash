import { Ability } from '@casl/ability';
import { type PossibleAbilities } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../../api';
import { createExplorerStore } from '../../../features/explorer/store';
import { AbilityContext } from '../../../providers/Ability/context';
import { mockViewport } from '../../../testing/mockViewport';
import {
    manageChartRule,
    mockSavedChartResponse,
} from '../../../testing/savedChartResponse.mock';
import { renderWithProviders } from '../../../testing/testUtils';
import { buildDashboardEditorInitialState } from '../../DashboardTiles/buildDashboardEditorInitialState';
import ChartActionsMenu, { type ChartActionsHost } from './ChartActionsMenu';

const device = vi.hoisted(() => ({ isPhone: false }));
vi.mock('../../../hooks/useIsPhoneDevice', () => ({
    useIsPhoneDevice: () => device.isPhone,
}));
afterEach(() => {
    device.isPhone = false;
    vi.restoreAllMocks();
});

vi.mock('../../../api', () => ({
    lightdashApi: vi.fn(() => new Promise(() => {})),
}));

vi.mock('../../../hooks/useExplorerQuery', () => ({
    useExplorerQuery: () => ({ query: { data: undefined } }),
}));

vi.mock(
    '../../../ee/features/aiCopilot/components/AskAiAgentMenuItem/AskAiAgentMenuItem',
    () => ({
        AskAiAgentMenuItem: () => <button type="button">Ask AI Agent</button>,
    }),
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

const renderMenu = (
    host: ChartActionsHost,
    savedChart = chart,
    abilityRules = [manageChartRule],
) => {
    const onOpenVersionHistory = vi.fn();
    const store = createExplorerStore({
        explorer: buildDashboardEditorInitialState({
            exploreId: savedChart.tableName,
            editChart: savedChart,
            seededMetrics: [],
        }),
    });
    vi.mocked(lightdashApi).mockImplementation(() => new Promise(() => {}));
    renderWithProviders(
        <MemoryRouter
            initialEntries={['/projects/project-uuid/saved/chart-uuid']}
        >
            <AbilityContext.Provider
                value={new Ability<PossibleAbilities>(abilityRules)}
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
        { user: { abilityRules } },
    );
    return { onOpenVersionHistory };
};

describe('ChartActionsMenu', () => {
    it.each([false, true])(
        'uses phone capability for actions at tablet width (phone=%s)',
        async (isPhone) => {
            mockViewport(744);
            device.isPhone = isPhone;
            renderMenu('page');
            await userEvent.click(
                await screen.findByRole('button', { name: 'Chart actions' }),
            );
            const move = screen.queryByRole('menuitem', {
                name: 'Move to space',
            });
            if (isPhone) {
                expect(move).toBeNull();
                expect(screen.queryByText('Move to space')).toBeNull();
            } else expect(move).toBeVisible();
            expect(screen.getByText('Version history')).toBeVisible();
        },
    );

    it.each([390, 640, 744, 1280])(
        'preserves standalone chart authoring when resizing to %ipx',
        async (width) => {
            const viewport = mockViewport(1280);
            renderMenu('page', { ...chart, dashboardUuid: null });
            await userEvent.click(
                await screen.findByRole('button', { name: 'Chart actions' }),
            );
            viewport.resize(width);

            for (const name of [
                'Duplicate',
                'Add to dashboard',
                'Move chart',
                'Change URL slug',
            ]) {
                expect(screen.getByRole('menuitem', { name })).toBeVisible();
            }
        },
    );

    it('omits phone authoring entries without hiding version history', async () => {
        device.isPhone = true;
        mockViewport(390);
        renderMenu('page', { ...chart, dashboardUuid: null });
        await userEvent.click(
            await screen.findByRole('button', { name: 'Chart actions' }),
        );
        for (const name of [
            'Duplicate',
            'Add to dashboard',
            'Move chart',
            'Change URL slug',
        ]) {
            expect(screen.queryByText(name, { exact: true })).toBeNull();
        }
        expect(
            screen.getByRole('menuitem', { name: 'Version history' }),
        ).toBeVisible();
    });

    it('does not grant authoring to a viewer at a compact width', async () => {
        mockViewport(390);
        renderMenu('page', { ...chart, dashboardUuid: null }, []);
        expect(
            screen.queryByRole('button', { name: 'Chart actions' }),
        ).toBeNull();
    });

    it('in a modal host hides page-only items and opens history in place', async () => {
        const user = userEvent.setup();
        const { onOpenVersionHistory } = renderMenu('modal');

        await user.click(
            await screen.findByRole('button', { name: 'Chart actions' }),
        );

        expect(await screen.findByText('Version history')).toBeVisible();
        expect(screen.queryByText('Move to space')).toBeNull();
        expect(screen.getByText('Ask AI Agent')).toBeVisible();

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
