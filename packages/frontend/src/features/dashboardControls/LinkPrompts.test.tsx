import {
    DashboardTileTypes,
    DimensionType,
    FieldType,
    FilterOperator,
    type DashboardFilterRule,
    type DashboardTile,
    type FilterableDimension,
} from '@lightdash/common';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createDashboardTestStore,
    type DashboardEditTestValues,
    seedDashboardEditState,
} from '../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../testing/DashboardStoreTestProvider';
import { renderWithProviders as renderWithAppProviders } from '../../testing/testUtils';
import { type DashboardStore } from '../dashboard/store';
import { getLinkKey } from './linkCandidates';
import { LinkPrompts } from './LinkPrompts';

const mockSidebar = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));
const mockDashboardContext = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));
const mockContainers = vi.hoisted(() => ({
    current: {} as Record<string, Element>,
}));
const mockParams = vi.hoisted(() => ({
    current: {} as { mode?: string },
}));

vi.mock('./useControlsSidebar', () => ({
    useControlsSidebar: () => mockSidebar.current,
    useControlsSidebarSelector: (
        selector: (value: Record<string, unknown>) => unknown,
    ) => selector(mockSidebar.current),
}));
vi.mock('../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector) => selector(mockDashboardContext.current)),
}));
vi.mock('./usePortalTargets', () => ({
    usePortalTargets: (keys: string[], _: unknown, enabled: boolean) =>
        enabled
            ? Object.fromEntries(
                  keys.map((key) => [key, mockContainers.current[key]]),
              )
            : {},
}));
vi.mock('react-router', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    useParams: () => mockParams.current,
}));

const dimension = (
    table: string,
    name: string,
    label: string,
    type: DimensionType,
): FilterableDimension => ({
    fieldType: FieldType.DIMENSION,
    type,
    name,
    label,
    table,
    tableLabel: table,
    sql: `\${TABLE}.${name}`,
    hidden: false,
});

const ordersStatus = dimension(
    'orders',
    'status',
    'Status',
    DimensionType.STRING,
);
const paymentsMethod = dimension(
    'payments',
    'method',
    'Method',
    DimensionType.STRING,
);
const paymentsState = dimension(
    'payments',
    'state',
    'State',
    DimensionType.STRING,
);
const paymentsAmount = dimension(
    'payments',
    'amount',
    'Amount',
    DimensionType.NUMBER,
);

const tile = (uuid: string) =>
    ({
        uuid,
        tabUuid: 'tab-1',
        type: DashboardTileTypes.SAVED_CHART,
        properties: { title: `Title ${uuid}` },
    }) as DashboardTile;

const added = tile('tile-added');
const saved = tile('tile-saved');
const allTiles = [added, saved];

const rule = (
    overrides: Partial<DashboardFilterRule> = {},
): DashboardFilterRule => ({
    id: 'rule-1',
    label: undefined,
    operator: FilterOperator.EQUALS,
    target: { fieldId: 'orders_status', tableName: 'orders' },
    values: [],
    ...overrides,
});

const updateFilter = vi.fn();
const dismissLink = vi.fn();

const setSidebar = (overrides: Record<string, unknown> = {}) => {
    mockSidebar.current = {
        isSidebarOpen: false,
        newTileUuids: [added.uuid],
        dismissedLinks: [],
        updateFilter,
        dismissLink,
        ...overrides,
    };
};

let dashboardStore: DashboardStore = createDashboardTestStore();
// A rerender reads the store `setDashboard` made last
const withStore = (node: ReactElement) => (
    <DashboardStoreTestProvider
        store={seedDashboardEditState(
            dashboardStore,
            mockDashboardContext.current as DashboardEditTestValues,
        )}
    >
        {node}
    </DashboardStoreTestProvider>
);
const renderWithProviders = (ui: ReactElement) => {
    const result = renderWithAppProviders(withStore(ui));
    return {
        ...result,
        rerender: (node: ReactElement) => result.rerender(withStore(node)),
    };
};

const setDashboard = (
    addedFields: FilterableDimension[],
    rules: DashboardFilterRule[] = [rule()],
) => {
    dashboardStore = createDashboardTestStore({
        dashboardFilters: {
            dimensions: rules,
            metrics: [],
            tableCalculations: [],
        },
    });
    mockDashboardContext.current = {
        dashboardTiles: allTiles,
        allFilterableFieldsMap: {
            orders_status: ordersStatus,
            payments_method: paymentsMethod,
            payments_state: paymentsState,
            payments_amount: paymentsAmount,
        },
        filterableFieldsByTileUuid: {
            [added.uuid]: addedFields,
            [saved.uuid]: [paymentsMethod],
        },
    };
};

const container = (tileUuid: string) =>
    mockContainers.current[tileUuid] as HTMLElement;
const card = (tileUuid: string) => within(container(tileUuid));
const select = (tileUuid: string, filterLabel = 'Status') =>
    card(tileUuid).getByLabelText(`Field for ${filterLabel} on this tile`, {
        selector: 'input',
    });
const applyButton = (tileUuid: string) =>
    card(tileUuid).getByRole('button', { name: /^Apply \d+ filters? to / });
const skipButton = (tileUuid: string) =>
    card(tileUuid).getByRole('button', { name: /^Skip / });
const pick = async (tileUuid: string, filterLabel: string, option: string) => {
    const input = select(tileUuid, filterLabel);
    await userEvent.click(input);
    // Each select's list stays in the document once opened
    const list = document.getElementById(input.getAttribute('aria-controls')!)!;
    await userEvent.click(
        within(list).getByRole('option', { name: option, hidden: true }),
    );
};
const twoFilters = [rule(), rule({ id: 'rule-2', label: 'Second' })];
const threeFilters = [...twoFilters, rule({ id: 'rule-3', label: 'Third' })];

describe('LinkPrompts', () => {
    beforeEach(() => {
        updateFilter.mockClear();
        dismissLink.mockClear();
        document.body.innerHTML = '';
        mockContainers.current = Object.fromEntries(
            allTiles.map((t) => {
                const element = document.createElement('div');
                element.setAttribute('data-tile-uuid', t.uuid);
                document.body.appendChild(element);
                return [t.uuid, element];
            }),
        );
        mockParams.current = { mode: 'edit' };
        setDashboard([paymentsMethod, paymentsAmount]);
        setSidebar();
    });

    it('summarises the only candidate and links the tile to it', async () => {
        renderWithProviders(<LinkPrompts />);

        expect(
            card(added.uuid).getByText('This tile can use a filter'),
        ).toBeVisible();
        expect(
            card(added.uuid).getByText('1 filter links automatically'),
        ).toBeVisible();
        expect(card(added.uuid).getByText('Status → Method')).toBeVisible();
        expect(
            card(added.uuid).queryByLabelText('Field for Status on this tile'),
        ).not.toBeInTheDocument();
        expect(applyButton(added.uuid)).toHaveTextContent('Apply');
        expect(applyButton(added.uuid)).toHaveAccessibleName(
            'Apply 1 filter to Title tile-added',
        );
        expect(container(added.uuid).firstElementChild).toHaveAttribute(
            'data-wave',
            '0',
        );

        await userEvent.click(applyButton(added.uuid));

        expect(updateFilter).toHaveBeenCalledTimes(1);
        expect(updateFilter.mock.calls[0][0].tileTargets).toEqual({
            [added.uuid]: { fieldId: 'payments_method', tableName: 'payments' },
        });
        expect(dismissLink).not.toHaveBeenCalled();
    });

    it('keeps Apply disabled until one of several candidates is picked', async () => {
        setDashboard([paymentsMethod, paymentsState]);
        renderWithProviders(<LinkPrompts />);

        expect(select(added.uuid)).toHaveValue('');
        expect(select(added.uuid)).toHaveAttribute(
            'placeholder',
            'Not filtered',
        );
        expect(card(added.uuid).queryByText('Needs a field')).toBeNull();
        expect(applyButton(added.uuid)).toBeDisabled();

        await userEvent.click(select(added.uuid));
        const options = screen.getAllByRole('option', { hidden: true });
        expect(options.map((option) => option.textContent)).toEqual([
            'Method',
            'State',
        ]);
        await userEvent.click(options[1]);
        await userEvent.click(applyButton(added.uuid));

        expect(updateFilter.mock.calls[0][0].tileTargets[added.uuid]).toEqual({
            fieldId: 'payments_state',
            tableName: 'payments',
        });
    });

    it('expands the summarised filters on Review', async () => {
        setDashboard([paymentsMethod], twoFilters);
        renderWithProviders(<LinkPrompts />);

        expect(
            card(added.uuid).getByText('This tile can use 2 filters'),
        ).toBeVisible();
        expect(
            card(added.uuid).getByText('2 filters link automatically'),
        ).toBeVisible();
        expect(
            card(added.uuid).getByText('Status → Method · Second → Method'),
        ).toBeVisible();
        expect(applyButton(added.uuid)).toHaveTextContent('Apply all 2');
        const review = card(added.uuid).getByRole('button', {
            name: 'Review',
        });
        expect(review).toHaveAttribute('aria-expanded', 'false');

        await userEvent.click(review);

        expect(
            card(added.uuid).queryByText('2 filters link automatically'),
        ).toBeNull();
        expect(select(added.uuid, 'Status')).toHaveValue('Method');
        expect(select(added.uuid, 'Second')).toHaveValue('Method');
    });

    it('leaves out a cleared filter: Apply links the others and skips it', async () => {
        setDashboard([paymentsMethod], twoFilters);
        renderWithProviders(<LinkPrompts />);
        await userEvent.click(
            card(added.uuid).getByRole('button', { name: 'Review' }),
        );

        // Picking the chosen option again clears it
        await pick(added.uuid, 'Second', 'Method');

        expect(select(added.uuid, 'Second')).toHaveValue('');
        expect(applyButton(added.uuid)).toHaveTextContent('Apply 1, skip 1');
        expect(applyButton(added.uuid)).toHaveAccessibleName(
            'Apply 1 filter to Title tile-added, skip 1',
        );

        await userEvent.click(applyButton(added.uuid));

        expect(updateFilter).toHaveBeenCalledTimes(1);
        expect(updateFilter.mock.calls[0][0].id).toBe('rule-1');
        expect(dismissLink).toHaveBeenCalledTimes(1);
        expect(dismissLink).toHaveBeenCalledWith(added.uuid, 'rule-2');
    });

    it('labels Apply by what it links and skips', async () => {
        const withPeer = rule({
            tileTargets: {
                [saved.uuid]: {
                    fieldId: 'payments_method',
                    tableName: 'payments',
                },
            },
        });
        setDashboard(
            [paymentsMethod, paymentsState],
            [withPeer, ...threeFilters.slice(1)],
        );
        renderWithProviders(<LinkPrompts />);

        expect(
            card(added.uuid).getByText('1 filter links automatically'),
        ).toBeVisible();
        expect(card(added.uuid).getByText('2 need a field')).toBeVisible();
        expect(applyButton(added.uuid)).toHaveTextContent('Apply 1, skip 2');
        expect(applyButton(added.uuid)).toBeEnabled();

        await pick(added.uuid, 'Second', 'State');
        await pick(added.uuid, 'Third', 'Method');

        expect(applyButton(added.uuid)).toHaveTextContent('Apply all 3');
    });

    it('disables Apply when no filter has a field', () => {
        setDashboard([paymentsMethod, paymentsState], twoFilters);
        renderWithProviders(<LinkPrompts />);

        expect(applyButton(added.uuid)).toHaveTextContent('Apply 0, skip 2');
        expect(applyButton(added.uuid)).toBeDisabled();
    });

    it('skips every filter on the tile', async () => {
        setDashboard([paymentsMethod], twoFilters);
        renderWithProviders(<LinkPrompts />);

        const skip = skipButton(added.uuid);
        expect(skip).toHaveTextContent('Skip all');
        expect(skip).toHaveAccessibleName(
            'Skip all filters on Title tile-added',
        );
        await userEvent.click(skip);

        expect(dismissLink).toHaveBeenCalledTimes(2);
        expect(dismissLink).toHaveBeenCalledWith(added.uuid, 'rule-1');
        expect(dismissLink).toHaveBeenCalledWith(added.uuid, 'rule-2');
        expect(updateFilter).not.toHaveBeenCalled();
    });

    it('skips the only filter for the tile', async () => {
        renderWithProviders(<LinkPrompts />);

        const skip = skipButton(added.uuid);
        expect(skip).toHaveTextContent(/^Skip$/);
        expect(skip).toHaveAccessibleName('Skip Status on Title tile-added');
        await userEvent.click(skip);

        expect(dismissLink).toHaveBeenCalledWith(added.uuid, 'rule-1');
        expect(updateFilter).not.toHaveBeenCalled();
    });

    it('marks the veil for the grid and lets a mouse down reach the document', () => {
        const onMouseDown = vi.fn();
        document.addEventListener('mousedown', onMouseDown);
        renderWithProviders(<LinkPrompts />);
        const veil = container(added.uuid).firstElementChild!;

        // The grid's draggableCancel selector
        expect(veil).toHaveClass('non-draggable');
        expect(veil).toHaveAttribute('data-controls-overlay');

        fireEvent.mouseDown(veil);
        document.removeEventListener('mousedown', onMouseDown);

        expect(onMouseDown).toHaveBeenCalledTimes(1);
    });

    it('shows nothing for a dismissed pair', () => {
        setSidebar({ dismissedLinks: [getLinkKey(added.uuid, 'rule-1')] });
        renderWithProviders(<LinkPrompts />);

        expect(container(added.uuid)).toBeEmptyDOMElement();
    });

    it('shows nothing once the tile is linked', () => {
        setDashboard(
            [paymentsMethod],
            [
                rule({
                    tileTargets: {
                        [added.uuid]: {
                            fieldId: 'payments_method',
                            tableName: 'payments',
                        },
                    },
                }),
            ],
        );
        renderWithProviders(<LinkPrompts />);

        expect(container(added.uuid)).toBeEmptyDOMElement();
    });

    it('shows nothing on a tile that has the target field', () => {
        setDashboard([ordersStatus, paymentsMethod]);
        renderWithProviders(<LinkPrompts />);

        expect(container(added.uuid)).toBeEmptyDOMElement();
    });

    it('shows nothing on a tile that is not new', () => {
        renderWithProviders(<LinkPrompts />);

        expect(container(saved.uuid)).toBeEmptyDOMElement();
    });

    it('renders nothing while the sidebar is open', () => {
        setSidebar({ isSidebarOpen: true });
        renderWithProviders(<LinkPrompts />);

        expect(container(added.uuid)).toBeEmptyDOMElement();
    });

    it('renders nothing in view mode', () => {
        mockParams.current = {};
        renderWithProviders(<LinkPrompts />);

        expect(container(added.uuid)).toBeEmptyDOMElement();
    });

    describe('the choice follows the candidates', () => {
        it('drops a choice that is no longer offered and takes the only one left', async () => {
            setDashboard([paymentsMethod, paymentsState]);
            const { rerender } = renderWithProviders(<LinkPrompts />);
            await pick(added.uuid, 'Status', 'State');
            expect(select(added.uuid)).toHaveValue('State');

            // The filter gained Method as a peer on another tile: only that
            // one is offered now
            setDashboard(
                [paymentsMethod, paymentsState],
                [
                    rule({
                        tileTargets: {
                            [saved.uuid]: {
                                fieldId: 'payments_method',
                                tableName: 'payments',
                            },
                        },
                    }),
                ],
            );
            rerender(<LinkPrompts />);

            expect(card(added.uuid).getByText('Status → Method')).toBeVisible();
            await userEvent.click(applyButton(added.uuid));
            expect(
                updateFilter.mock.calls[0][0].tileTargets[added.uuid],
            ).toEqual({ fieldId: 'payments_method', tableName: 'payments' });
        });

        it('keeps Apply off when the choice left and several are still offered', async () => {
            const paymentsKind = dimension(
                'payments',
                'kind',
                'Kind',
                DimensionType.STRING,
            );
            setDashboard([paymentsMethod, paymentsState, paymentsKind]);
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                allFilterableFieldsMap: {
                    ...(mockDashboardContext.current
                        .allFilterableFieldsMap as object),
                    payments_kind: paymentsKind,
                },
            };
            const { rerender } = renderWithProviders(<LinkPrompts />);
            await pick(added.uuid, 'Status', 'Kind');
            expect(applyButton(added.uuid)).toBeEnabled();

            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                filterableFieldsByTileUuid: {
                    [added.uuid]: [paymentsMethod, paymentsState],
                    [saved.uuid]: [paymentsMethod],
                },
            };
            rerender(<LinkPrompts />);

            expect(select(added.uuid)).toHaveValue('');
            expect(applyButton(added.uuid)).toBeDisabled();
        });
    });

    it('tells apart two candidates that read the same by their table', async () => {
        const refundsMethod = dimension(
            'refunds',
            'method',
            'Method',
            DimensionType.STRING,
        );
        setDashboard([paymentsMethod, refundsMethod]);
        mockDashboardContext.current = {
            ...mockDashboardContext.current,
            allFilterableFieldsMap: {
                ...(mockDashboardContext.current
                    .allFilterableFieldsMap as object),
                refunds_method: refundsMethod,
            },
        };
        renderWithProviders(<LinkPrompts />);

        await userEvent.click(select(added.uuid));
        expect(
            screen
                .getAllByRole('option', { hidden: true })
                .map((option) => option.textContent),
        ).toEqual(['payments Method', 'refunds Method']);
    });

    describe('focus after the card is answered', () => {
        // Skips for real, so the card leaves the page
        const Harness = () => {
            const [dismissedLinks, setDismissedLinks] = useState<string[]>([]);
            mockSidebar.current = {
                ...mockSidebar.current,
                dismissedLinks,
                dismissLink: (tileUuid: string, ruleId: string) =>
                    setDismissedLinks((links) => [
                        ...links,
                        getLinkKey(tileUuid, ruleId),
                    ]),
            };
            return <LinkPrompts />;
        };

        it('goes to the tile after Skip all', async () => {
            setDashboard([paymentsMethod], twoFilters);
            renderWithProviders(<Harness />);

            await userEvent.click(skipButton(added.uuid));

            expect(container(added.uuid).firstElementChild).toBeNull();
            expect(container(added.uuid)).toHaveFocus();
        });

        it('goes to the tile after Apply', async () => {
            setDashboard([paymentsMethod, paymentsState]);
            renderWithProviders(<Harness />);
            await pick(added.uuid, 'Status', 'State');

            await userEvent.click(applyButton(added.uuid));

            expect(container(added.uuid)).toHaveFocus();
        });
    });
});
