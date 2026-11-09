import {
    DateGranularity,
    EMPTY_DATE_ZOOM_CONFIG,
    type DashboardTile,
    type DateZoomConfig,
} from '@lightdash/common';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type FC } from 'react';
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
import { MappingSwap } from './ControlsBar';
import { DateZoomEditorPills } from './DateZoomEditorPills';
import { DateZoomEditorProvider } from './DateZoomEditorProvider';
import { DateZoomTileOverlays } from './DateZoomTileOverlay';
import { DateZoomTilesBar } from './DateZoomTilesBar';

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

// a: Revenue on its order date; b: Orders' only tile; c and d: in no zoom;
// sql: reads only `${ld.parameters.date_zoom}`; notes: markdown
const tileUuids = ['a', 'b', 'c', 'd', 'sql', 'notes'];
const tile = (uuid: string) =>
    ({
        uuid,
        type: uuid === 'notes' ? 'markdown' : 'saved_chart',
        properties: { title: `${uuid} tile`, chartName: uuid },
    }) as DashboardTile;

const fields = (uuid: string) => [
    { fieldId: `${uuid}_order_date`, label: 'Order date', tableName: 'orders' },
    { fieldId: `${uuid}_ship_date`, label: 'Ship date', tableName: 'orders' },
];

const config: DateZoomConfig = {
    controls: [
        { uuid: 'revenue', name: 'Revenue zoom', granularity: 'Month' },
        { uuid: 'orders', name: 'Orders zoom', granularity: 'Week' },
    ],
    tileTargets: {
        a: {
            controlUuid: 'revenue',
            fieldId: 'a_order_date',
            tableName: 'orders',
        },
        b: {
            controlUuid: 'orders',
            fieldId: 'b_order_date',
            tableName: 'orders',
        },
    },
};

const Canvas: FC = () => (
    <div className="react-grid-layout">
        {tileUuids.map((uuid) => (
            <div key={uuid} data-tile-uuid={uuid}>
                <span>{uuid} chart</span>
            </div>
        ))}
    </div>
);

const setup = (initial: DateZoomConfig = config) => {
    const store = createDashboardTestStore({
        isEditMode: true,
        chartZoomableFieldsByTileUuid: {
            a: fields('a'),
            b: fields('b'),
            c: fields('c'),
            d: fields('d'),
        },
        tileParameterReferences: { sql: ['date_zoom'] },
    });
    holder.store = store;
    seedDashboardEditState(store, {
        dashboardTiles: tileUuids.map(tile),
        dateZoomConfig: initial,
        dateZoomGranularities: [DateGranularity.WEEK, DateGranularity.MONTH],
    });
    const user = userEvent.setup();
    const ui = (isViewer: boolean) => (
        <DashboardStoreTestProvider store={store}>
            <DateZoomEditorProvider isViewer={isViewer}>
                <MappingSwap>
                    <DateZoomEditorPills />
                </MappingSwap>
                <Canvas />
                <DateZoomTileOverlays />
                <DateZoomTilesBar />
            </DateZoomEditorProvider>
        </DashboardStoreTestProvider>
    );
    const { rerender } = renderWithProviders(ui(false));
    const leaveEditMode = () => rerender(ui(true));
    const saved = () =>
        selectDateZoomConfig(store.getState(), EMPTY_DATE_ZOOM_CONFIG);
    return { user, saved, leaveEditMode };
};

const card = (uuid: string) =>
    document.querySelector<HTMLElement>(
        `[data-tile-uuid="${uuid}"] [data-controls-overlay]`,
    )!;
const row = () =>
    document.querySelector<HTMLElement>('[data-controls-mapping-row]')!;
const bar = () => screen.getByRole('region', { name: /Tiles zoomed by/ });

const startMapping = async (
    user: ReturnType<typeof userEvent.setup>,
    uuid = 'revenue',
) => {
    await user.click(
        document.querySelector<HTMLElement>(`[data-date-zoom-pill="${uuid}"]`)!,
    );
    await user.click(screen.getByRole('button', { name: /Choose tiles/ }));
};

const pickField = async (
    user: ReturnType<typeof userEvent.setup>,
    uuid: string,
    field: string,
) => {
    const select = within(card(uuid)).getByRole('button', {
        name: `Revenue zoom on ${uuid} tile`,
    });
    await user.click(select);
    await user.click(await screen.findByRole('option', { name: field }));
};

describe('choosing the tiles a date zoom zooms', () => {
    it('swaps the popover for the mapping row and cards each tile', async () => {
        const { user } = setup();
        await startMapping(user);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        // a, b, c, d and the parameter-only tile can be zoomed
        expect(row()).toHaveTextContent('Revenue zoom');
        expect(row()).toHaveTextContent('1 of 5 tiles');
        expect(card('a')).toHaveTextContent('Zoomed by Revenue zoom');
        expect(card('b')).toHaveTextContent('Zoomed by Orders zoom');
        expect(card('c')).toHaveTextContent('Not zoomed');
        // Markdown: veiled, no card
        expect(card('notes')).toHaveAttribute(
            'title',
            'This tile has no date to zoom',
        );
        expect(card('notes')).toBeEmptyDOMElement();
    });

    it('adds a tile on the picked field and clears it again', async () => {
        const { user, saved } = setup();
        await startMapping(user);
        await pickField(user, 'c', 'Ship date');
        await pickField(user, 'd', 'Order date');
        expect(row()).toHaveTextContent('3 of 5 tiles');
        expect(card('c')).toHaveTextContent('Zoomed by Revenue zoom');
        await user.click(
            within(card('d')).getByRole('button', {
                name: 'Stop zooming this tile by Revenue zoom',
            }),
        );
        expect(row()).toHaveTextContent('2 of 5 tiles');
        expect(card('d')).toHaveTextContent('Not zoomed');
        await user.click(within(row()).getByRole('button', { name: 'Apply' }));
        expect(saved().tileTargets.c).toEqual({
            controlUuid: 'revenue',
            fieldId: 'c_ship_date',
            tableName: 'orders',
        });
        expect(saved().tileTargets.d).toBeUndefined();
    });

    it('switches a tile that only reads the parameter on, with no field', async () => {
        const { user, saved } = setup();
        await startMapping(user);
        await user.click(
            within(card('sql')).getByRole('switch', {
                name: 'Revenue zoom on sql tile',
            }),
        );
        await user.click(within(row()).getByRole('button', { name: 'Apply' }));
        expect(saved().tileTargets.sql).toEqual({
            controlUuid: 'revenue',
            fieldId: null,
            tableName: null,
        });
    });

    it("asks before moving another zoom's tile, and warns when it is that zoom's last", async () => {
        const { user, saved } = setup();
        await startMapping(user);
        await pickField(user, 'b', 'Order date');
        expect(within(card('b')).getByRole('status')).toHaveTextContent(
            'Move from Orders zoom? It has no other tiles and will be removed.',
        );
        await user.click(
            within(card('b')).getByRole('button', { name: 'Cancel' }),
        );
        expect(card('b')).toHaveTextContent('Zoomed by Orders zoom');
        await pickField(user, 'b', 'Order date');
        await user.click(
            within(card('b')).getByRole('button', { name: 'Move' }),
        );
        expect(card('b')).toHaveTextContent('Zoomed by Revenue zoom');
        await user.click(within(row()).getByRole('button', { name: 'Apply' }));
        // Main's rule: a zoom with no tile never persists
        expect(saved().controls.map(({ uuid }) => uuid)).toEqual(['revenue']);
        expect(saved().tileTargets.b.controlUuid).toBe('revenue');
    });

    it('asks without the warning while the other zoom keeps tiles', async () => {
        const { user } = setup({
            ...config,
            tileTargets: {
                ...config.tileTargets,
                d: {
                    controlUuid: 'orders',
                    fieldId: 'd_order_date',
                    tableName: 'orders',
                },
            },
        });
        await startMapping(user);
        await pickField(user, 'b', 'Order date');
        expect(within(card('b')).getByRole('status')).toHaveTextContent(
            /^Move from Orders zoom\?$/,
        );
    });

    it('the bar adds every free tile, clears them, and undoes', async () => {
        const { user } = setup();
        await startMapping(user);
        expect(bar()).toHaveTextContent('1 of 5 tiles');
        // b is in Orders zoom: only c, d and the SQL tile are free
        await user.click(
            within(bar()).getByRole('button', { name: 'Zoom 3 more' }),
        );
        expect(row()).toHaveTextContent('4 of 5 tiles');
        expect(card('c')).toHaveTextContent('Zoomed by Revenue zoom');
        expect(card('b')).toHaveTextContent('Zoomed by Orders zoom');
        await user.click(
            within(bar()).getByRole('button', {
                name: 'Undo zooming 3 tiles by Revenue zoom',
            }),
        );
        expect(row()).toHaveTextContent('1 of 5 tiles');
        await user.click(
            within(bar()).getByRole('button', { name: 'Clear 1' }),
        );
        expect(row()).toHaveTextContent('0 of 5 tiles');
        expect(
            within(row()).getByRole('button', { name: 'Apply' }),
        ).toBeDisabled();
    });

    it('Cancel puts the tiles back and returns to the popover', async () => {
        const { user, saved } = setup();
        await startMapping(user);
        await pickField(user, 'c', 'Order date');
        await user.click(within(row()).getByRole('button', { name: 'Cancel' }));
        const dialog = screen.getByRole('dialog', { name: 'Revenue zoom' });
        expect(dialog).toHaveTextContent('Zooms 1 of 5 tiles');
        await user.click(within(dialog).getByRole('button', { name: 'Apply' }));
        expect(saved()).toEqual(config);
    });

    it('Escape goes back to the popover only while nothing changed', async () => {
        const { user } = setup();
        await startMapping(user);
        await pickField(user, 'c', 'Order date');
        await user.keyboard('{Escape}');
        expect(row()).toBeInTheDocument();
        await user.click(
            within(row()).getByRole('button', { name: 'Back to date zoom' }),
        );
        // Back keeps the choices in the draft
        expect(
            screen.getByRole('dialog', { name: 'Revenue zoom' }),
        ).toHaveTextContent('Zooms 2 of 5 tiles');
    });

    it('a zoom switched to after a Move shows the tile it lost', async () => {
        const { user } = setup({
            ...config,
            tileTargets: {
                ...config.tileTargets,
                d: {
                    controlUuid: 'orders',
                    fieldId: 'd_order_date',
                    tableName: 'orders',
                },
            },
        });
        await startMapping(user);
        await pickField(user, 'b', 'Order date');
        await user.click(
            within(card('b')).getByRole('button', { name: 'Move' }),
        );
        await user.click(
            within(row()).getByRole('button', { name: 'Back to date zoom' }),
        );
        // Switching over the unapplied Move: Apply on the question
        await user.click(
            document.querySelector<HTMLElement>(
                '[data-date-zoom-pill="orders"]',
            )!,
        );
        await user.click(
            within(screen.getByRole('status').parentElement!).getByRole(
                'button',
                { name: 'Apply' },
            ),
        );
        expect(
            screen.getByRole('dialog', { name: 'Orders zoom' }),
        ).toHaveTextContent('Zooms 1 of 5 tiles');
    });

    it('leaving edit mode drops a zoom whose tiles were all cleared', async () => {
        const { user, saved, leaveEditMode } = setup();
        await startMapping(user);
        await user.click(
            within(bar()).getByRole('button', { name: 'Clear 1' }),
        );
        leaveEditMode();
        expect(saved()).toEqual(config);
    });
});
