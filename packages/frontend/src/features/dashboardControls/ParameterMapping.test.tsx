import {
    type DashboardParameterControl,
    type DashboardTile,
    type ParameterDefinitions,
} from '@lightdash/common';
import { act, screen, within } from '@testing-library/react';
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
    dashboardEditActions,
    dashboardParametersActions,
    selectActiveTabUuid,
    selectParameterControlInputs,
    useDashboardSelector,
} from '../dashboard/store';
import { getTileDashboardParameterInputs } from '../dashboard/store/parameterControls';
import { MappingSwap } from './ControlsBar';
import { ParameterEditorProvider } from './ParameterEditorProvider';
import { ParameterPills } from './ParameterPills';
import { ParameterTileOverlays } from './ParameterTileOverlay';
import { ParameterTilesBar } from './ParameterTilesBar';
import { TabCounts } from './TabCounts';
import {
    useParameterEditorSelector,
    type NewParameterControl,
} from './useParameterEditor';

vi.mock('../../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'project-1',
}));
vi.mock('../../providers/Dashboard/useDashboardContext', () => ({
    default: (selector: (c: Record<string, unknown>) => unknown) =>
        selector({
            setParameter: vi.fn(),
            allFilterableFields: [],
            filterableFieldsByTileUuid: undefined,
        }),
}));
const { tileHoverOwner } = vi.hoisted(() => ({
    tileHoverOwner: { current: null as string | null },
}));
vi.mock('./useControlsSidebar', () => ({
    useControlsSidebarSelector: (
        selector: (c: Record<string, unknown>) => unknown,
    ) =>
        selector({
            isMapping: false,
            isViewer: false,
            isPlaceholder: false,
            editingRule: null,
            requestSwitch: (proceed: () => void) => proceed(),
            tileHoverOwner,
        }),
}));

const regions = ['EMEA', 'APAC'];
const definitions: ParameterDefinitions = {
    'orders.region': { label: 'Region', options: regions, default: 'EMEA' },
    'payments.region': { label: 'Region', options: regions },
    'payments.currency': { label: 'Currency', options: ['EUR', 'USD'] },
};

// Overview: two orders tiles; Payments: a payments tile and a currency one
const references = {
    orders1: ['orders.region'],
    orders2: ['orders.region'],
    payments1: ['payments.region', 'payments.currency'],
    currency1: ['payments.currency'],
};
const tabOf: Record<string, string> = {
    orders1: 'overview',
    orders2: 'overview',
    payments1: 'payments',
    currency1: 'payments',
};
const tabs = [
    { uuid: 'overview', name: 'Overview', order: 0 },
    { uuid: 'payments', name: 'Payments', order: 1 },
];

const tile = (uuid: string) =>
    ({
        uuid,
        tabUuid: tabOf[uuid] ?? 'overview',
        type: 'saved_chart',
        properties: { title: uuid },
    }) as DashboardTile;

const valueType = { type: 'string', multiple: false } as const;
// As filled: each sets every tile using its key
const region: DashboardParameterControl = {
    id: 'region',
    label: null,
    value: 'APAC',
    valueType,
    parameters: { 'orders.region': 'all' },
};
const paymentsRegion: DashboardParameterControl = {
    id: 'payments-region',
    label: 'Pay region',
    value: 'EMEA',
    valueType,
    parameters: { 'payments.region': 'all' },
};
/** A second control on a key: it sets only the tiles it lists. */
const selected = (
    control: DashboardParameterControl,
    ...tileUuids: string[]
): DashboardParameterControl => ({
    ...control,
    parameters: Object.fromEntries(
        Object.keys(control.parameters).map((key) => [
            key,
            { only: tileUuids },
        ]),
    ),
});
// The tiles of the tab in view, in a grid, and the tabs, as the page draws them
const Canvas: FC = () => {
    const activeTabUuid = useDashboardSelector(selectActiveTabUuid);
    const tileUuids = useDashboardSelector((state) =>
        Object.keys(state.parameters.tileParameterReferences),
    );
    return (
        <>
            {tabs.map((tab) => (
                <div
                    key={tab.uuid}
                    role="tab"
                    aria-selected={tab.uuid === activeTabUuid}
                    id={`tabs-tab-${tab.uuid}`}
                >
                    {tab.name}
                </div>
            ))}
            <div className="react-grid-layout">
                {tileUuids
                    .filter(
                        (uuid) => (tabOf[uuid] ?? 'overview') === activeTabUuid,
                    )
                    .map((uuid) => (
                        <div key={uuid} data-tile-uuid={uuid}>
                            <span>{uuid} chart</span>
                        </div>
                    ))}
            </div>
        </>
    );
};

// "Add" opens a control that is not on the bar yet
const AddButton: FC<{ entry: NewParameterControl }> = ({ entry }) => {
    const add = useParameterEditorSelector((c) => c.add);
    return <button onClick={() => add(entry)}>Add it</button>;
};

const setup = ({
    controls = [region, paymentsRegion],
    activeTabUuid = 'overview',
    added,
    tileReferences = references,
    otherTiles = [],
}: {
    controls?: DashboardParameterControl[];
    activeTabUuid?: string;
    added?: NewParameterControl;
    tileReferences?: Record<string, string[]>;
    /** Tiles that use no parameter: markdown, heading, loom. */
    otherTiles?: DashboardTile[];
} = {}) => {
    const store = createDashboardTestStore({
        isEditMode: true,
        parameterDefinitions: definitions,
        tileParameterReferences: tileReferences,
    });
    seedDashboardEditState(store, {
        dashboardTiles: [
            ...Object.keys(tileReferences).map(tile),
            ...otherTiles,
        ],
        dashboardTabs: tabs,
        activeTab: tabs.find(({ uuid }) => uuid === activeTabUuid),
    });
    store.dispatch(
        dashboardParametersActions.syncParameterControls({
            controls,
            isSaved: true,
        }),
    );
    const user = userEvent.setup();
    const ui = (isViewer: boolean) => (
        <DashboardStoreTestProvider store={store}>
            <ParameterEditorProvider isViewer={isViewer}>
                <button data-filter-actions>Add</button>
                <MappingSwap>
                    <ParameterPills />
                </MappingSwap>
                <Canvas />
                <ParameterTileOverlays />
                <ParameterTilesBar />
                <TabCounts />
                {added && <AddButton entry={added} />}
            </ParameterEditorProvider>
        </DashboardStoreTestProvider>
    );
    const { rerender } = renderWithProviders(ui(false));
    // A mode change without a remount, as an embed's controlled mode
    const setViewer = (isViewer: boolean) => rerender(ui(isViewer));
    return { store, user, setViewer };
};

const card = (tileUuid: string) => {
    const element = document.querySelector<HTMLElement>(
        `[data-tile-uuid="${tileUuid}"] [data-controls-overlay]`,
    );
    if (element === null) throw new Error(`No card on ${tileUuid}`);
    return element;
};

const startMapping = async (
    user: ReturnType<typeof userEvent.setup>,
    pillId = 'region',
) => {
    await user.click(
        document.querySelector<HTMLElement>(
            `[data-parameter-pill="${pillId}"]`,
        )!,
    );
    await user.click(screen.getByRole('button', { name: /Choose tiles/ }));
};

// "Set this tile" opens the empty picker; the option is picked from its list
const setThisTile = async (
    user: ReturnType<typeof userEvent.setup>,
    tileUuid: string,
    label: string,
    option: string,
) => {
    await user.click(
        within(card(tileUuid)).getByRole('button', { name: label }),
    );
    await user.click(
        within(card(tileUuid)).getByRole('button', { name: label }),
    );
    await user.click(await screen.findByRole('option', { name: option }));
};

const row = () =>
    document.querySelector<HTMLElement>('[data-controls-mapping-row]')!;

const tileValues = (store: ReturnType<typeof setup>['store']) =>
    Object.fromEntries(
        Object.keys(references).map((tileUuid) => [
            tileUuid,
            getTileDashboardParameterInputs({
                controlInputs: selectParameterControlInputs(store.getState()),
                tileUuid,
                tileParameterReferences: references,
                dashboardValues: {},
            }).dashboardValues,
        ]),
    );

describe('choosing the tiles a parameter control sets', () => {
    it('swaps the popover for the mapping row, with a chip per parameter', async () => {
        const { user } = setup();
        await startMapping(user);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        // The payments tile's only parameter is set everywhere by Pay region
        expect(row()).toHaveTextContent('2 of 3 tiles');
        expect(
            within(row()).getByRole('button', { name: 'Orders Region' }),
        ).toBeInTheDocument();
    });

    it('shows a set tile through its parameter, with the value it runs with', async () => {
        const { user } = setup();
        await startMapping(user);
        expect(card('orders1')).toHaveTextContent('Set by Region through');
        expect(card('orders1')).toHaveTextContent('Orders Region');
        expect(card('orders1')).toHaveTextContent('Shows APAC');
    });

    it('the X stops setting a tile, and Set this tile opens the empty picker', async () => {
        const { user } = setup();
        await startMapping(user);
        await user.click(
            within(card('orders2')).getByRole('button', {
                name: 'Stop setting this tile by Region',
            }),
        );
        expect(card('orders2')).toHaveTextContent('Not set');
        expect(card('orders2')).not.toHaveTextContent('Shows');
        expect(row()).toHaveTextContent('1 of 3 tiles');
        // No key is reused: the picker opens empty
        await user.click(
            within(card('orders2')).getByRole('button', {
                name: 'Region on orders2',
            }),
        );
        expect(
            within(card('orders2')).getByRole('button', {
                name: 'Region on orders2',
            }),
        ).toHaveTextContent('Select a parameter');
        expect(row()).toHaveTextContent('1 of 3 tiles');
        await user.click(
            within(card('orders2')).getByRole('button', {
                name: 'Region on orders2',
            }),
        );
        await user.click(
            await screen.findByRole('option', { name: 'Orders Region' }),
        );
        expect(card('orders2')).toHaveTextContent('Shows APAC');
    });

    it('opens the picker empty on a tile without the control key, and combines models', async () => {
        const { store, user } = setup({ controls: [region] });
        await startMapping(user);
        act(() => {
            store.dispatch(dashboardEditActions.setActiveTab(tabs[1]));
        });
        expect(card('payments1')).toHaveTextContent('Not set');
        // The veil only, the reason as its hint
        expect(card('currency1')).toHaveAttribute(
            'title',
            'No parameter Region can set',
        );
        expect(card('currency1')).toBeEmptyDOMElement();
        await user.click(
            within(card('payments1')).getByRole('button', {
                name: 'Region on payments1',
            }),
        );
        const picker = within(card('payments1')).getByRole('button', {
            name: 'Region on payments1',
        });
        expect(picker).toHaveTextContent('Select a parameter');
        await user.click(picker);
        expect(
            await screen.findByRole('option', {
                name: 'Payments Currency (different values)',
            }),
        ).toHaveAttribute('data-combobox-disabled');
        await user.click(
            screen.getByRole('option', { name: 'Payments Region' }),
        );
        expect(card('payments1')).toHaveTextContent('Shows APAC');
        expect(
            within(row()).getByRole('button', { name: 'Payments Region' }),
        ).toBeInTheDocument();

        await user.click(within(row()).getByRole('button', { name: 'Apply' }));
        expect(store.getState().parameters.parameterControls).toEqual([
            {
                ...region,
                parameters: {
                    'orders.region': 'all',
                    'payments.region': 'all',
                },
            },
        ]);
        expect(store.getState().parameters.haveParameterControlsChanged).toBe(
            true,
        );
        expect(tileValues(store)).toMatchObject({
            orders1: { 'orders.region': 'APAC' },
            payments1: { 'payments.region': 'APAC' },
        });
    });

    it('counts per tab, and the bar sets the tab in view, then the other tabs, with Undo', async () => {
        const { user } = setup({
            controls: [selected(region, 'orders1')],
        });
        await startMapping(user);
        const count = (tabUuid: string) =>
            document.querySelector(`#tabs-tab-${tabUuid}`)!.textContent;
        expect(count('overview')).toContain('1/2');
        expect(count('payments')).toContain('0/1');
        await user.click(
            within(row()).getByRole('button', { name: 'Orders Region' }),
        );
        expect(
            screen.queryByRole('button', { name: /^Undo/ }),
        ).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Set 1 more' }));
        expect(count('overview')).toContain('2/2');
        expect(screen.getByRole('button', { name: 'Set more' })).toBeDisabled();
        await user.click(screen.getByRole('button', { name: 'Clear 2' }));
        expect(count('overview')).toContain('0/2');
        await user.click(screen.getByRole('button', { name: /^Undo/ }));
        expect(count('overview')).toContain('2/2');
        expect(
            screen.queryByRole('button', { name: /^Undo/ }),
        ).not.toBeInTheDocument();
    });

    it('narrows a combined tile by selecting the first displayed key', async () => {
        const combined = {
            ...region,
            parameters: {
                'orders.region': 'all' as const,
                'payments.region': 'all' as const,
            },
        };
        const { store, user } = setup({
            controls: [combined],
            tileReferences: { orders1: ['orders.region', 'payments.region'] },
        });
        await startMapping(user);
        await user.click(
            within(card('orders1')).getByRole('button', {
                name: 'Region on orders1',
            }),
        );
        await user.click(
            await screen.findByRole('option', { name: 'Orders Region' }),
        );
        await user.click(within(row()).getByRole('button', { name: 'Apply' }));
        expect(
            store.getState().parameters.parameterControls?.[0].parameters,
        ).toEqual({
            'orders.region': 'all',
            'payments.region': { except: ['orders1'] },
        });
    });

    it('keeps a changed count when returning to the popover', async () => {
        const { user } = setup();
        await startMapping(user);
        await user.click(
            within(card('orders1')).getByRole('button', {
                name: 'Stop setting this tile by Region',
            }),
        );
        await user.click(
            within(row()).getByRole('button', { name: 'Back to parameter' }),
        );
        expect(
            screen.getByRole('button', { name: /Sets 1 of 4 tiles/ }),
        ).toBeInTheDocument();
    });

    it('Cancel discards a tile exclusion', async () => {
        const { store, user } = setup();
        await startMapping(user);
        await user.click(
            within(card('orders1')).getByRole('button', {
                name: 'Stop setting this tile by Region',
            }),
        );
        await user.click(within(row()).getByRole('button', { name: 'Cancel' }));
        expect(
            store.getState().parameters.parameterControls?.[0].parameters,
        ).toEqual({ 'orders.region': 'all' });
    });

    it('clears all layout tiles including tiles on unopened tabs', async () => {
        const { store, user } = setup();
        await startMapping(user);
        await user.click(
            within(row()).getByRole('button', { name: 'Clear all tiles' }),
        );
        // As a date zoom's: a control on no tiles does nothing
        expect(
            within(row()).getByRole('button', { name: 'Clear all tiles' }),
        ).toBeDisabled();
        expect(
            within(row()).getByRole('button', { name: 'Apply' }),
        ).toBeDisabled();
        await user.click(
            within(row()).getByRole('button', { name: 'Back to parameter' }),
        );
        expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
        await user.click(screen.getByRole('button', { name: /Choose tiles/ }));
        await setThisTile(
            user,
            'orders1',
            'Region on orders1',
            'Orders Region',
        );
        await user.click(within(row()).getByRole('button', { name: 'Apply' }));
        expect(
            store.getState().parameters.parameterControls?.[0].parameters,
        ).toEqual({
            'orders.region': {
                except: ['orders2', 'payments1', 'currency1'],
            },
        });
    });

    it('moves a tile atomically from its default control to an explicit control', async () => {
        const ops = selected({ ...region, id: 'ops', label: 'Ops' });
        const { store, user } = setup({ controls: [region, ops] });
        await startMapping(user, 'ops');
        await setThisTile(user, 'orders1', 'Ops on orders1', 'Orders Region');
        await user.click(screen.getByRole('button', { name: 'Move' }));
        await user.click(within(row()).getByRole('button', { name: 'Apply' }));
        expect(
            store
                .getState()
                .parameters.parameterControls?.map(
                    ({ parameters }) => parameters,
                ),
        ).toEqual([
            { 'orders.region': { except: ['orders1'] } },
            { 'orders.region': { only: ['orders1'] } },
        ]);
    });
});
