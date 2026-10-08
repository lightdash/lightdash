import {
    DashboardTileTypes,
    DimensionType,
    FieldType,
    FilterOperator,
    type DashboardFilterRule,
    type DashboardTile,
    type FilterableDimension,
} from '@lightdash/common';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
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

const setDashboard = (
    addedFields: FilterableDimension[],
    rules: DashboardFilterRule[] = [rule()],
) => {
    mockDashboardContext.current = {
        dashboardTiles: allTiles,
        dashboardFilters: {
            dimensions: rules,
            metrics: [],
            tableCalculations: [],
        },
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
const linkButton = (tileUuid: string) =>
    card(tileUuid).getByRole('button', { name: 'Link' });

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

    it('preselects the only candidate and links the tile to it', async () => {
        renderWithProviders(<LinkPrompts />);

        expect(
            card(added.uuid).getByText('A filter could reach this tile'),
        ).toBeVisible();
        expect(card(added.uuid).getByText('Status')).toBeVisible();
        expect(select(added.uuid)).toHaveValue('Method');
        expect(linkButton(added.uuid)).toBeEnabled();
        expect(container(added.uuid).firstElementChild).toHaveAttribute(
            'data-wave',
            '0',
        );

        await userEvent.click(linkButton(added.uuid));

        expect(updateFilter).toHaveBeenCalledTimes(1);
        expect(updateFilter.mock.calls[0][0].tileTargets).toEqual({
            [added.uuid]: { fieldId: 'payments_method', tableName: 'payments' },
        });
    });

    it('keeps Link disabled until one of several candidates is picked', async () => {
        setDashboard([paymentsMethod, paymentsState]);
        renderWithProviders(<LinkPrompts />);

        expect(select(added.uuid)).toHaveValue('');
        expect(select(added.uuid)).toHaveAttribute(
            'placeholder',
            'Pick a field',
        );
        expect(linkButton(added.uuid)).toBeDisabled();

        await userEvent.click(select(added.uuid));
        const options = screen.getAllByRole('option', { hidden: true });
        expect(options.map((option) => option.textContent)).toEqual([
            'Method',
            'State',
        ]);
        await userEvent.click(options[1]);
        await userEvent.click(linkButton(added.uuid));

        expect(updateFilter.mock.calls[0][0].tileTargets[added.uuid]).toEqual({
            fieldId: 'payments_state',
            tableName: 'payments',
        });
    });

    it('lists every filter that could reach the tile under its label', () => {
        setDashboard(
            [paymentsMethod],
            [rule(), rule({ id: 'rule-2', label: 'Second' })],
        );
        renderWithProviders(<LinkPrompts />);

        expect(
            card(added.uuid).getByText('Filters that could reach this tile'),
        ).toBeVisible();
        expect(select(added.uuid, 'Status')).toHaveValue('Method');
        expect(select(added.uuid, 'Second')).toHaveValue('Method');
    });

    it('skips a filter for the tile', async () => {
        renderWithProviders(<LinkPrompts />);

        await userEvent.click(
            card(added.uuid).getByRole('button', { name: 'Skip' }),
        );

        expect(dismissLink).toHaveBeenCalledWith(added.uuid, 'rule-1');
        expect(updateFilter).not.toHaveBeenCalled();
    });

    it('swallows mouse down and click on the veil', async () => {
        const onPointer = vi.fn();
        renderWithProviders(
            <div onMouseDown={onPointer} onClick={onPointer}>
                <LinkPrompts />
            </div>,
        );

        await userEvent.click(container(added.uuid).firstElementChild!);

        expect(onPointer).not.toHaveBeenCalled();
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
});
