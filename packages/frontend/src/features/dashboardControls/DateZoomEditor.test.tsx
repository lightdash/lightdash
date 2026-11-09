import {
    DateGranularity,
    EMPTY_DATE_ZOOM_CONFIG,
    type DashboardTile,
    type DateZoomConfig,
} from '@lightdash/common';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
    createDashboardTestStore,
    seedDashboardEditState,
} from '../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../testing/DashboardStoreTestProvider';
import { renderWithProviders } from '../../testing/testUtils';
import {
    dashboardDateZoomActions,
    dashboardEditActions,
    type DashboardStore,
} from '../dashboard/store';
import { selectDateZoomConfig } from '../dashboard/store/dashboardEditSelectors';
import { DateZoomEditorPills } from './DateZoomEditorPills';
import { DateZoomEditorProvider } from './DateZoomEditorProvider';

const { holder } = vi.hoisted(() => ({
    holder: { store: null as DashboardStore | null },
}));
vi.mock('../../providers/Dashboard/useDashboardContext', () => ({
    default: (selector: (c: Record<string, unknown>) => unknown) =>
        selector({
            dashboard: undefined,
            setDateZoomConfig: (value: DateZoomConfig) =>
                holder.store?.dispatch(
                    dashboardEditActions.setDateZoomConfig({
                        value,
                        changed: true,
                        saved: EMPTY_DATE_ZOOM_CONFIG,
                    }),
                ),
            setControlGranularity: (
                controlUuid: string,
                granularity: string | undefined,
            ) =>
                holder.store?.dispatch(
                    dashboardDateZoomActions.setControlGranularity({
                        controlUuid,
                        granularity,
                    }),
                ),
        }),
}));
vi.mock('./useControlsSidebar', () => ({
    useControlsSidebarSelector: (
        selector: (c: Record<string, unknown>) => unknown,
    ) =>
        selector({
            isSidebarOpen: false,
            isViewer: false,
            isMapping: false,
            requestSwitch: (proceed: () => void) => proceed(),
        }),
}));

const tile = (uuid: string) =>
    ({
        uuid,
        type: 'saved_chart',
        properties: { title: uuid, chartName: uuid },
    }) as DashboardTile;

const zoomableField = (uuid: string) => [
    { fieldId: `${uuid}_date`, label: 'Order date', tableName: 'orders' },
];

const config: DateZoomConfig = {
    controls: [
        { uuid: 'revenue', name: 'Revenue zoom', granularity: 'Month' },
        { uuid: 'orders', name: 'Orders zoom', granularity: 'Week' },
    ],
    tileTargets: {
        a: { controlUuid: 'revenue', fieldId: 'a_date', tableName: 'orders' },
        b: { controlUuid: 'orders', fieldId: 'b_date', tableName: 'orders' },
    },
};

const setup = ({
    controlGranularities,
    defaultDateZoomGranularity,
}: {
    controlGranularities?: Record<string, string>;
    defaultDateZoomGranularity?: DateGranularity;
} = {}) => {
    const store = createDashboardTestStore({
        isEditMode: true,
        chartZoomableFieldsByTileUuid: {
            a: zoomableField('a'),
            b: zoomableField('b'),
            c: zoomableField('c'),
        },
        controlGranularities,
    });
    holder.store = store;
    seedDashboardEditState(store, {
        dashboardTiles: ['a', 'b', 'c'].map(tile),
        dateZoomConfig: config,
        dateZoomGranularities: [
            DateGranularity.DAY,
            DateGranularity.WEEK,
            DateGranularity.MONTH,
        ],
        defaultDateZoomGranularity,
    });
    const user = userEvent.setup();
    const ui = (isViewer: boolean) => (
        <DashboardStoreTestProvider store={store}>
            <DateZoomEditorProvider isViewer={isViewer}>
                <button data-controls-pill="filter-1">Country filter</button>
                <DateZoomEditorPills />
            </DateZoomEditorProvider>
        </DashboardStoreTestProvider>
    );
    const { rerender } = renderWithProviders(ui(false));
    // Browser Back, without a remount
    const leaveEditMode = () => rerender(ui(true));
    const saved = () =>
        selectDateZoomConfig(store.getState(), EMPTY_DATE_ZOOM_CONFIG);
    const isChanged = () => store.getState().edit.dateZoomConfig?.changed;
    return { store, user, saved, isChanged, leaveEditMode };
};

const pill = (uuid: string) =>
    document.querySelector<HTMLElement>(`[data-date-zoom-pill="${uuid}"]`)!;

const pickGranularity = async (
    user: ReturnType<typeof userEvent.setup>,
    label: string,
) => {
    await user.click(screen.getByRole('combobox', { name: 'Granularity' }));
    await user.click(await screen.findByRole('option', { name: label }));
};

describe('editing a date zoom in the controls editor', () => {
    it('opens the zoom under its pill with its grain and tiles', async () => {
        const { user } = setup();
        expect(pill('revenue')).toHaveTextContent('Revenue zoom · Month');
        await user.click(pill('revenue'));
        const dialog = screen.getByRole('dialog', { name: 'Revenue zoom' });
        expect(
            within(dialog).getByRole('combobox', { name: 'Granularity' }),
        ).toHaveValue('Month');
        expect(dialog).toHaveTextContent('Zooms 1 of 3 tiles');
        expect(
            within(dialog).getByRole('button', { name: 'Apply' }),
        ).toBeEnabled();
    });

    it('writes the draft only on Apply', async () => {
        const { user, saved } = setup();
        await user.click(pill('revenue'));
        await pickGranularity(user, 'Day');
        expect(saved().controls[0].granularity).toBe('Month');
        await user.click(screen.getByRole('button', { name: 'Apply' }));
        expect(saved().controls[0].granularity).toBe('Day');
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(pill('revenue')).toHaveFocus();
    });

    it('Cancel and Escape leave the dashboard as it was', async () => {
        const { user, saved } = setup();
        await user.click(pill('revenue'));
        await pickGranularity(user, 'Day');
        await user.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(saved()).toEqual(config);
        await user.click(pill('revenue'));
        await pickGranularity(user, 'Day');
        await user.keyboard('{Escape}');
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(saved()).toEqual(config);
    });

    it("clears a viewer's grain pick on open, so tiles show the zoom's own", async () => {
        const { user, store } = setup({
            controlGranularities: { revenue: 'Year', orders: 'Day' },
        });
        expect(pill('revenue')).toHaveTextContent('Revenue zoom · Year');
        await user.click(pill('revenue'));
        expect(store.getState().dateZoom.controlGranularities).toEqual({
            orders: 'Day',
        });
        expect(pill('revenue')).toHaveTextContent('Revenue zoom · Month');
    });

    it('Add date zoom starts a new zoom at its name; Cancel leaves nothing', async () => {
        const { user, saved } = setup();
        await user.click(screen.getByRole('button', { name: 'Add date zoom' }));
        const name = screen.getByRole('textbox', { name: 'Name' });
        expect(name).toHaveFocus();
        expect(name).toHaveValue('Date zoom');
        // The dashboard's first enabled granularity
        expect(
            screen.getByRole('combobox', { name: 'Granularity' }),
        ).toHaveValue('Day');
        // No tiles yet: Apply waits
        expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
        await user.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(saved()).toEqual(config);
        expect(document.querySelectorAll('[data-date-zoom-pill]')).toHaveLength(
            2,
        );
    });

    it('an emptied name falls back to "Date zoom"', async () => {
        const { user, saved } = setup();
        await user.click(pill('revenue'));
        await user.click(screen.getByRole('button', { name: 'Rename' }));
        await user.clear(screen.getByRole('textbox', { name: 'Name' }));
        await user.keyboard('{Enter}');
        await user.click(screen.getByRole('button', { name: 'Apply' }));
        expect(saved().controls[0].name).toBe('Date zoom');
    });

    it('hides a zoom from viewers on Apply, and its pill says so', async () => {
        const { user, saved } = setup();
        await user.click(pill('revenue'));
        await user.click(
            screen.getByRole('button', { name: 'Date zoom actions' }),
        );
        await user.click(
            screen.getByRole('menuitem', { name: 'Hide for viewers' }),
        );
        expect(screen.getByRole('dialog')).toHaveTextContent(
            'Hidden from viewers',
        );
        await user.click(screen.getByRole('button', { name: 'Apply' }));
        expect(saved().controls[0].hidden).toBe(true);
        expect(pill('revenue')).toHaveAttribute('data-hidden');
    });

    it('Remove date zoom takes it off at once', async () => {
        const { user, saved } = setup();
        await user.click(pill('revenue'));
        await user.click(
            screen.getByRole('button', { name: 'Date zoom actions' }),
        );
        await user.click(
            screen.getByRole('menuitem', { name: 'Remove date zoom' }),
        );
        expect(saved().controls.map(({ uuid }) => uuid)).toEqual(['orders']);
        expect(saved().tileTargets).toEqual({ b: config.tileTargets.b });
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('switches to another zoom at once while clean, and asks first with changes', async () => {
        const { user, saved } = setup();
        await user.click(pill('revenue'));
        await user.click(pill('orders'));
        expect(
            screen.getByRole('dialog', { name: 'Orders zoom' }),
        ).toBeInTheDocument();
        await pickGranularity(user, 'Day');
        await user.click(pill('revenue'));
        expect(screen.getByRole('status')).toHaveTextContent(
            'Apply changes to Orders zoom first?',
        );
        await user.click(screen.getByRole('button', { name: 'Discard' }));
        expect(
            screen.getByRole('dialog', { name: 'Revenue zoom' }),
        ).toBeInTheDocument();
        expect(saved()).toEqual(config);
    });

    it("a filter's pill closes a clean zoom, and asks over changes", async () => {
        const { user, saved } = setup();
        await user.click(pill('revenue'));
        await user.click(
            screen.getByRole('button', { name: 'Country filter' }),
        );
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        await user.click(pill('revenue'));
        await pickGranularity(user, 'Week');
        await user.click(
            screen.getByRole('button', { name: 'Country filter' }),
        );
        expect(screen.getByRole('status')).toHaveTextContent(
            'Apply changes to Revenue zoom first?',
        );
        await user.click(
            within(screen.getByRole('status').parentElement!).getByRole(
                'button',
                { name: 'Apply' },
            ),
        );
        expect(saved().controls[0].granularity).toBe('Week');
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it("Apply on the switch question keeps that zoom's change in the next one's draft", async () => {
        const { user, saved } = setup();
        await user.click(pill('revenue'));
        await pickGranularity(user, 'Day');
        await user.click(pill('orders'));
        await user.click(
            within(screen.getByRole('status').parentElement!).getByRole(
                'button',
                { name: 'Apply' },
            ),
        );
        expect(
            screen.getByRole('dialog', { name: 'Orders zoom' }),
        ).toBeInTheDocument();
        await pickGranularity(user, 'Month');
        await user.click(screen.getByRole('button', { name: 'Apply' }));
        expect(
            saved().controls.map(({ uuid, granularity }) => [
                uuid,
                granularity,
            ]),
        ).toEqual([
            ['revenue', 'Day'],
            ['orders', 'Month'],
        ]);
    });

    it("a new zoom starts on the dashboard's default grain, as shipped", async () => {
        const { user } = setup({
            defaultDateZoomGranularity: DateGranularity.WEEK,
        });
        await user.click(screen.getByRole('button', { name: 'Add date zoom' }));
        await user.keyboard('{Enter}');
        expect(
            screen.getByRole('combobox', { name: 'Granularity' }),
        ).toHaveValue('Week');
    });

    describe('leaving edit mode while a zoom is open', () => {
        it('applies an edit with tiles', async () => {
            const { user, saved, leaveEditMode } = setup();
            await user.click(pill('revenue'));
            await pickGranularity(user, 'Day');
            leaveEditMode();
            expect(saved().controls[0].granularity).toBe('Day');
        });

        it('drops a new zoom with no tile', async () => {
            const { user, saved, isChanged, leaveEditMode } = setup();
            await user.click(
                screen.getByRole('button', { name: 'Add date zoom' }),
            );
            leaveEditMode();
            expect(saved()).toEqual(config);
            expect(isChanged()).toBe(false);
        });

        it('writes nothing for an unchanged edit', async () => {
            const { user, saved, isChanged, leaveEditMode } = setup();
            await user.click(pill('revenue'));
            leaveEditMode();
            expect(saved()).toEqual(config);
            expect(isChanged()).toBe(false);
        });
    });
});
