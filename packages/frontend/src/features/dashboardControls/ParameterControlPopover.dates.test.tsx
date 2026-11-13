import {
    type DashboardParameterControl,
    type DashboardTile,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MantineProvider from '../../providers/MantineProvider';
import {
    createDashboardTestStore,
    seedDashboardEditState,
} from '../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../testing/DashboardStoreTestProvider';
import { renderWithProviders } from '../../testing/testUtils';
import { dashboardParametersActions } from '../dashboard/store';
import { ParameterEditorProvider } from './ParameterEditorProvider';
import { ParameterPills } from './ParameterPills';

// A day picked in a date parameter's calendar must leave the parameter
// popover open with the value set: the real provider, pill, popover and
// date input, with Mantine's dropdowns portalled to the body as in the browser

vi.mock('../../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'project-1',
}));
vi.mock('../../providers/Dashboard/useDashboardContext', () => ({
    default: (selector: (c: { setParameter: () => void }) => unknown) =>
        selector({ setParameter: vi.fn() }),
}));
vi.mock('./useControlsEditor', () => ({
    useControlsEditorSelector: (
        selector: (c: {
            isMapping: boolean;
            requestSwitch: (proceed: () => void) => void;
            tileHoverOwner: { current: string | null };
        }) => unknown,
    ) =>
        selector({
            isMapping: false,
            requestSwitch: (proceed) => proceed(),
            tileHoverOwner: { current: null },
        }),
}));

const startControl: DashboardParameterControl = {
    id: 'start',
    label: 'Start',
    value: '2026-01-15',
    valueType: { type: 'date', multiple: false },
    parameters: { start: 'all' },
};

const renderBar = () => {
    const store = createDashboardTestStore({
        isEditMode: true,
        parameterDefinitions: { start: { label: 'Start', type: 'date' } },
    });
    store.dispatch(
        dashboardParametersActions.addParameterReferences({
            tileUuid: 'tile-1',
            references: ['start'],
        }),
    );
    seedDashboardEditState(store, {
        dashboardTiles: [{ uuid: 'tile-1' } as DashboardTile],
    });
    store.dispatch(
        dashboardParametersActions.syncParameterControls({
            controls: [startControl],
            isSaved: true,
        }),
    );
    renderWithProviders(
        // Mantine's test env renders dropdowns in place; the case under test
        // needs them portalled to the body
        <MantineProvider env="default">
            <DashboardStoreTestProvider store={store}>
                <ParameterEditorProvider isViewer={false}>
                    <ParameterPills />
                    <button type="button">Outside</button>
                </ParameterEditorProvider>
            </DashboardStoreTestProvider>
        </MantineProvider>,
    );
    return store;
};

// `hidden`: jsdom has no layout, so Mantine marks portalled dropdowns hidden
const popover = () =>
    screen.queryByRole('dialog', { name: 'Start', hidden: true });

const openPopover = async (user: ReturnType<typeof userEvent.setup>) => {
    const pill = document.querySelector<HTMLElement>(
        '[data-parameter-pill="start"]',
    );
    if (pill === null) throw new Error('No pill');
    await user.click(pill);
    expect(popover()).toBeInTheDocument();
};

describe('the parameter popover with a date calendar', () => {
    // Mantine's focus trap warns, with the node, about a popover that has
    // just closed; the app's console capture cannot serialise that node
    beforeEach(() => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('a date parameter: picking a day keeps the popover open with the value set', async () => {
        const user = userEvent.setup();
        const store = renderBar();
        await openPopover(user);
        const dialog = popover();
        if (dialog === null) throw new Error('No popover');
        await user.click(
            screen
                .getAllByRole('button', {
                    name: /2026/,
                    hidden: true,
                })
                .find((button) => dialog.contains(button)) as HTMLElement,
        );
        const day = await screen.findByRole('button', {
            name: '20 January 2026',
            hidden: true,
        });
        // The shipped date input keeps its calendar in place (not portalled)
        expect(dialog.contains(day)).toBe(true);
        await user.click(day);
        expect(popover()).toBeInTheDocument();

        await user.click(
            screen.getByRole('button', { name: 'Apply', hidden: true }),
        );
        expect(store.getState().parameters.parameterControls?.[0].value).toBe(
            '2026-01-20',
        );
    });

    it('still closes on a press outside the popover and its calendar', async () => {
        const user = userEvent.setup();
        renderBar();
        await openPopover(user);
        await user.click(screen.getByRole('button', { name: 'Outside' }));
        expect(popover()).not.toBeInTheDocument();
    });
});
