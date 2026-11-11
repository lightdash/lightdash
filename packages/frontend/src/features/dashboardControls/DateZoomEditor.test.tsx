import {
    DateGranularity,
    type Dashboard,
    type DashboardTile,
    type DateZoomConfig,
} from '@lightdash/common';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type FC } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createDashboardTestStore,
    seedDashboardEditState,
} from '../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../testing/DashboardStoreTestProvider';
import { renderWithProviders } from '../../testing/testUtils';
import { selectCurrentDateZoomConfig } from '../dashboard/store';
import { DateZoomEditorProvider } from './DateZoomEditorProvider';
import { DateZoomPills } from './DateZoomPills';
import { ParameterEditorProvider } from './ParameterEditorProvider';
import { useDateZoomEditorSelector } from './useDateZoomEditor';

const { requestSwitch } = vi.hoisted(() => ({
    requestSwitch: vi.fn((proceed: () => void) => proceed()),
}));
vi.mock('./useControlsSidebar', () => ({
    useControlsSidebarSelector: (
        selector: (c: {
            isMapping: boolean;
            isSidebarOpen: boolean;
            isViewer: boolean;
            requestSwitch: typeof requestSwitch;
        }) => unknown,
    ) =>
        selector({
            isMapping: false,
            isSidebarOpen: false,
            isViewer: false,
            requestSwitch,
        }),
}));

const tile = (uuid: string) =>
    ({ uuid, type: 'saved_chart', properties: {} }) as DashboardTile;

const saved: DateZoomConfig = {
    controls: [
        {
            uuid: 'z1',
            name: 'Revenue zoom',
            granularity: DateGranularity.WEEK,
        },
        {
            uuid: 'z2',
            name: 'Orders zoom',
            granularity: DateGranularity.MONTH,
            hidden: true,
        },
    ],
    tileTargets: {
        'tile-1': {
            controlUuid: 'z1',
            fieldId: 'orders_date',
            tableName: 'orders',
        },
        'tile-2': {
            controlUuid: 'z2',
            fieldId: 'orders_date',
            tableName: 'orders',
        },
    },
};

const AddButton: FC = () => {
    const add = useDateZoomEditorSelector((c) => c.add);
    return <button onClick={() => add(null)}>Add it</button>;
};

const setup = ({
    isViewer = false,
    controlGranularities = {},
}: {
    isViewer?: boolean;
    controlGranularities?: Record<string, string>;
} = {}) => {
    const store = createDashboardTestStore({
        isEditMode: !isViewer,
        controlGranularities,
        source: {
            embedDashboard: {
                config: { isDateZoomDisabled: false, dateZoomConfig: saved },
            } as Dashboard,
        },
    });
    seedDashboardEditState(store, {
        dashboardTiles: ['tile-1', 'tile-2', 'tile-3'].map(tile),
    });
    const user = userEvent.setup();
    renderWithProviders(
        <DashboardStoreTestProvider store={store}>
            <ParameterEditorProvider isViewer={isViewer}>
                <DateZoomEditorProvider isViewer={isViewer}>
                    <DateZoomPills />
                    <AddButton />
                    <button type="button" data-controls-pill="f1">
                        Region filter
                    </button>
                </DateZoomEditorProvider>
            </ParameterEditorProvider>
        </DashboardStoreTestProvider>,
    );
    const config = () => selectCurrentDateZoomConfig(store.getState());
    return { store, user, config };
};

const pill = (name: string) =>
    screen.getByRole('button', { name: new RegExp(`^${name} is`) });
const dialog = () => screen.getByRole('dialog');

describe('Date zoom editor', () => {
    beforeEach(() => {
        requestSwitch.mockClear();
    });

    it('shows each zoom as "name is grain", hidden ones with their cue', () => {
        setup();
        expect(pill('Revenue zoom')).toHaveTextContent('Revenue zoom is Week');
        expect(pill('Orders zoom')).toHaveAttribute('data-hidden', 'true');
        // Saved: not dashed
        expect(pill('Revenue zoom')).not.toHaveAttribute('data-temporary');
    });

    it('applies a new grain and name to the dashboard draft only on Apply', async () => {
        const { user, config } = setup();
        await user.click(pill('Revenue zoom'));
        expect(requestSwitch).toHaveBeenCalled();
        await user.click(
            within(dialog()).getByRole('combobox', { name: 'Revenue zoom' }),
        );
        await user.click(await screen.findByRole('option', { name: 'Day' }));
        await user.click(
            within(dialog()).getByRole('button', { name: 'Rename' }),
        );
        await user.clear(
            within(dialog()).getByRole('textbox', { name: 'Name' }),
        );
        await user.keyboard('Sales zoom{Enter}');
        expect(config().controls[0]).toEqual(saved.controls[0]);
        await user.click(
            within(dialog()).getByRole('button', { name: 'Apply' }),
        );
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(config().controls[0]).toEqual({
            uuid: 'z1',
            name: 'Sales zoom',
            granularity: DateGranularity.DAY,
        });
        expect(pill('Sales zoom')).toHaveFocus();
    });

    it('drops the draft on Cancel', async () => {
        const { user, config } = setup();
        await user.click(pill('Revenue zoom'));
        await user.click(
            within(dialog()).getByRole('combobox', { name: 'Revenue zoom' }),
        );
        await user.click(await screen.findByRole('option', { name: 'Day' }));
        await user.click(
            within(dialog()).getByRole('button', { name: 'Cancel' }),
        );
        expect(config()).toEqual(saved);
    });

    it('hides a zoom from viewers in Settings', async () => {
        const { user, config } = setup();
        await user.click(pill('Revenue zoom'));
        await user.click(
            within(dialog()).getByRole('button', { name: 'Settings' }),
        );
        await user.click(
            within(dialog()).getByRole('switch', { name: 'Show to viewers' }),
        );
        await user.click(
            within(dialog()).getByRole('button', { name: 'Apply' }),
        );
        expect(config().controls[0].hidden).toBe(true);
        expect(pill('Revenue zoom')).toHaveAttribute('data-hidden', 'true');
    });

    it('removes a zoom and its tile targets with its X', async () => {
        const { user, config } = setup();
        await user.click(
            within(pill('Revenue zoom').parentElement!).getByRole('button', {
                name: 'Remove date zoom',
            }),
        );
        expect(config().controls.map(({ uuid }) => uuid)).toEqual(['z2']);
        expect(Object.keys(config().tileTargets)).toEqual(['tile-2']);
    });

    it('opens a new zoom on its name, at the first grain, with Apply blocked', async () => {
        const { user, config } = setup();
        await user.click(screen.getByRole('button', { name: 'Add it' }));
        expect(
            within(dialog()).getByRole('textbox', { name: 'Name' }),
        ).toHaveFocus();
        expect(pill('Date zoom')).toHaveAttribute('data-temporary', 'true');
        expect(
            within(dialog()).getByRole('button', { name: 'Apply' }),
        ).toBeDisabled();
        await user.keyboard('{Enter}');
        await user.click(
            within(dialog()).getByRole('button', { name: 'Cancel' }),
        );
        expect(screen.queryByRole('button', { name: /^Date zoom is/ })).toBe(
            null,
        );
        expect(config()).toEqual(saved);
    });

    it("clears a viewer's override for the zoom an editor opens", async () => {
        const { user, store } = setup({
            controlGranularities: { z1: DateGranularity.YEAR },
        });
        await user.click(pill('Revenue zoom'));
        expect(store.getState().dateZoom.controlGranularities).toEqual({});
    });

    it('asks before switching away from unapplied changes', async () => {
        const { user, config } = setup();
        await user.click(pill('Revenue zoom'));
        await user.click(
            within(dialog()).getByRole('combobox', { name: 'Revenue zoom' }),
        );
        await user.click(await screen.findByRole('option', { name: 'Day' }));
        await user.click(pill('Orders zoom'));
        expect(
            screen.getByText('Apply changes to Revenue zoom first?'),
        ).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Discard' }));
        expect(
            screen.getByRole('dialog', { name: 'Orders zoom' }),
        ).toBeVisible();
        expect(config()).toEqual(saved);
    });

    it("switches to another kind's pill: at once when clean, after asking when not", async () => {
        const { user } = setup();
        const filterPill = screen.getByRole('button', {
            name: 'Region filter',
        });
        await user.click(pill('Revenue zoom'));
        await user.click(filterPill);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

        await user.click(pill('Revenue zoom'));
        await user.click(
            within(dialog()).getByRole('combobox', { name: 'Revenue zoom' }),
        );
        await user.click(await screen.findByRole('option', { name: 'Day' }));
        await user.click(filterPill);
        expect(
            screen.getByText('Apply changes to Revenue zoom first?'),
        ).toBeInTheDocument();
    });

    it("applies a viewer's pick at once, and clearing goes back to the saved grain", async () => {
        const { user, store } = setup({ isViewer: true });
        // A hidden zoom is an editor's to see
        expect(
            screen.queryByRole('button', { name: /^Orders zoom/ }),
        ).not.toBeInTheDocument();
        await user.click(pill('Revenue zoom'));
        await user.click(
            within(dialog()).getByRole('combobox', { name: 'Revenue zoom' }),
        );
        await user.click(await screen.findByRole('option', { name: 'Month' }));
        await user.click(
            within(dialog()).getByRole('button', { name: 'Apply' }),
        );
        expect(store.getState().dateZoom.controlGranularities).toEqual({
            z1: DateGranularity.MONTH,
        });
        expect(pill('Revenue zoom')).toHaveTextContent('Revenue zoom is Month');

        await user.click(pill('Revenue zoom'));
        expect(
            within(dialog()).getByText(
                'If cleared, tiles use the saved grain, Week.',
            ),
        ).toBeInTheDocument();
        await user.click(
            within(dialog()).getByRole('button', { name: 'Clear grain' }),
        );
        await user.click(
            within(dialog()).getByRole('button', { name: 'Apply' }),
        );
        expect(store.getState().dateZoom.controlGranularities).toEqual({});
    });

    it('cancels on Escape', async () => {
        const { user, config } = setup();
        await user.click(pill('Revenue zoom'));
        await user.click(
            within(dialog()).getByRole('combobox', { name: 'Revenue zoom' }),
        );
        await user.click(await screen.findByRole('option', { name: 'Day' }));
        await act(async () => {
            await user.keyboard('{Escape}');
        });
        expect(config()).toEqual(saved);
    });
});
