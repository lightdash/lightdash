import {
    DashboardTileTypes,
    type DashboardFilterRule,
    type DashboardTab,
    type DashboardTile,
} from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { ControlSidebar } from './ControlSidebar';
import { type ControlsSidebarContextValue } from './useControlsSidebar';

const mockSidebar = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));
const mockDashboardContext = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));

vi.mock('./useControlsSidebar', () => ({
    useControlsSidebar: vi.fn(() => mockSidebar.current),
}));

vi.mock('../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector) => selector(mockDashboardContext.current)),
}));

const mockSqlColumnsByTile = vi.hoisted(() => ({}));
vi.mock('./useSqlColumnsByTile', () => ({
    useSqlColumnsByTile: () => mockSqlColumnsByTile,
}));

vi.mock('./FieldsAndTiles', () => ({
    FieldsAndTiles: () => <div data-testid="fields-and-tiles" />,
}));

vi.mock('./ParameterSidebar', () => ({
    ParameterSidebar: () => <div data-testid="parameter-sidebar" />,
}));

vi.mock('./FilterSettings', () => ({
    FilterSettings: ({ attemptedApply }: { attemptedApply: boolean }) => (
        <div
            data-testid="filter-settings"
            data-attempted-apply={attemptedApply}
        />
    ),
}));

const FIELD_ID = 'orders_status';

const field = {
    fieldType: 'dimension',
    type: 'string',
    name: 'status',
    label: 'Status',
    table: 'orders',
    tableLabel: 'Orders',
    sql: '${TABLE}.status',
    hidden: false,
};

const REGION = { fieldId: 'orders_region', tableName: 'orders' };

const tile = (uuid: string, tabUuid: string | undefined) =>
    ({ uuid, tabUuid, type: DashboardTileTypes.SAVED_CHART }) as DashboardTile;

const tab = (uuid: string, order: number) =>
    ({ uuid, name: uuid, order }) as DashboardTab;

const makeRule = (
    overrides: Partial<DashboardFilterRule>,
): DashboardFilterRule => ({
    id: 'filter-1',
    operator: 'equals' as DashboardFilterRule['operator'],
    target: { fieldId: FIELD_ID, tableName: 'orders' },
    values: ['done'],
    label: undefined,
    ...overrides,
});

const setSidebar = (overrides: Partial<ControlsSidebarContextValue>) => {
    const value: ControlsSidebarContextValue = {
        editing: { filterId: 'filter-1' },
        isNew: true,
        isPlaceholder: false,
        editingRule: makeRule({}),
        isSidebarOpen: true,
        activeSection: 'fields',
        setActiveSection: vi.fn(),
        open: vi.fn(),
        openNew: vi.fn(),
        addFirstField: vi.fn(),
        clearFields: vi.fn(),
        highlightedFieldId: null,
        setHighlightedFieldId: vi.fn(),
        hoveredFieldId: null,
        setHoveredFieldId: vi.fn(),
        activeFieldId: null,
        waitingFieldIds: [],
        addWaitingField: vi.fn(),
        removeWaitingField: vi.fn(),
        updateFilter: vi.fn(),
        removeFilter: vi.fn(),
        removeFilterById: vi.fn(),
        cancel: vi.fn(),
        apply: vi.fn(),
        isDirty: true,
        editingControl: null,
        isNewControl: false,
        openControl: vi.fn(),
        addParameterControl: vi.fn(),
        updateControl: vi.fn(),
        setControlValue: vi.fn(),
        removeControl: vi.fn(),
        removeControlById: vi.fn(),
        ...overrides,
    };
    mockSidebar.current = value;
    return value;
};

describe('ControlSidebar', () => {
    beforeEach(() => {
        mockDashboardContext.current = {
            allFilterableFields: [field],
            allFilterableFieldsMap: { [FIELD_ID]: field },
            dashboardTiles: [
                tile('a', undefined),
                tile('b', undefined),
                tile('c', undefined),
            ],
            dashboardTabs: [],
            filterableFieldsByTileUuid: {
                a: [field],
                b: [field, { ...field, name: 'region', label: 'Region' }],
            },
        };
    });

    it('summarises the reach of a filter over every tile', () => {
        setSidebar({});
        const { rerender } = renderWithProviders(<ControlSidebar />);
        expect(
            screen.getByText('1 field · reaches 2 of 3 tiles'),
        ).toBeInTheDocument();
        expect(screen.queryByText('No mapping yet')).not.toBeInTheDocument();

        setSidebar({
            editingRule: makeRule({ tileTargets: { a: false, b: REGION } }),
        });
        rerender(<ControlSidebar />);
        expect(
            screen.getByText('2 fields · reaches 1 of 3 tiles'),
        ).toBeInTheDocument();
    });

    it('uses the singular for a dashboard with one tile', () => {
        mockDashboardContext.current = {
            ...mockDashboardContext.current,
            dashboardTiles: [tile('a', undefined)],
        };
        setSidebar({});
        renderWithProviders(<ControlSidebar />);
        expect(
            screen.getByText('1 field · reaches 1 of 1 tile'),
        ).toBeInTheDocument();
    });

    it('adds the tabs the filter reaches when the dashboard has several', () => {
        mockDashboardContext.current = {
            ...mockDashboardContext.current,
            dashboardTiles: [tile('a', 't1'), tile('b', 't1'), tile('c', 't2')],
            dashboardTabs: [tab('t1', 0), tab('t2', 1)],
        };
        setSidebar({});
        renderWithProviders(<ControlSidebar />);
        expect(
            screen.getByText('1 field · reaches 2 of 3 tiles on 1 of 2 tabs'),
        ).toBeInTheDocument();
    });

    it('leaves the tabs out when the dashboard has a single tab', () => {
        mockDashboardContext.current = {
            ...mockDashboardContext.current,
            dashboardTiles: [tile('a', 't1'), tile('b', 't1'), tile('c', 't1')],
            dashboardTabs: [tab('t1', 0)],
        };
        setSidebar({});
        renderWithProviders(<ControlSidebar />);
        expect(
            screen.getByText('1 field · reaches 2 of 3 tiles'),
        ).toBeInTheDocument();
    });

    it('renders nothing when no control is being edited', () => {
        setSidebar({ editing: null, editingRule: null });
        renderWithProviders(<ControlSidebar />);
        expect(screen.queryByText('Apply')).not.toBeInTheDocument();
    });

    it('renders the parameter editor when a parameter control is edited', () => {
        setSidebar({
            editing: null,
            editingRule: null,
            editingControl: {
                id: 'control-1',
                label: 'Region',
                parameterKeys: ['region'],
                tileTargets: {},
            },
        });
        renderWithProviders(<ControlSidebar />);
        expect(screen.getByTestId('parameter-sidebar')).toBeInTheDocument();
        expect(screen.queryByText('Fields and tiles')).not.toBeInTheDocument();
    });

    it('blocks Apply on a placeholder until it has a field', () => {
        setSidebar({
            isPlaceholder: true,
            editingRule: makeRule({
                target: { fieldId: '', tableName: '' },
            }),
        });
        renderWithProviders(<ControlSidebar />);

        expect(screen.getByText('New control')).toBeInTheDocument();
        expect(screen.getByText('No mapping yet')).toBeInTheDocument();
        expect(screen.getByLabelText(/^Label/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
        expect(screen.getByText('Add a field to apply')).toBeInTheDocument();
        expect(screen.queryByText('Suggestions')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('More actions')).not.toBeInTheDocument();
        expect(screen.getByTestId('fields-and-tiles')).toBeInTheDocument();
    });

    it('disables Settings for a placeholder and says why', () => {
        setSidebar({
            isPlaceholder: true,
            activeSection: 'settings',
            editingRule: makeRule({
                target: { fieldId: '', tableName: '' },
            }),
        });
        renderWithProviders(<ControlSidebar />);

        const settings = screen.getByRole('tab', { name: 'Settings' });
        expect(settings).toHaveAttribute('title', 'Pick a field first');
        expect(settings).toBeDisabled();
        expect(
            screen.getByRole('tab', { name: /^Fields and tiles/ }),
        ).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByTestId('fields-and-tiles')).toBeInTheDocument();
        expect(screen.queryByTestId('filter-settings')).not.toBeInTheDocument();
    });

    it('switches between the two tabs', () => {
        const { setActiveSection } = setSidebar({});
        const { rerender } = renderWithProviders(<ControlSidebar />);

        expect(
            screen.getByRole('tab', { name: 'Fields and tiles (1)' }),
        ).toHaveAttribute('aria-selected', 'true');
        const settings = screen.getByRole('tab', { name: 'Settings' });
        expect(settings).toBeEnabled();
        expect(settings).not.toHaveAttribute('title');
        fireEvent.click(settings);
        expect(setActiveSection).toHaveBeenCalledWith('settings');

        setSidebar({ activeSection: 'settings', setActiveSection });
        rerender(<ControlSidebar />);
        expect(screen.getByTestId('filter-settings')).toBeInTheDocument();
        expect(
            screen.queryByTestId('fields-and-tiles'),
        ).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('tab', { name: /^Fields and tiles/ }));
        expect(setActiveSection).toHaveBeenCalledWith('fields');
    });

    it('blocks Apply while the default value is missing', () => {
        const { apply } = setSidebar({
            activeSection: 'settings',
            editingRule: makeRule({ label: 'Order status', values: [] }),
        });
        renderWithProviders(<ControlSidebar />);

        expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
        expect(
            screen.getByText('Choose a default value or turn it off'),
        ).toBeInTheDocument();
        expect(screen.queryByText('Not applied yet')).not.toBeInTheDocument();
        expect(screen.getByTestId('filter-settings')).toHaveAttribute(
            'data-attempted-apply',
            'false',
        );

        fireEvent.keyDown(screen.getByLabelText(/^Filter label/), {
            key: 'Enter',
        });
        expect(apply).not.toHaveBeenCalled();
        expect(screen.getByTestId('filter-settings')).toHaveAttribute(
            'data-attempted-apply',
            'true',
        );
    });

    it('does not block a filter with no default value', () => {
        setSidebar({
            editingRule: makeRule({ label: 'Order status', disabled: true }),
        });
        renderWithProviders(<ControlSidebar />);

        expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled();
    });

    it('asks a new filter for a label and suggests the field name', () => {
        const { updateFilter, editingRule } = setSidebar({});
        renderWithProviders(<ControlSidebar />);

        expect(screen.getByText('New filter')).toBeInTheDocument();
        expect(screen.getByLabelText(/^Filter label/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
        expect(screen.getByText('Add a label to apply')).toBeInTheDocument();
        expect(screen.getByText('Suggestions')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Status' }));
        expect(updateFilter).toHaveBeenCalledWith({
            ...editingRule,
            label: 'Status',
        });
    });

    it('shows the label error only after an Apply attempt', () => {
        const { apply } = setSidebar({});
        renderWithProviders(<ControlSidebar />);
        const error = 'Add a label so viewers know what this filters';

        expect(screen.queryByText(error)).not.toBeInTheDocument();
        fireEvent.keyDown(screen.getByLabelText(/^Filter label/), {
            key: 'Enter',
        });
        expect(screen.getByText(error)).toBeInTheDocument();
        expect(apply).not.toHaveBeenCalled();
    });

    it('applies a new filter that has a label', () => {
        const { apply, cancel } = setSidebar({
            editingRule: makeRule({ label: 'Order status' }),
        });
        renderWithProviders(<ControlSidebar />);

        expect(screen.getByText('Not applied yet')).toBeInTheDocument();
        expect(screen.queryByText('Suggestions')).not.toBeInTheDocument();
        const applyButton = screen.getByRole('button', { name: 'Apply' });
        expect(applyButton).toBeEnabled();
        fireEvent.click(applyButton);
        expect(apply).toHaveBeenCalledTimes(1);

        fireEvent.keyDown(screen.getByLabelText(/^Filter label/), {
            key: 'Enter',
        });
        expect(apply).toHaveBeenCalledTimes(2);

        fireEvent.click(screen.getAllByRole('button', { name: 'Cancel' })[0]);
        fireEvent.click(screen.getAllByRole('button', { name: 'Cancel' })[1]);
        expect(cancel).toHaveBeenCalledTimes(2);
    });

    it('titles an existing filter with its label and removes it on the second click', async () => {
        const { removeFilter } = setSidebar({
            isNew: false,
            isDirty: false,
            editingRule: makeRule({ label: 'Order status' }),
        });
        renderWithProviders(<ControlSidebar />);

        expect(
            screen.getByRole('heading', { name: 'Order status' }),
        ).toBeInTheDocument();
        expect(screen.queryByText('Not applied yet')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled();

        fireEvent.click(screen.getByLabelText('More actions'));
        fireEvent.click(await screen.findByText('Remove filter'));
        expect(removeFilter).not.toHaveBeenCalled();
        fireEvent.click(await screen.findByText('Click again to remove'));
        expect(removeFilter).toHaveBeenCalledTimes(1);
    });
});
