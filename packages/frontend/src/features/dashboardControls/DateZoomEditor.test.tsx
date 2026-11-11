import {
    DateGranularity,
    type Dashboard,
    type DashboardTile,
    type DateZoomConfig,
} from '@lightdash/common';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type FC } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createDashboardTestStore,
    seedDashboardEditState,
} from '../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../testing/DashboardStoreTestProvider';
import { renderWithProviders } from '../../testing/testUtils';
import {
    selectCurrentDateZoomConfig,
    selectDateZoomGranularity,
} from '../dashboard/store';
import { DateZoomEditorProvider } from './DateZoomEditorProvider';
import { DateZoomPills, DefaultZoomPill } from './DateZoomPills';
import { ParameterEditorProvider } from './ParameterEditorProvider';
import {
    RailContractClasses,
    type RailContractClassNames,
} from './railContractClasses';
import { useDateZoomEditorSelector } from './useDateZoomEditor';

const { requestSwitch, track, embed, tileHoverOwner } = vi.hoisted(() => ({
    requestSwitch: vi.fn((proceed: () => void) => proceed()),
    tileHoverOwner: { current: null as string | null },
    track: vi.fn(),
    embed: { isEmbedded: false },
}));
vi.mock('../../ee/providers/Embed/useIsEmbedded', () => ({
    default: () => embed.isEmbedded,
}));
vi.mock('../../providers/Tracking/useTracking', () => ({
    default: () => ({ track }),
}));
vi.mock('./useControlsSidebar', () => ({
    useControlsSidebarSelector: (
        selector: (c: {
            isMapping: boolean;
            isSidebarOpen: boolean;
            isViewer: boolean;
            requestSwitch: typeof requestSwitch;
            tileHoverOwner: { current: string | null };
        }) => unknown,
    ) =>
        selector({
            isMapping: false,
            isSidebarOpen: false,
            isViewer: false,
            requestSwitch,
            tileHoverOwner,
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
    dateZoomGranularity,
    contractClasses = null,
}: {
    isViewer?: boolean;
    controlGranularities?: Record<string, string>;
    dateZoomGranularity?: DateGranularity;
    contractClasses?: RailContractClassNames | null;
} = {}) => {
    const store = createDashboardTestStore({
        isEditMode: !isViewer,
        controlGranularities,
        dateZoomGranularity,
        // tile-3 is in no zoom: the default zooms it
        chartZoomableFieldsByTileUuid: {
            'tile-3': [
                {
                    fieldId: 'orders_date',
                    label: 'Order date',
                    tableName: 'orders',
                },
            ],
        },
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
            <RailContractClasses.Provider value={contractClasses}>
                <ParameterEditorProvider isViewer={isViewer}>
                    <DateZoomEditorProvider isViewer={isViewer}>
                        <DateZoomPills />
                        <DefaultZoomPill />
                        <AddButton />
                        <button type="button" data-controls-pill="f1">
                            Region filter
                        </button>
                        {['tile-1', 'tile-2', 'tile-3'].map((uuid) => (
                            <div key={uuid} data-tile-uuid={uuid} />
                        ))}
                    </DateZoomEditorProvider>
                </ParameterEditorProvider>
            </RailContractClasses.Provider>
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
        embed.isEmbedded = false;
    });

    it("clears the viewer's pick in edit mode, except in embeds", () => {
        const app = setup({ dateZoomGranularity: DateGranularity.MONTH });
        expect(selectDateZoomGranularity(app.store.getState())).toBeUndefined();

        embed.isEmbedded = true;
        const embedded = setup({ dateZoomGranularity: DateGranularity.MONTH });
        expect(selectDateZoomGranularity(embedded.store.getState())).toBe(
            DateGranularity.MONTH,
        );
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

    it('sets and clears the default zoom in the dashboard draft', async () => {
        const { user } = setup();
        expect(pill('Default zoom')).toHaveTextContent('Default zoom is None');
        await user.click(pill('Default zoom'));
        expect(
            within(dialog()).getByText('Applies to the other 1 tile'),
        ).toBeInTheDocument();
        await user.click(
            within(dialog()).getByRole('combobox', { name: 'Default zoom' }),
        );
        await user.click(await screen.findByRole('option', { name: 'Month' }));
        await user.click(
            within(dialog()).getByRole('button', { name: 'Apply' }),
        );
        expect(pill('Default zoom')).toHaveTextContent('Default zoom is Month');

        await user.click(pill('Default zoom'));
        await user.click(
            within(dialog()).getByRole('button', { name: 'Clear grain' }),
        );
        await user.click(
            within(dialog()).getByRole('button', { name: 'Apply' }),
        );
        expect(pill('Default zoom')).toHaveTextContent('Default zoom is None');
    });

    it("applies a viewer's default zoom pick as the shipped menu did, tracked", async () => {
        const { user, store } = setup({ isViewer: true });
        await user.click(pill('Default zoom'));
        await user.click(
            within(dialog()).getByRole('combobox', { name: 'Default zoom' }),
        );
        await user.click(await screen.findByRole('option', { name: 'Week' }));
        await user.click(
            within(dialog()).getByRole('button', { name: 'Apply' }),
        );
        expect(store.getState().dateZoom.granularity).toBe(
            DateGranularity.WEEK,
        );
        expect(track).toHaveBeenCalledWith(
            expect.objectContaining({
                properties: { granularity: DateGranularity.WEEK },
            }),
        );

        // Cleared is the shipped "Reset to default": no runtime grain
        await user.click(pill('Default zoom'));
        await user.click(
            within(dialog()).getByRole('button', { name: 'Clear grain' }),
        );
        await user.click(
            within(dialog()).getByRole('button', { name: 'Apply' }),
        );
        expect(store.getState().dateZoom.granularity).toBeUndefined();
        expect(track).toHaveBeenLastCalledWith(
            expect.objectContaining({
                properties: { granularity: 'default' },
            }),
        );
    });

    it("puts an embed's date zoom contract classes on the pills and popovers", async () => {
        const { user } = setup({
            isViewer: true,
            contractClasses: {
                rail: 'rail',
                addFilterDropdown: 'add-list',
                filterDropdown: 'filter-list',
                parameter: 'ld-dashboard-parameter',
                parameterDropdown: 'ld-dashboard-parameter-dropdown',
                dateZoom: 'ld-dashboard-date-zoom',
                dateZoomDropdown: 'ld-dashboard-date-zoom-dropdown',
            },
        });
        for (const name of ['Revenue zoom', 'Default zoom']) {
            expect(pill(name)).toHaveClass('ld-dashboard-date-zoom');
            expect(pill(name)).not.toHaveClass('ld-dashboard-parameter');
            await user.click(pill(name));
            const dropdown = document.querySelector('[data-controls-editor]');
            expect(dropdown).toHaveClass('ld-dashboard-date-zoom-dropdown');
            expect(dropdown).not.toHaveClass('ld-dashboard-parameter-dropdown');
            await user.click(
                within(dialog()).getByRole('button', { name: 'Cancel' }),
            );
        }
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

    it('marks the tiles a zoom sets while its pill is hovered, as a filter pill does', async () => {
        const { user } = setup();
        const marked = () =>
            [
                ...document.querySelectorAll<HTMLElement>(
                    '[data-controls-hovered]',
                ),
            ].map((element) => element.dataset.tileUuid);
        await user.hover(pill('Revenue zoom'));
        expect(marked()).toEqual(['tile-1']);
        await user.unhover(pill('Revenue zoom'));
        await waitFor(() => expect(marked()).toEqual([]));
    });

    it('marks nothing for a viewer', async () => {
        const { user } = setup({ isViewer: true });
        await user.hover(pill('Revenue zoom'));
        expect(document.querySelector('[data-controls-hovered]')).toBeNull();
    });
});
