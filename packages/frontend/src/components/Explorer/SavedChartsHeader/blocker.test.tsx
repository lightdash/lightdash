import { Ability } from '@casl/ability';
import { type PossibleAbilities } from '@lightdash/common';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import {
    createMemoryRouter,
    RouterProvider,
    useLocation,
    useNavigate,
} from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../../api';
import {
    buildInitialExplorerState,
    createExplorerStore,
    explorerActions,
} from '../../../features/explorer/store';
import { AbilityContext } from '../../../providers/Ability/context';
import {
    manageChartRule,
    mockSavedChartResponse,
} from '../../../testing/savedChartResponse.mock';
import { renderWithProviders } from '../../../testing/testUtils';
import SavedChartsHeader from './index';

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

vi.mock('../../../providers/Fullscreen/useNativeFullscreenToggle', () => ({
    default: () => ({
        enabled: false,
        isFullscreen: false,
        handleToggleFullscreen: vi.fn(),
    }),
}));

vi.mock('../../../hooks/useProjectRoute', () => ({
    useOptionalProjectRoute: () => undefined,
    useProjectUrlIdentifier: () => 'jaffle-shop',
}));

const chart = mockSavedChartResponse();

const NavigationProbe = () => {
    const navigate = useNavigate();
    const location = useLocation();
    return (
        <div>
            <div data-testid="probe-location">
                {location.pathname}
                {location.search}
            </div>
            <button
                type="button"
                onClick={() =>
                    void navigate({ search: '?edited=1' }, { replace: true })
                }
            >
                write the search
            </button>
            <button
                type="button"
                onClick={() => void navigate('/projects/jaffle-shop/home')}
            >
                leave the chart
            </button>
        </div>
    );
};

const renderHeader = () => {
    const store = createExplorerStore({
        explorer: buildInitialExplorerState({
            savedChart: chart,
            isEditMode: true,
        }),
    });
    // An edit the user has not saved, so the blocker is armed
    store.dispatch(explorerActions.setRowLimit(25));
    vi.mocked(lightdashApi).mockImplementation(() => new Promise(() => {}));

    const router = createMemoryRouter(
        [
            {
                path: '/projects/:projectUuid/saved/:savedQueryUuid/:mode',
                element: (
                    <>
                        <SavedChartsHeader />
                        <NavigationProbe />
                    </>
                ),
            },
            { path: '*', element: <div>somewhere else</div> },
        ],
        {
            initialEntries: [`/projects/project-uuid/saved/${chart.uuid}/edit`],
        },
    );

    renderWithProviders(
        <AbilityContext.Provider
            value={new Ability<PossibleAbilities>([manageChartRule])}
        >
            <Provider store={store}>
                <RouterProvider router={router} />
            </Provider>
        </AbilityContext.Provider>,
        { user: { abilityRules: [manageChartRule] } },
    );
};

describe('SavedChartsHeader unsaved changes blocker', () => {
    it('lets the page write its own search while editing', async () => {
        const user = userEvent.setup();
        renderHeader();

        await user.click(await screen.findByText('write the search'));

        await waitFor(() =>
            expect(screen.getByTestId('probe-location')).toHaveTextContent(
                '?edited=1',
            ),
        );
        expect(screen.queryByText('Unsaved changes')).toBeNull();
    });

    it('still asks before leaving the chart', async () => {
        const user = userEvent.setup();
        renderHeader();

        await user.click(await screen.findByText('leave the chart'));

        expect(await screen.findByText('Unsaved changes')).toBeVisible();
    });
});
