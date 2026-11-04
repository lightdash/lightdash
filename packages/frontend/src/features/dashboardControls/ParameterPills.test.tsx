import {
    DEFAULT_UI_STRINGS,
    formatDate,
    parseDate,
    fillParameterControls,
    TimeFrames,
    type DashboardParameterControl,
    type DashboardTile,
    type ParameterDefinitions,
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
import { dashboardParametersActions } from '../dashboard/store';
import { ParameterEditorProvider } from './ParameterEditorProvider';
import { ParameterPills } from './ParameterPills';
import { RailContractClasses } from './railContractClasses';
import {
    useParameterEditorSelector,
    type NewParameterControl,
} from './useParameterEditor';

const { setParameter, openFilter, tileHoverOwner } = vi.hoisted(() => ({
    setParameter: vi.fn(),
    openFilter: vi.fn(),
    tileHoverOwner: { current: null as string | null },
}));
vi.mock('../../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'project-1',
}));
vi.mock('../../providers/Dashboard/useDashboardContext', () => ({
    default: (
        selector: (c: { setParameter: typeof setParameter }) => unknown,
    ) => selector({ setParameter }),
}));
vi.mock('./useControlsSidebar', () => ({
    useControlsSidebarSelector: (
        selector: (c: {
            isMapping: boolean;
            requestSwitch: (proceed: () => void) => void;
            tileHoverOwner: { current: string | null };
        }) => unknown,
    ) =>
        selector({
            isMapping: false,
            requestSwitch: (proceed) => proceed(),
            tileHoverOwner,
        }),
}));

const definitions: ParameterDefinitions = {
    region: {
        label: 'Region',
        type: 'string',
        options: ['EMEA', 'APAC'],
        default: 'EMEA',
        description: 'Sales region',
    },
    currency: { label: 'Currency', type: 'string', options: ['EUR', 'USD'] },
    start: { label: 'Start', type: 'date' },
    week: {
        label: 'Week starts',
        type: 'string',
        options: ['Monday', 'Sunday'],
    },
};

const tile = (uuid: string, tabUuid?: string) =>
    ({ uuid, tabUuid, type: 'saved_chart', properties: {} }) as DashboardTile;

// Tiles that have run report their references: only those can count as missing
const markTilesRun = (
    store: ReturnType<typeof createDashboardTestStore>,
    references: Record<string, string[]>,
) =>
    Object.entries(references).forEach(([tileUuid, refs]) =>
        store.dispatch(
            dashboardParametersActions.addParameterReferences({
                tileUuid,
                references: refs,
            }),
        ),
    );

// As filled: the label and value type are the parameter's, and it sets every tile using the key of its id
const control = (
    id: string,
    overrides: Partial<DashboardParameterControl> = {},
): DashboardParameterControl => ({
    id,
    label: definitions[id]?.label ?? id,
    value: null,
    valueType: {
        type: definitions[id]?.type ?? 'string',
        multiple: definitions[id]?.multiple ?? false,
    },
    parameters: { [id]: 'all' },
    ...overrides,
});

type Setup = {
    controls: DashboardParameterControl[];
    tileChartSavedParameters?: Record<string, Record<string, string>>;
    isEmbed?: boolean;
    references?: Record<string, string[]>;
    isViewer?: boolean;
    parameterDefinitions?: ParameterDefinitions;
    tabs?: { uuid: string; name: string; order: number }[];
    activeTabUuid?: string;
    /** A control "Add" would open, behind a button. */
    added?: NewParameterControl;
};

const AddButton: FC<{ entry: NewParameterControl }> = ({ entry }) => {
    const add = useParameterEditorSelector((c) => c.add);
    return <button onClick={() => add(entry)}>Add it</button>;
};

const setup = ({
    controls,
    references = { 'tile-1': ['region', 'currency'], 'tile-2': ['region'] },
    isViewer = false,
    parameterDefinitions = definitions,
    tabs,
    activeTabUuid,
    isEmbed = false,
    tileChartSavedParameters = {},
    added,
}: Setup) => {
    const store = createDashboardTestStore({
        isEditMode: !isViewer,
        parameterDefinitions,
        tileChartSavedParameters,
    });
    markTilesRun(store, references);
    seedDashboardEditState(store, {
        dashboardTiles: Object.keys(references).map((uuid) =>
            tile(uuid, tabs ? (uuid === 'tile-1' ? 't1' : 't2') : undefined),
        ),
        ...(tabs && {
            dashboardTabs: tabs,
            activeTab: tabs.find(({ uuid }) => uuid === activeTabUuid),
        }),
    });
    store.dispatch(
        dashboardParametersActions.syncParameterControls({
            controls,
            isSaved: true,
        }),
    );
    const user = userEvent.setup();
    const ui = (mode: boolean) => (
        <DashboardStoreTestProvider store={store}>
            <RailContractClasses.Provider
                value={
                    isEmbed
                        ? {
                              rail: 'ld-dashboard-filter-rail',
                              addFilterDropdown:
                                  'ld-dashboard-add-filter-dropdown',
                              filterDropdown: 'ld-dashboard-filter-dropdown',
                              parameter: 'ld-dashboard-parameter',
                              parameterDropdown:
                                  'ld-dashboard-parameter-dropdown',
                          }
                        : null
                }
            >
                <ParameterEditorProvider isViewer={mode}>
                    <button data-filter-actions>
                        <span>Add</span>
                    </button>
                    <button data-controls-pill="f1" onClick={openFilter}>
                        Status filter
                    </button>
                    <ParameterPills />
                    {Object.keys(references).map((tileUuid) => (
                        <div key={tileUuid} data-tile-uuid={tileUuid} />
                    ))}
                    {added && <AddButton entry={added} />}
                </ParameterEditorProvider>
            </RailContractClasses.Provider>
        </DashboardStoreTestProvider>
    );
    const { rerender } = renderWithProviders(ui(isViewer));
    // A mode change without a remount, as an embed's controlled mode
    const setViewer = (next: boolean) => rerender(ui(next));
    return { store, user, setViewer };
};

const pills = () =>
    [...document.querySelectorAll<HTMLElement>('[data-parameter-pill]')].map(
        (pill) => pill.dataset.parameterPill,
    );
const pill = (id: string) => {
    const element = document.querySelector<HTMLElement>(
        `[data-parameter-pill="${id}"]`,
    );
    if (element === null) throw new Error(`No pill ${id}`);
    return element;
};

const removeButton = (id: string) => {
    const wrapper = pill(id).parentElement;
    if (wrapper === null) throw new Error(`No pill wrapper ${id}`);
    return within(wrapper).getByRole('button', { name: 'Remove parameter' });
};

describe('ParameterPills', () => {
    beforeEach(() => {
        setParameter.mockReset();
        openFilter.mockReset();
    });

    describe('on the bar', () => {
        it('renders nothing without controls', () => {
            setup({ controls: [], references: { 'tile-1': ['region'] } });
            expect(pills()).toEqual([]);
        });

        it('names the pill by the control label and reads name is value', () => {
            setup({
                controls: [
                    control('region', { value: 'APAC' }),
                    control('currency', { label: 'Money', value: 'EUR' }),
                ],
            });
            expect(pill('region')).toHaveTextContent('Region is APAC');
            expect(pill('currency')).toHaveTextContent('Money is EUR');
        });

        it('orders controls by the list', () => {
            setup({ controls: [control('currency'), control('region')] });
            expect(pills()).toEqual(['currency', 'region']);
        });

        it('reads an override in ink with its value bold', () => {
            setup({ controls: [control('region', { value: 'APAC' })] });
            expect(pill('region')).toHaveTextContent('Region is APAC');
            expect(pill('region')).toHaveAttribute('data-in-effect');
            expect(within(pill('region')).getByText('APAC')).toHaveStyle({
                fontWeight: '600',
            });
        });

        it('says "not set" with no override, even with a definition default, never "any value"', async () => {
            const { user } = setup({
                controls: [
                    control('region'),
                    control('week', { value: 'Mars' }),
                ],
                references: { 'tile-1': ['region', 'week'] },
                parameterDefinitions: {
                    ...definitions,
                    week: { ...definitions.week, default: 'Monday' },
                },
            });
            // A value outside its options reads as no override too
            for (const [id, name] of [
                ['region', 'Region'],
                ['week', 'Week starts'],
            ]) {
                expect(pill(id)).toHaveTextContent(`${name} is not set`);
                expect(pill(id)).not.toHaveAttribute('data-in-effect');
                expect(pill(id)).not.toHaveAttribute('data-missing');
                expect(pill(id)).not.toHaveTextContent('any value');
            }
            await user.hover(pill('region'));
            const tooltip = await screen.findByRole('tooltip');
            expect(tooltip).toHaveTextContent(
                "Tiles use their own value or the parameter's default",
            );
            expect(tooltip).toHaveTextContent('Sales region');
        });

        it('says "not set" for a combined control whose keys have different defaults', () => {
            setup({
                controls: [
                    control('region', {
                        parameters: { region: 'all', week: 'all' },
                    }),
                ],
                references: { 'tile-1': ['region'], 'tile-2': ['week'] },
                parameterDefinitions: {
                    ...definitions,
                    week: { ...definitions.week, default: 'Monday' },
                },
            });
            expect(pill('region')).toHaveTextContent('Region is not set');
        });

        it('turns amber, "needs a value", when a tile it covers has no value at all', () => {
            const store = createDashboardTestStore({
                isEditMode: true,
                parameterDefinitions: definitions,
                // One tile has its own saved value; the other has none
                tileChartSavedParameters: { 'tile-1': { currency: 'EUR' } },
            });
            markTilesRun(store, {
                'tile-1': ['currency'],
                'tile-2': ['currency'],
            });
            seedDashboardEditState(store, {
                dashboardTiles: [tile('tile-1'), tile('tile-2')],
            });
            store.dispatch(
                dashboardParametersActions.syncParameterControls({
                    controls: [control('currency')],
                    isSaved: true,
                }),
            );
            renderWithProviders(
                <DashboardStoreTestProvider store={store}>
                    <ParameterEditorProvider isViewer={false}>
                        <ParameterPills />
                    </ParameterEditorProvider>
                </DashboardStoreTestProvider>,
            );
            expect(pill('currency')).toHaveTextContent(
                'Currency needs a value',
            );
            expect(pill('currency')).toHaveAttribute('data-missing');
            expect(pill('currency')).not.toHaveTextContent('any value');
        });

        it('appends the model, or Project, to pills whose names collide, and leaves unique ones', async () => {
            const { user } = setup({
                controls: [
                    control('orders.shipping', {
                        label: 'Shipping method',
                        value: 'all',
                    }),
                    control('payments.shipping', {
                        label: 'Shipping method',
                        value: 'all',
                    }),
                    control('shipping', {
                        label: 'Shipping method',
                        value: 'all',
                    }),
                    control('region', { value: 'EMEA' }),
                ],
                references: {
                    'tile-1': ['orders.shipping', 'shipping', 'region'],
                    'tile-2': ['payments.shipping'],
                },
                parameterDefinitions: {
                    region: definitions.region,
                    'orders.shipping': {
                        label: 'Shipping method',
                        type: 'string',
                    },
                    'payments.shipping': {
                        label: 'Shipping method',
                        type: 'string',
                    },
                    shipping: { label: 'Shipping method', type: 'string' },
                },
            });
            expect(pill('orders.shipping')).toHaveTextContent(
                'Shipping method · Orders is all',
            );
            expect(pill('payments.shipping')).toHaveTextContent(
                'Shipping method · Payments is all',
            );
            expect(pill('shipping')).toHaveTextContent(
                'Shipping method · Project is all',
            );
            expect(pill('region')).toHaveTextContent(/^Region is EMEA/);
            await user.click(pill('payments.shipping'));
            expect(
                screen.getByRole('dialog', {
                    name: 'Shipping method · Payments',
                }),
            ).toBeInTheDocument();
        });

        it('shows a date value as the shipped pill does', () => {
            setup({
                controls: [control('start', { value: '2026-10-01' })],
                references: { 'tile-1': ['start'] },
            });
            expect(pill('start')).toHaveTextContent(
                formatDate(
                    parseDate('2026-10-01', TimeFrames.DAY),
                    TimeFrames.DAY,
                    false,
                ),
            );
        });

        it('fills its label from the definitions, with their overrides (an embed language map)', () => {
            const parameterDefinitions = {
                ...definitions,
                region: { ...definitions.region, label: 'Región' },
            };
            const references = { 'tile-1': ['region'] };
            const filled = fillParameterControls({
                dashboardParameters: {
                    region: { parameterName: 'region', value: 'EMEA' },
                },
                definitions: parameterDefinitions,
                tileParameterReferences: references,
                parameterOrder: [],
                parameterSections: {},
                userParameterNames: Object.keys(parameterDefinitions),
            });
            setup({ controls: filled, references, parameterDefinitions });
            expect(pills()).toHaveLength(1);
            expect(
                document.querySelector('[data-parameter-pill]'),
            ).toHaveTextContent('Región is EMEA');
        });

        it('shows the description on hover', async () => {
            const { user } = setup({ controls: [control('region')] });
            await user.hover(pill('region'));
            expect(await screen.findByRole('tooltip')).toHaveTextContent(
                'Sales region',
            );
        });

        it('waits for the definition', () => {
            setup({
                controls: [control('region')],
                references: { 'tile-1': ['region'] },
                parameterDefinitions: { currency: definitions.currency },
            });
            expect(pills()).toEqual([]);
        });

        it('hides a control no tile on the tab uses, and keeps one no tile uses at all', () => {
            setup({
                controls: [
                    control('region'),
                    control('week'),
                    control('gone', { label: 'Gone' }),
                ],
                references: { 'tile-1': ['region'], 'tile-2': ['week'] },
                parameterDefinitions: {
                    ...definitions,
                    gone: { label: 'Gone' },
                },
                tabs: [
                    { uuid: 't1', name: 'One', order: 0 },
                    { uuid: 't2', name: 'Two', order: 1 },
                ],
                activeTabUuid: 't1',
            });
            expect(pills()).toEqual(['region', 'gone']);
        });

        it('shows a control opened from "Add" as a draft pill on any tab, until Cancel', async () => {
            const { user, store } = setup({
                controls: [control('region')],
                references: { 'tile-1': ['region'], 'tile-2': ['week'] },
                tabs: [
                    { uuid: 't1', name: 'One', order: 0 },
                    { uuid: 't2', name: 'Two', order: 1 },
                ],
                activeTabUuid: 't1',
                added: {
                    control: control('new', {
                        label: 'Week starts',
                        parameters: { week: 'all' },
                    }),
                    parameterKeys: ['week'],
                    tileUuids: ['tile-2'],
                },
            });
            await user.click(screen.getByRole('button', { name: 'Add it' }));
            expect(pills()).toEqual(['region', 'new']);
            const dialog = await screen.findByRole('dialog', {
                name: 'Week starts',
            });
            await user.click(
                within(dialog).getByRole('button', { name: 'Cancel' }),
            );
            expect(pills()).toEqual(['region']);
            expect(
                store
                    .getState()
                    .parameters.parameterControls?.map(({ id }) => id),
            ).toEqual(['region']);
        });

        it('drops the "needs a value" pill while "Add" opens a control on its key', async () => {
            const { user } = setup({
                controls: [],
                references: { 'tile-1': ['currency'] },
                added: {
                    control: control('new', {
                        label: 'Currency',
                        parameters: { currency: 'all' },
                    }),
                    parameterKeys: ['currency'],
                    tileUuids: ['tile-1'],
                },
            });
            expect(pills()).toEqual(['needs-value:currency']);
            await user.click(screen.getByRole('button', { name: 'Add it' }));
            expect(pills()).toEqual(['new']);
        });

        it('marks a control a tile needs a value from', () => {
            setup({ controls: [control('currency')] });
            expect(pill('currency')).toHaveAttribute('data-missing');
        });

        it('keeps a user parameter that shadows a system variable, with the warning on the pill and popover', async () => {
            const { user } = setup({
                controls: [control('date_zoom', { label: 'Today' })],
                references: { 'tile-1': ['date_zoom'] },
                parameterDefinitions: {
                    date_zoom: { label: 'Today' },
                },
            });
            // The shipped warning's yellow triangle, after the name
            expect(
                pill('date_zoom').querySelector(
                    '[data-position="right"] svg[style*="yellow-7"]',
                ),
            ).not.toBeNull();
            await user.click(pill('date_zoom'));
            const dialog = screen.getByRole('dialog', { name: 'Today' });
            // It sets its tile, as any user parameter
            expect(within(dialog).getByText('Sets 1 tile')).toBeInTheDocument();
            expect(
                dialog.querySelector('svg[style*="yellow-7"]'),
            ).not.toBeNull();
        });

        it('carries the embed class contract on the pill and its popover', async () => {
            const { user } = setup({
                controls: [control('region')],
                isViewer: true,
                isEmbed: true,
            });
            expect(pill('region')).toHaveClass('ld-dashboard-parameter');
            await user.click(pill('region'));
            expect(
                document.querySelector('[data-controls-editor]'),
            ).toHaveClass('ld-dashboard-parameter-dropdown');
        });

        it('turns a shadowing user parameter amber when a tile is left without a value', () => {
            setup({
                controls: [control('date_zoom', { label: 'Today' })],
                references: { 'tile-1': ['date_zoom'] },
                parameterDefinitions: { date_zoom: { label: 'Today' } },
            });
            expect(pill('date_zoom')).toHaveAttribute('data-missing');
            expect(pill('date_zoom')).toHaveTextContent('Today needs a value');
        });

        it('shows a pick over the control value', () => {
            const { store } = setup({
                controls: [control('region', { value: 'EMEA' })],
                isViewer: true,
            });
            act(() => {
                store.dispatch(
                    dashboardParametersActions.setParameterPicks({
                        region: 'APAC',
                    }),
                );
            });
            expect(pill('region')).toHaveTextContent('Region is APAC');
        });
    });

    describe('a control set on no tile', () => {
        const controls = [
            control('sales', {
                label: 'Region',
                value: 'APAC',
                parameters: { region: 'all' },
            }),
            control('ops', {
                label: 'Region',
                value: 'EMEA',
                parameters: { region: { only: [] } },
            }),
        ];

        it('stays on the bar, out of effect, with the orphaned tooltip in parameter words', async () => {
            const { user } = setup({ controls });
            expect(pills().slice(0, 2)).toEqual(['sales', 'ops']);
            expect(pill('ops')).not.toHaveAttribute('data-in-effect');
            expect(pill('sales')).toHaveAttribute('data-in-effect');
            await user.hover(pill('ops'));
            expect(
                await screen.findByText(
                    DEFAULT_UI_STRINGS[
                        'controls.parameter.notAppliedToAnyTiles'
                    ],
                ),
            ).toBeInTheDocument();
        });

        it('can be removed by hand', async () => {
            const { store, user } = setup({ controls });
            await user.click(removeButton('ops'));
            expect(
                store
                    .getState()
                    .parameters.parameterControls?.map(({ id }) => id),
            ).toEqual(['sales']);
        });
    });

    describe('the safety net', () => {
        it('raises a pill for a tile a control leaves out, and the control is not amber', async () => {
            const { store, user } = setup({
                controls: [
                    control('currency', {
                        value: 'EUR',
                        parameters: { currency: { except: ['tile-2'] } },
                    }),
                ],
                references: { 'tile-1': ['currency'], 'tile-2': ['currency'] },
            });
            expect(pill('currency')).toHaveTextContent('Currency is EUR');
            expect(pill('currency')).not.toHaveAttribute('data-missing');
            expect(pill('needs-value:currency')).toHaveTextContent(
                'Currency needs a value',
            );

            // Added beside it, each control keeps to its own tiles
            await user.click(pill('needs-value:currency'));
            expect(screen.getByText('Sets 1 of 2 tiles')).toBeInTheDocument();
            await user.click(screen.getByRole('combobox'));
            await user.click(
                await screen.findByRole('option', { name: 'USD' }),
            );
            await user.click(
                screen.getByRole('button', { name: 'Add to the bar' }),
            );
            const saved = store.getState().parameters.parameterControls;
            expect(saved?.map(({ value }) => value)).toEqual(['EUR', 'USD']);
            expect(saved?.[1]).toMatchObject({
                parameters: { currency: { only: ['tile-2'] } },
            });
        });

        it("a viewer's value there fills only the tile left out, and its pill stays", async () => {
            const { store, user } = setup({
                controls: [
                    control('currency', {
                        value: 'EUR',
                        parameters: { currency: { except: ['tile-2'] } },
                    }),
                ],
                references: { 'tile-1': ['currency'], 'tile-2': ['currency'] },
                isViewer: true,
            });
            await user.click(pill('needs-value:currency'));
            await user.click(screen.getByRole('combobox'));
            await user.click(
                await screen.findByRole('option', { name: 'USD' }),
            );
            await user.click(screen.getByRole('button', { name: 'Apply' }));
            // Not a pick by key: that would also change tile 1
            expect(setParameter).not.toHaveBeenCalled();
            expect(store.getState().parameters.parameterTilePicks).toEqual({
                'tile-2': { currency: 'USD' },
            });
            expect(pill('currency')).toHaveTextContent('Currency is EUR');
            expect(pill('needs-value:currency')).toHaveTextContent(
                'Currency is USD',
            );
        });

        it('turns amber only the control whose tile has no value', () => {
            setup({
                controls: [
                    control('sales', {
                        label: 'Currency',
                        parameters: { currency: { except: ['tile-2'] } },
                    }),
                    control('ops', {
                        label: 'Currency',
                        parameters: { currency: { only: ['tile-2'] } },
                    }),
                ],
                references: { 'tile-1': ['currency'], 'tile-2': ['currency'] },
                tileChartSavedParameters: { 'tile-1': { currency: 'EUR' } },
            });
            expect(pill('sales')).not.toHaveAttribute('data-missing');
            expect(pill('ops')).toHaveAttribute('data-missing');
        });

        it('shows a needs-a-value pill for a key no control sets that leaves a tile without a value', () => {
            setup({ controls: [control('region')] });
            expect(pills()).toEqual(['region', 'needs-value:currency']);
            expect(pill('needs-value:currency')).toHaveTextContent(
                'Currency needs a value',
            );
            expect(pill('needs-value:currency')).toHaveAttribute(
                'data-temporary',
            );
        });

        it('hands focus back to the pill on Cancel and Escape', async () => {
            const { user } = setup({ controls: [control('region')] });
            await user.click(pill('needs-value:currency'));
            await user.click(screen.getByRole('button', { name: 'Cancel' }));
            expect(pill('needs-value:currency')).toHaveFocus();
            await user.click(pill('needs-value:currency'));
            // The value's list, open on focus, takes the first Escape
            await user.keyboard('{Escape}');
            if (screen.queryByRole('dialog')) await user.keyboard('{Escape}');
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
            expect(pill('needs-value:currency')).toHaveFocus();
        });

        it("hands focus back to the pill after a viewer's Apply", async () => {
            const { user } = setup({
                controls: [
                    control('currency', {
                        value: 'EUR',
                        parameters: { currency: { except: ['tile-2'] } },
                    }),
                ],
                references: { 'tile-1': ['currency'], 'tile-2': ['currency'] },
                isViewer: true,
            });
            await user.click(pill('needs-value:currency'));
            await user.click(screen.getByRole('combobox'));
            await user.click(
                await screen.findByRole('option', { name: 'USD' }),
            );
            await user.click(screen.getByRole('button', { name: 'Apply' }));
            expect(pill('needs-value:currency')).toHaveFocus();
        });

        it("adds it to the bar from an editor's popover", async () => {
            const { store, user } = setup({ controls: [control('region')] });
            await user.click(pill('needs-value:currency'));
            await user.click(
                screen.getByRole('button', { name: 'Add to the bar' }),
            );
            const saved = store.getState().parameters.parameterControls;
            expect(saved?.map(({ parameters }) => parameters)).toEqual([
                { region: 'all' },
                { currency: 'all' },
            ]);
            expect(
                store.getState().parameters.haveParameterControlsChanged,
            ).toBe(true);
        });

        it("picks a value from a viewer's popover", async () => {
            const { user } = setup({
                controls: [control('region')],
                isViewer: true,
            });
            await user.click(pill('needs-value:currency'));
            await user.click(screen.getByRole('combobox'));
            await user.click(
                await screen.findByRole('option', { name: 'USD' }),
            );
            await user.click(screen.getByRole('button', { name: 'Apply' }));
            expect(setParameter).toHaveBeenCalledWith('currency', 'USD');
        });
    });

    describe('editing', () => {
        it("an editor's Apply writes the control, not a pick", async () => {
            const { store, user } = setup({
                controls: [control('region', { value: 'EMEA' })],
            });
            await user.click(pill('region'));
            expect(
                screen.getByRole('dialog', { name: 'Region' }),
            ).toBeInTheDocument();
            await user.click(screen.getByRole('combobox'));
            await user.click(
                await screen.findByRole('option', { name: 'APAC' }),
            );
            // Only the draft so far
            expect(
                store.getState().parameters.parameterControls?.[0].value,
            ).toBe('EMEA');
            await user.click(screen.getByRole('button', { name: 'Apply' }));
            expect(
                store.getState().parameters.parameterControls?.[0].value,
            ).toBe('APAC');
            expect(setParameter).not.toHaveBeenCalled();
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
            expect(pill('region')).toHaveFocus();
        });

        it("a viewer's Apply picks the value by key", async () => {
            const { store, user } = setup({
                controls: [
                    control('region', {
                        value: 'EMEA',
                        parameters: { region: 'all', currency: 'all' },
                    }),
                ],
                isViewer: true,
            });
            await user.click(pill('region'));
            await user.click(screen.getByRole('combobox'));
            await user.click(
                await screen.findByRole('option', { name: 'APAC' }),
            );
            await user.click(screen.getByRole('button', { name: 'Apply' }));
            expect(setParameter).not.toHaveBeenCalled();
            expect(store.getState().parameters.parameterControlPicks).toEqual({
                region: 'APAC',
            });
            expect(
                store.getState().parameters.haveParameterControlsChanged,
            ).toBe(false);
        });

        it('Cancel, Escape and a press outside drop the draft', async () => {
            const { store, user } = setup({
                controls: [control('region', { value: 'EMEA' })],
            });
            for (const close of [
                () =>
                    user.click(screen.getByRole('button', { name: 'Cancel' })),
                () => user.keyboard('{Escape}'),
                () => user.click(document.body),
            ]) {
                await user.click(pill('region'));
                await user.click(
                    screen.getByRole('button', { name: 'Settings' }),
                );
                await user.click(
                    screen.getByRole('button', { name: 'Rename' }),
                );
                await user.keyboard('Sales region{Enter}');
                await close();
                expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
            }
            expect(
                store.getState().parameters.parameterControls?.[0].label,
            ).toBe('Region');
        });

        it('keeps a saved value outside the options through an unrelated edit', async () => {
            const { store, user } = setup({
                controls: [control('region', { value: 'LATAM' })],
            });
            expect(pill('region')).toHaveTextContent('Region is not set');
            await user.click(pill('region'));
            await user.click(screen.getByRole('button', { name: 'Settings' }));
            await user.click(screen.getByRole('button', { name: 'Rename' }));
            await user.keyboard('Sales region{Enter}');
            await user.click(screen.getByRole('button', { name: 'Apply' }));
            expect(store.getState().parameters.parameterControls?.[0]).toEqual(
                expect.objectContaining({
                    label: 'Sales region',
                    value: 'LATAM',
                }),
            );
        });

        it('a mode round trip ends the edit: the draft does not come back', async () => {
            const { store, user, setViewer } = setup({
                controls: [control('region', { value: 'EMEA' })],
            });
            await user.click(pill('region'));
            await user.click(screen.getByRole('button', { name: 'Settings' }));
            await user.click(screen.getByRole('button', { name: 'Rename' }));
            await user.keyboard('Sales region{Enter}');
            act(() => setViewer(true));
            act(() => setViewer(false));
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
            // An editor's edit is settled as Apply would, as a filter's is
            expect(
                store.getState().parameters.parameterControls?.[0].label,
            ).toBe('Sales region');
        });

        it('a mode round trip ends a control opened from "Add"', async () => {
            const { store, user, setViewer } = setup({
                controls: [],
                references: { 'tile-1': ['region'] },
                added: {
                    control: control('new', {
                        label: 'Region',
                        parameters: { region: 'all' },
                    }),
                    parameterKeys: ['region'],
                    tileUuids: ['tile-1'],
                },
            });
            await user.click(screen.getByRole('button', { name: 'Add it' }));
            expect(screen.getByRole('dialog')).toBeInTheDocument();
            act(() => setViewer(true));
            act(() => setViewer(false));
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
            // An editor's edit settles as Apply would, a new control too
            expect(store.getState().parameters.parameterControls).toEqual([
                expect.objectContaining({
                    id: 'new',
                    parameters: { region: 'all' },
                }),
            ]);
        });

        it('a mode change saves a control from Add that sets no tiles', async () => {
            const { store, user, setViewer } = setup({
                controls: [
                    control('first', {
                        label: 'Region',
                        parameters: { region: 'all' },
                    }),
                ],
                references: { 'tile-1': ['region'] },
                added: {
                    control: control('new', {
                        label: 'Region',
                        parameters: { region: { only: [] } },
                    }),
                    parameterKeys: ['region'],
                    tileUuids: [],
                },
            });
            await user.click(screen.getByRole('button', { name: 'Add it' }));
            // A second control can be saved without assigning tiles
            expect(
                within(screen.getByRole('dialog')).getByRole('button', {
                    name: 'Apply',
                }),
            ).toBeEnabled();
            act(() => setViewer(true));
            act(() => setViewer(false));
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
            expect(
                store
                    .getState()
                    .parameters.parameterControls?.map(({ id }) => id),
            ).toEqual(['first', 'new']);
        });

        it("a viewer's edit is dropped on a mode change", async () => {
            const { user, setViewer } = setup({
                controls: [control('region', { value: 'EMEA' })],
                isViewer: true,
            });
            await user.click(pill('region'));
            act(() => setViewer(false));
            act(() => setViewer(true));
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
            expect(setParameter).not.toHaveBeenCalled();
        });

        it('opening another control closes the first', async () => {
            const { user } = setup({
                controls: [control('region'), control('currency')],
            });
            await user.click(pill('region'));
            await user.click(pill('currency'));
            expect(screen.getAllByRole('dialog')).toHaveLength(1);
            expect(
                screen.getByRole('dialog', { name: 'Currency' }),
            ).toBeInTheDocument();
            // A second click on the open, clean pill closes it
            await user.click(pill('currency'));
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });

        it('asks before switching to another control with unapplied changes', async () => {
            const { store, user } = setup({
                controls: [control('region'), control('currency')],
            });
            const rename = async () => {
                await user.click(pill('region'));
                await user.click(
                    screen.getByRole('button', { name: 'Settings' }),
                );
                await user.click(
                    screen.getByRole('button', { name: 'Rename' }),
                );
                await user.keyboard('Sales region{Enter}');
                await user.click(pill('currency'));
            };
            await rename();
            expect(
                screen.getByText('Apply changes to Sales region first?'),
            ).toBeInTheDocument();
            expect(
                screen.getByRole('dialog', { name: 'Sales region' }),
            ).toBeInTheDocument();
            await user.click(screen.getByRole('button', { name: 'Discard' }));
            expect(
                screen.getByRole('dialog', { name: 'Currency' }),
            ).toBeInTheDocument();
            expect(
                store.getState().parameters.parameterControls?.[0].label,
            ).toBe('Region');

            await user.keyboard('{Escape}');
            await rename();
            // Escape withdraws the question and keeps the edit
            await user.keyboard('{Escape}');
            expect(
                screen.queryByText('Apply changes to Sales region first?'),
            ).not.toBeInTheDocument();
            expect(
                screen.getByRole('dialog', { name: 'Sales region' }),
            ).toBeInTheDocument();
            await user.click(pill('currency'));
            await user.click(
                within(
                    screen.getByText('Apply changes to Sales region first?')
                        .parentElement as HTMLElement,
                ).getByRole('button', { name: 'Apply' }),
            );
            expect(
                store.getState().parameters.parameterControls?.[0].label,
            ).toBe('Sales region');
            expect(
                screen.getByRole('dialog', { name: 'Currency' }),
            ).toBeInTheDocument();
        });

        it("asks before a filter's pill opens over unapplied changes, then lets the click through", async () => {
            const { store, user } = setup({ controls: [control('region')] });
            // Clean: the edit closes and the filter opens at once
            await user.click(pill('region'));
            await user.click(
                screen.getByRole('button', { name: 'Status filter' }),
            );
            expect(openFilter).toHaveBeenCalledTimes(1);
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

            await user.click(pill('region'));
            await user.click(screen.getByRole('button', { name: 'Settings' }));
            await user.click(screen.getByRole('button', { name: 'Rename' }));
            await user.keyboard('Sales region{Enter}');
            await user.click(
                screen.getByRole('button', { name: 'Status filter' }),
            );
            expect(openFilter).toHaveBeenCalledTimes(1);
            expect(
                screen.getByText('Apply changes to Sales region first?'),
            ).toBeInTheDocument();
            await user.click(
                within(
                    screen.getByText('Apply changes to Sales region first?')
                        .parentElement as HTMLElement,
                ).getByRole('button', { name: 'Apply' }),
            );
            expect(
                store.getState().parameters.parameterControls?.[0].label,
            ).toBe('Sales region');
            expect(openFilter).toHaveBeenCalledTimes(2);
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });

        it('moves its section on the dashboard at once, as a filter does', async () => {
            const { store, user } = setup({
                controls: [control('region', { value: 'EMEA' })],
            });
            act(() => {
                seedDashboardEditState(store, {
                    dashboard: {
                        config: {
                            isDateZoomDisabled: false,
                            controlSections: [{ id: 'market', name: 'Market' }],
                        },
                    },
                });
            });
            await user.click(pill('region'));
            await user.click(screen.getByRole('button', { name: 'Settings' }));
            await user.click(screen.getByRole('combobox', { name: 'Section' }));
            await user.click(
                await screen.findByRole('option', { name: 'Market' }),
            );
            expect(
                store.getState().parameters.parameterControls?.[0].sectionId,
            ).toBe('market');
            await user.click(screen.getByRole('button', { name: 'Cancel' }));
            expect(
                store.getState().parameters.parameterControls?.[0].sectionId,
            ).toBe('market');
        });

        it('allows Apply for an explicit control without tiles', async () => {
            const { user } = setup({
                controls: [
                    control('region', { parameters: { region: { only: [] } } }),
                ],
            });
            await user.click(pill('region'));
            expect(screen.getByText('Sets 0 of 2 tiles')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled();
        });

        it('viewers set the value only, and cannot remove or move', async () => {
            const { user } = setup({
                controls: [control('region'), control('currency')],
                isViewer: true,
            });
            expect(
                screen.queryByRole('button', { name: 'Remove parameter' }),
            ).not.toBeInTheDocument();
            pill('region').focus();
            await user.keyboard('{Alt>}{ArrowRight}{/Alt}');
            expect(pills()).toEqual(['region', 'currency']);
            await user.click(pill('region'));
            for (const name of [/^Settings/, /^Rename$/])
                expect(screen.queryByRole('button', { name })).toBeNull();
        });
    });

    describe('tiles a control sets', () => {
        it('counts only the tiles the control sets: one a selected control took is not the all control any more', async () => {
            const { user } = setup({
                controls: [
                    control('region', {
                        parameters: { region: { except: ['tile-2'] } },
                    }),
                    control('chosen', {
                        label: 'Chosen',
                        parameters: { region: { only: ['tile-2'] } },
                    }),
                ],
                references: { 'tile-1': ['region'], 'tile-2': ['region'] },
            });
            await user.click(pill('region'));
            expect(screen.getByText('Sets 1 of 2 tiles')).toBeInTheDocument();
        });
    });

    describe('hidden from viewers', () => {
        it("leaves a hidden control off a viewer's bar, and muted on an editor's", () => {
            const controls = [
                control('region', { value: 'EMEA', hidden: true }),
                control('currency'),
            ];
            setup({ controls, isViewer: true });
            expect(pills()).toEqual(['currency']);
            document.body.innerHTML = '';
            setup({ controls });
            expect(pills()).toEqual(['region', 'currency']);
            expect(pill('region')).toHaveAttribute('data-hidden');
            expect(pill('currency')).not.toHaveAttribute('data-hidden');
        });

        it("hides and shows a control from the popover's Settings, applied with the edit", async () => {
            const { store, user } = setup({ controls: [control('region')] });
            await user.click(pill('region'));
            await user.click(screen.getByRole('button', { name: 'Settings' }));
            await user.click(
                await screen.findByRole('button', {
                    name: 'Hide for viewers',
                }),
            );
            // Only the draft so far
            expect(
                store.getState().parameters.parameterControls?.[0].hidden,
            ).toBeUndefined();
            await user.click(screen.getByRole('button', { name: 'Apply' }));
            expect(
                store.getState().parameters.parameterControls?.[0].hidden,
            ).toBe(true);

            await user.click(pill('region'));
            await user.click(screen.getByRole('button', { name: 'Settings' }));
            await user.click(
                await screen.findByRole('button', {
                    name: 'Show for viewers',
                }),
            );
            await user.click(screen.getByRole('button', { name: 'Apply' }));
            expect(
                store.getState().parameters.parameterControls?.[0],
            ).not.toHaveProperty('hidden');
        });
    });

    describe('edit mode', () => {
        it('marks the tiles a control sets while its pill is hovered, as a filter pill does', async () => {
            const { user } = setup({
                controls: [
                    control('region', {
                        parameters: { region: { except: ['tile-2'] } },
                    }),
                ],
            });
            const marked = () =>
                [
                    ...document.querySelectorAll<HTMLElement>(
                        '[data-controls-hovered]',
                    ),
                ].map((tile) => tile.dataset.tileUuid);
            await user.hover(pill('region'));
            expect(marked()).toEqual(['tile-1']);
            await user.unhover(pill('region'));
            await waitFor(() => expect(marked()).toEqual([]));
        });

        it('marks nothing for a viewer', async () => {
            const { user } = setup({
                controls: [control('region')],
                isViewer: true,
            });
            await user.hover(pill('region'));
            expect(
                document.querySelector('[data-controls-hovered]'),
            ).toBeNull();
        });

        it("shows only the X's tooltip while the pointer is on it, not the pill's description", async () => {
            const { user } = setup({ controls: [control('region')] });
            await user.hover(removeButton('region'));
            // Past the pill tooltip's delay
            await act(() => new Promise((resolve) => setTimeout(resolve, 700)));
            const tooltips = screen.queryAllByRole('tooltip');
            expect(tooltips.map((tooltip) => tooltip.textContent)).toEqual([
                'Remove parameter',
            ]);
        });

        it("takes a control off the bar with the pill's X", async () => {
            const { store, user } = setup({
                controls: [control('region'), control('currency')],
            });
            const remove = removeButton('region');
            expect(pill('region')).not.toContainElement(remove);
            pill('region').focus();
            await user.tab();
            expect(remove).toHaveFocus();
            await user.keyboard('{Enter}');
            expect(
                store
                    .getState()
                    .parameters.parameterControls?.map(({ id }) => id),
            ).toEqual(['currency']);
            expect(
                store.getState().parameters.haveParameterControlsChanged,
            ).toBe(true);
        });

        it('moves a control one place with Alt and an arrow, keeping focus', async () => {
            const { store, user } = setup({
                controls: [control('region'), control('currency')],
            });
            pill('region').focus();
            await user.keyboard('{Alt>}{ArrowRight}{/Alt}');
            expect(
                store
                    .getState()
                    .parameters.parameterControls?.map(({ id }) => id),
            ).toEqual(['currency', 'region']);
            expect(
                document.querySelector('[aria-live="polite"]'),
            ).toHaveTextContent('Region moved after Currency');
            // Nothing past the end
            await user.keyboard('{Alt>}{ArrowRight}{/Alt}');
            expect(
                store
                    .getState()
                    .parameters.parameterControls?.map(({ id }) => id),
            ).toEqual(['currency', 'region']);
        });
    });
});

describe('ParameterEditorProvider with controls off', () => {
    it('adds no live region while nothing is seeded (the flag off)', () => {
        renderWithProviders(
            <DashboardStoreTestProvider store={createDashboardTestStore()}>
                <ParameterEditorProvider isViewer={false}>
                    <span>bar</span>
                </ParameterEditorProvider>
            </DashboardStoreTestProvider>,
        );
        expect(document.querySelector('[aria-live]')).toBeNull();
    });
});
