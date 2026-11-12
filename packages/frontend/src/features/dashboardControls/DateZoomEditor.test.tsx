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
import { DateZoomPills, DefaultZoomButton } from './DateZoomPills';
import { ParameterEditorProvider } from './ParameterEditorProvider';
import {
    RailContractClasses,
    type RailContractClassNames,
} from './railContractClasses';
import { useDateZoomEditorSelector } from './useDateZoomEditor';

const {
    requestSwitch,
    track,
    embed,
    tileHoverOwner,
    removeParameter,
    openFilter,
    removeFilter,
} = vi.hoisted(() => ({
    requestSwitch: vi.fn((proceed: () => void) => proceed()),
    removeParameter: vi.fn(),
    openFilter: vi.fn(),
    removeFilter: vi.fn(),
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
    config: savedConfig = saved,
}: {
    config?: DateZoomConfig;
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
                config: {
                    isDateZoomDisabled: false,
                    dateZoomConfig: savedConfig,
                },
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
                        <DefaultZoomButton withDivider />
                        <AddButton />
                        <button type="button" data-controls-pill="f1">
                            Region filter
                        </button>
                        {/* As a filter pill: its X inside the pill */}
                        <div data-controls-pill="f2" onClick={openFilter}>
                            Status filter
                            <button
                                type="button"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    removeFilter();
                                }}
                            >
                                Remove filter
                            </button>
                        </div>
                        <button
                            type="button"
                            data-parameter-pill-action
                            onClick={removeParameter}
                        >
                            Remove parameter
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

// "Revenue zoom is Week"; the default zoom's button reads "Default zoom Month"
const pill = (name: string) =>
    screen.getByRole('button', { name: new RegExp(`^${name} `) });
const dialog = () => screen.getByRole('dialog');

describe('Date zoom editor', () => {
    beforeEach(() => {
        requestSwitch.mockReset();
        track.mockClear();
        requestSwitch.mockImplementation((proceed: () => void) => proceed());
        removeParameter.mockClear();
        openFilter.mockClear();
        removeFilter.mockClear();
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

    const removeButton = (name: string) =>
        within(pill(name).parentElement!).getByRole('button', {
            name: 'Remove date zoom',
        });
    // The prompt's own Apply, not the popover's
    const promptButton = (name: 'Apply' | 'Discard') =>
        within(
            screen.getByText('Apply changes to Revenue zoom first?')
                .parentElement as HTMLElement,
        ).getByRole('button', { name });
    const editRevenue = async (
        user: ReturnType<typeof userEvent.setup>,
        grain = 'Day',
    ) => {
        await user.click(pill('Revenue zoom'));
        await user.click(
            within(dialog()).getByRole('combobox', { name: 'Revenue zoom' }),
        );
        await user.click(await screen.findByRole('option', { name: grain }));
    };

    it("asks before another zoom's X removes it, then removes it on Apply or Discard", async () => {
        const { user, config } = setup();
        await editRevenue(user);
        await user.click(removeButton('Orders zoom'));
        expect(config()).toEqual(saved);
        await user.click(promptButton('Apply'));
        expect(config().controls).toEqual([
            { ...saved.controls[0], granularity: DateGranularity.DAY },
        ]);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it("discards, then removes, on another zoom's X", async () => {
        const { user, config } = setup();
        await editRevenue(user);
        await user.click(removeButton('Orders zoom'));
        await user.click(screen.getByRole('button', { name: 'Discard' }));
        expect(config().controls).toEqual([saved.controls[0]]);
    });

    it("removes at once on another zoom's X when nothing is unapplied", async () => {
        const { user, config } = setup();
        await user.click(pill('Revenue zoom'));
        await user.click(removeButton('Orders zoom'));
        expect(
            screen.queryByText('Apply changes to Revenue zoom first?'),
        ).not.toBeInTheDocument();
        expect(config().controls).toEqual([saved.controls[0]]);
    });

    it("waits on a filter's edit before a zoom's X removes it", async () => {
        const { user, config } = setup();
        requestSwitch.mockImplementationOnce(() => {});
        await user.click(removeButton('Orders zoom'));
        expect(requestSwitch).toHaveBeenCalledTimes(1);
        expect(config()).toEqual(saved);
        act(() => requestSwitch.mock.calls[0][0]());
        expect(config().controls).toEqual([saved.controls[0]]);
    });

    it('moves a zoom one place with Alt and an arrow on a bar without sections, keeping focus', async () => {
        const { user, config } = setup();
        pill('Revenue zoom').focus();
        await user.keyboard('{Alt>}{ArrowRight}{/Alt}');
        expect(config().controls.map(({ uuid }) => uuid)).toEqual(['z2', 'z1']);
        expect(
            screen.getByText('Revenue zoom moved after Orders zoom'),
        ).toBeInTheDocument();
        await waitFor(() => expect(pill('Revenue zoom')).toHaveFocus());
        // Nothing past the end
        await user.keyboard('{Alt>}{ArrowRight}{/Alt}');
        expect(config().controls.map(({ uuid }) => uuid)).toEqual(['z2', 'z1']);
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

    it("treats another kind's X as a switch, not a press outside", async () => {
        const { user } = setup();
        const removeButton = screen.getByRole('button', {
            name: 'Remove parameter',
        });
        await user.click(pill('Revenue zoom'));
        await user.click(
            within(dialog()).getByRole('combobox', { name: 'Revenue zoom' }),
        );
        await user.click(await screen.findByRole('option', { name: 'Day' }));
        await user.click(removeButton);
        expect(
            screen.getByText('Apply changes to Revenue zoom first?'),
        ).toBeInTheDocument();
        expect(removeParameter).not.toHaveBeenCalled();
        await user.click(screen.getByRole('button', { name: 'Discard' }));
        expect(removeParameter).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it.each(['Apply', 'Discard'] as const)(
        "replays another kind's X after %s, not its pill",
        async (answer) => {
            const { user } = setup();
            await editRevenue(user);
            await user.click(
                screen.getByRole('button', { name: 'Remove filter' }),
            );
            expect(removeFilter).not.toHaveBeenCalled();
            await user.click(promptButton(answer));
            expect(removeFilter).toHaveBeenCalledTimes(1);
            expect(openFilter).not.toHaveBeenCalled();

            // Applied, the grain is Day: another one makes it unapplied again
            await editRevenue(user, 'Month');
            await user.click(
                screen.getByRole('button', { name: 'Remove parameter' }),
            );
            expect(removeParameter).not.toHaveBeenCalled();
            await user.click(promptButton(answer));
            expect(removeParameter).toHaveBeenCalledTimes(1);
        },
    );

    it("picks a viewer's grain from the shipped menu at once, and resets it", async () => {
        const { user, store } = setup({ isViewer: true });
        // A hidden zoom is an editor's to see
        expect(
            screen.queryByRole('button', { name: /^Orders zoom/ }),
        ).not.toBeInTheDocument();
        await user.click(pill('Revenue zoom'));
        expect(screen.getByText('Granularity')).toBeInTheDocument();
        // The current grain is there but can't be picked again
        expect(screen.getByRole('menuitem', { name: 'Week' })).toBeDisabled();
        await user.click(screen.getByRole('menuitem', { name: 'Month' }));
        expect(store.getState().dateZoom.controlGranularities).toEqual({
            z1: DateGranularity.MONTH,
        });
        expect(pill('Revenue zoom')).toHaveTextContent('Revenue zoom is Month');
        // No popover, no draft: nothing to apply or cancel
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Apply' }),
        ).not.toBeInTheDocument();
        // A viewer's menu never asks about unapplied changes
        expect(requestSwitch).not.toHaveBeenCalled();
        // As the shipped pill's menu: untracked
        expect(track).not.toHaveBeenCalled();

        await user.click(pill('Revenue zoom'));
        await user.click(
            screen.getByRole('menuitem', { name: 'Reset to default' }),
        );
        expect(store.getState().dateZoom.controlGranularities).toEqual({});
        expect(pill('Revenue zoom')).toHaveTextContent('Revenue zoom is Week');
    });

    it('opens from the keyboard and returns focus to the pill on Escape', async () => {
        const { user, store } = setup({ isViewer: true });
        pill('Revenue zoom').focus();
        await user.keyboard('{Enter}');
        await waitFor(() =>
            expect(
                screen.getByRole('menuitem', { name: 'Day' }),
            ).toBeInTheDocument(),
        );
        await user.keyboard('{Escape}');
        await waitFor(() =>
            expect(
                screen.queryByRole('menuitem', { name: 'Day' }),
            ).not.toBeInTheDocument(),
        );
        expect(pill('Revenue zoom')).toHaveFocus();
        expect(store.getState().dateZoom.controlGranularities).toEqual({});
    });

    describe('a named zoom whose uuid is "default-zoom"', () => {
        const named: DateZoomConfig = {
            controls: [{ ...saved.controls[0], uuid: 'default-zoom' }],
            tileTargets: {
                'tile-1': {
                    ...saved.tileTargets['tile-1'],
                    controlUuid: 'default-zoom',
                },
            },
        };
        const pickGrain = async (
            user: ReturnType<typeof userEvent.setup>,
            name: string,
            grain: string,
        ) => {
            await user.click(pill(name));
            await user.click(within(dialog()).getByRole('combobox', { name }));
            await user.click(
                await screen.findByRole('option', { name: grain }),
            );
            await user.click(
                within(dialog()).getByRole('button', { name: 'Apply' }),
            );
        };

        it("takes a viewer's pick for its own tiles, not the default's", async () => {
            const { user, store } = setup({ isViewer: true, config: named });
            await user.click(pill('Revenue zoom'));
            await user.click(screen.getByRole('menuitem', { name: 'Day' }));
            expect(store.getState().dateZoom.controlGranularities).toEqual({
                'default-zoom': DateGranularity.DAY,
            });
            expect(store.getState().dateZoom.granularity).toBeUndefined();
        });

        it("applies an editor's rename and grain", async () => {
            const { user, config } = setup({ config: named });
            await user.click(pill('Revenue zoom'));
            await user.click(
                within(dialog()).getByRole('combobox', {
                    name: 'Revenue zoom',
                }),
            );
            await user.click(
                await screen.findByRole('option', { name: 'Day' }),
            );
            await user.click(
                within(dialog()).getByRole('button', { name: 'Rename' }),
            );
            await user.clear(
                within(dialog()).getByRole('textbox', { name: 'Name' }),
            );
            await user.keyboard('Sales zoom{Enter}');
            await user.click(
                within(dialog()).getByRole('button', { name: 'Apply' }),
            );
            expect(config().controls).toEqual([
                {
                    uuid: 'default-zoom',
                    name: 'Sales zoom',
                    granularity: DateGranularity.DAY,
                },
            ]);
        });

        it('leaves the Default zoom button editing the default, switching from the named zoom', async () => {
            const { user, config } = setup({ config: named });
            await user.click(pill('Revenue zoom'));
            await pickGrain(user, 'Default zoom', 'Month');
            expect(pill('Default zoom')).toHaveTextContent(
                'Default zoom Month',
            );
            expect(pill('Revenue zoom')).toHaveTextContent(
                'Revenue zoom is Week',
            );
            expect(config()).toEqual(named);
        });
    });

    it('sets and clears the default zoom in the dashboard draft', async () => {
        const { user } = setup();
        expect(pill('Default zoom')).toHaveTextContent('Default zoom None');
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
        expect(pill('Default zoom')).toHaveTextContent('Default zoom Month');

        await user.click(pill('Default zoom'));
        await user.click(
            within(dialog()).getByRole('button', { name: 'Clear grain' }),
        );
        await user.click(
            within(dialog()).getByRole('button', { name: 'Apply' }),
        );
        expect(pill('Default zoom')).toHaveTextContent('Default zoom None');
    });

    it("picks a viewer's default zoom from the shipped menu, tracked", async () => {
        const { user, store } = setup({ isViewer: true });
        await user.click(screen.getByRole('button', { name: 'Default zoom' }));
        await user.click(screen.getByRole('menuitem', { name: 'Week' }));
        expect(store.getState().dateZoom.granularity).toBe(
            DateGranularity.WEEK,
        );
        expect(track).toHaveBeenLastCalledWith(
            expect.objectContaining({
                properties: { granularity: DateGranularity.WEEK },
            }),
        );
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(requestSwitch).not.toHaveBeenCalled();

        // "None" is the shipped clear: no runtime grain
        await user.click(
            screen.getByRole('button', { name: 'Default zoom · Week' }),
        );
        await user.click(screen.getByRole('menuitem', { name: 'None' }));
        expect(store.getState().dateZoom.granularity).toBeUndefined();
        expect(track).toHaveBeenLastCalledWith(
            expect.objectContaining({
                properties: { granularity: 'default' },
            }),
        );
    });

    it("puts an embed's date zoom contract classes on the pills and menus", async () => {
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
        const triggers = [
            pill('Revenue zoom'),
            screen.getByRole('button', { name: 'Default zoom' }),
        ];
        for (const trigger of triggers) {
            expect(trigger.closest('.ld-dashboard-date-zoom')).not.toBeNull();
            await user.click(trigger);
            const item = screen.getByRole('menuitem', { name: 'Day' });
            expect(
                item.closest('.ld-dashboard-date-zoom-dropdown'),
            ).not.toBeNull();
            expect(item.closest('.ld-dashboard-parameter-dropdown')).toBeNull();
            await user.keyboard('{Escape}');
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
