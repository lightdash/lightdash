import {
    DateGranularity,
    type Dashboard,
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
import { selectCurrentDateZoomConfig } from '../dashboard/store';
import { MappingSwap } from './ControlsBar';
import { DateZoomEditorProvider } from './DateZoomEditorProvider';
import { DateZoomPills } from './DateZoomPills';
import { DateZoomTileOverlays } from './DateZoomTileOverlay';
import { DateZoomTilesBar } from './DateZoomTilesBar';
import { useDateZoomEditorSelector } from './useDateZoomEditor';

vi.mock('./useControlsSidebar', () => ({
    useControlsSidebarSelector: (
        selector: (c: Record<string, unknown>) => unknown,
    ) =>
        selector({
            isMapping: false,
            isSidebarOpen: false,
            isViewer: false,
            requestSwitch: (proceed: () => void) => proceed(),
        }),
}));

const field = (fieldId: string) => ({
    fieldId,
    label: fieldId === 'orders_date' ? 'Order date' : 'Ship date',
    tableName: 'orders',
});
const tileUuids = ['t1', 't2', 't3', 'sql', 'notes'];
const tile = (uuid: string) =>
    ({
        uuid,
        type: uuid === 'notes' ? 'markdown' : 'saved_chart',
        properties: { title: uuid },
    }) as DashboardTile;

// t1 and t2 have date fields, sql only reads the parameter, notes has nothing
const saved: DateZoomConfig = {
    controls: [
        { uuid: 'z1', name: 'Revenue zoom', granularity: DateGranularity.WEEK },
        { uuid: 'z2', name: 'Orders zoom', granularity: DateGranularity.MONTH },
    ],
    tileTargets: {
        t1: { controlUuid: 'z1', fieldId: 'orders_date', tableName: 'orders' },
        t2: { controlUuid: 'z2', fieldId: 'orders_date', tableName: 'orders' },
    },
};

const Canvas: FC = () => (
    <div className="react-grid-layout">
        {tileUuids.map((uuid) => (
            <div key={uuid} data-tile-uuid={uuid}>
                {uuid} chart
            </div>
        ))}
    </div>
);

const AddButton: FC = () => {
    const add = useDateZoomEditorSelector((c) => c.add);
    return <button onClick={() => add(null)}>Add it</button>;
};

const setup = () => {
    const store = createDashboardTestStore({
        isEditMode: true,
        chartZoomableFieldsByTileUuid: {
            t1: [field('orders_date'), field('shipped_date')],
            t2: [field('orders_date')],
            t3: [field('shipped_date')],
        },
        tileParameterReferences: { sql: ['date_zoom'] },
        source: {
            embedDashboard: {
                config: { isDateZoomDisabled: false, dateZoomConfig: saved },
            } as Dashboard,
        },
    });
    seedDashboardEditState(store, { dashboardTiles: tileUuids.map(tile) });
    const user = userEvent.setup();
    renderWithProviders(
        <DashboardStoreTestProvider store={store}>
            <DateZoomEditorProvider isViewer={false}>
                <button data-filter-actions>Add</button>
                <MappingSwap>
                    <DateZoomPills />
                </MappingSwap>
                <AddButton />
                <Canvas />
                <DateZoomTileOverlays />
                <DateZoomTilesBar />
            </DateZoomEditorProvider>
        </DashboardStoreTestProvider>,
    );
    const config = () => selectCurrentDateZoomConfig(store.getState());
    return { user, config };
};

const card = (tileUuid: string) =>
    document.querySelector<HTMLElement>(
        `[data-tile-uuid="${tileUuid}"] [data-controls-overlay]`,
    )!;
const row = () =>
    document.querySelector<HTMLElement>('[data-controls-mapping-row]')!;
const chooseTiles = async (
    user: ReturnType<typeof userEvent.setup>,
    name = 'Revenue zoom',
) => {
    await user.click(
        screen.getByRole('button', { name: new RegExp(`^${name} is`) }),
    );
    await user.click(screen.getByRole('button', { name: /Choose tiles/ }));
};
const pickField = async (
    user: ReturnType<typeof userEvent.setup>,
    tileUuid: string,
    option: string,
) => {
    const select = () =>
        within(card(tileUuid)).getByRole('button', {
            name: `Revenue zoom on ${tileUuid}`,
        });
    // The stand-in, then the real select it mounts, already open
    await user.click(select());
    await user.click(await screen.findByRole('option', { name: option }));
};
const apply = (user: ReturnType<typeof userEvent.setup>) =>
    user.click(within(row()).getByRole('button', { name: 'Apply' }));

describe('choosing the tiles a date zoom re-grains', () => {
    it('swaps the popover for the mapping row and veils tiles with no date', async () => {
        const { user } = setup();
        await chooseTiles(user);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(row()).toHaveTextContent('Revenue zoomapplies to1 of 4 tiles');
        expect(card('notes')).toHaveAttribute(
            'title',
            'This tile has no date to zoom',
        );
        expect(card('t2')).toHaveTextContent('In Orders zoom');
    });

    it('adds a tile on the picked field and takes it off when cleared', async () => {
        const { user, config } = setup();
        await chooseTiles(user);
        await pickField(user, 't3', 'Ship date');
        expect(row()).toHaveTextContent('2 of 4 tiles');
        await user.click(
            within(card('t1')).getByRole('button', {
                name: 'Stop zooming this tile',
            }),
        );
        await apply(user);
        expect(config().tileTargets).toEqual({
            t2: saved.tileTargets.t2,
            t3: {
                controlUuid: 'z1',
                fieldId: 'shipped_date',
                tableName: 'orders',
            },
        });
    });

    it('puts a tile that only reads the parameter in the zoom with no field', async () => {
        const { user, config } = setup();
        await chooseTiles(user);
        await user.click(
            within(card('sql')).getByRole('switch', {
                name: 'Revenue zoom on sql',
            }),
        );
        await apply(user);
        expect(config().tileTargets.sql).toEqual({
            controlUuid: 'z1',
            fieldId: null,
            tableName: null,
        });
    });

    it("asks before moving another zoom's last tile, and Apply removes that zoom", async () => {
        const { user, config } = setup();
        await chooseTiles(user);
        await pickField(user, 't2', 'Order date');
        expect(card('t2')).toHaveTextContent(
            'Move from Orders zoom? It has no other tiles and will be removed.',
        );
        await user.click(
            within(card('t2')).getByRole('button', { name: 'Cancel' }),
        );
        expect(config().tileTargets.t2.controlUuid).toBe('z2');
        await pickField(user, 't2', 'Order date');
        await user.click(
            within(card('t2')).getByRole('button', { name: 'Move' }),
        );
        await apply(user);
        expect(config().controls.map(({ uuid }) => uuid)).toEqual(['z1']);
        expect(config().tileTargets.t2.controlUuid).toBe('z1');
    });

    it('adds every free tile at once, skipping tiles in another zoom, and undoes it', async () => {
        const { user } = setup();
        await chooseTiles(user);
        const bar = screen.getByRole('region', {
            name: 'Tiles zoomed by Revenue zoom',
        });
        await user.click(
            within(bar).getByRole('button', { name: 'Apply to 2 more' }),
        );
        expect(row()).toHaveTextContent('3 of 4 tiles');
        expect(card('t2')).toHaveTextContent('In Orders zoom');
        await user.click(
            within(bar).getByRole('button', { name: /^Undo zooming/ }),
        );
        expect(row()).toHaveTextContent('1 of 4 tiles');
        await user.click(within(bar).getByRole('button', { name: /^Clear/ }));
        expect(row()).toHaveTextContent('0 of 4 tiles');
        expect(
            within(row()).getByRole('button', { name: 'Apply' }),
        ).toBeDisabled();
    });

    it('keeps tile choices on Back and drops them on Cancel', async () => {
        const { user, config } = setup();
        await chooseTiles(user);
        await pickField(user, 't3', 'Ship date');
        await user.click(
            within(row()).getByRole('button', { name: 'Back to date zoom' }),
        );
        expect(
            screen.getByRole('button', {
                name: 'Applies to 2 of 4 tiles. Choose tiles',
            }),
        ).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: /Choose tiles/ }));
        await user.click(within(row()).getByRole('button', { name: 'Cancel' }));
        expect(
            screen.getByRole('button', {
                name: 'Applies to 2 of 4 tiles. Choose tiles',
            }),
        ).toBeInTheDocument();
        expect(config()).toEqual(saved);
    });

    it('adds a new zoom once it has a tile', async () => {
        const { user, config } = setup();
        await user.click(screen.getByRole('button', { name: 'Add it' }));
        await user.keyboard('{Enter}');
        await user.click(screen.getByRole('button', { name: /Choose tiles/ }));
        await user.click(
            within(card('t3')).getByRole('button', {
                name: 'Date zoom on t3',
            }),
        );
        await user.click(
            await screen.findByRole('option', { name: 'Ship date' }),
        );
        await apply(user);
        expect(config().controls.at(-1)).toMatchObject({
            name: 'Date zoom',
            // The first grain viewers can pick
            granularity: DateGranularity.DAY,
        });
    });
});
