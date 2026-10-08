import { fireEvent, screen } from '@testing-library/react';
import { type ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { ControlsBar } from './ControlsBar';

const mockDashboardContext = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));
const mockCompact = vi.hoisted(() => ({ current: false }));
const mockSidebar = vi.hoisted(() => ({ current: { isSidebarOpen: false } }));

vi.mock('../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector) => selector(mockDashboardContext.current)),
}));

vi.mock('../../components/common/Page/useCompactContentHeader', () => ({
    useCompactContentHeader: vi.fn(() => mockCompact.current),
}));

// Children are shipped components with their own tests; stub them to pin the bar's composition
vi.mock('../dashboardFilters', () => ({
    default: ({ isEditMode }: { isEditMode: boolean }) => (
        <button data-edit-mode={isEditMode}>Add filter</button>
    ),
}));

vi.mock(
    '../dashboardFilters/FilterRequirements/FilterRequirementsButton',
    () => ({ default: () => <button>Required</button> }),
);

vi.mock('../parameters', () => ({
    Parameters: ({ parameters }: { parameters: Record<string, unknown> }) => (
        <div data-testid="parameters">{Object.keys(parameters).join(',')}</div>
    ),
}));

vi.mock('./useControlsSidebar', () => ({
    useControlsSidebarSelector: (
        selector: (value: typeof mockSidebar.current) => unknown,
    ) => selector(mockSidebar.current),
}));

vi.mock('./AddControl', () => ({
    AddControl: () => <button>Add</button>,
}));
vi.mock('./FilterPills', () => ({
    FilterPills: () => <div data-testid="filter-pills" />,
}));

vi.mock('./ParameterControlPills', () => ({
    ParameterControlPills: ({
        isEditMode,
        missingRequiredParameters,
        shadowedReservedNames,
    }: {
        isEditMode: boolean;
        missingRequiredParameters: string[];
        shadowedReservedNames: string[];
    }) => (
        <div
            data-testid="parameter-control-pills"
            data-edit-mode={isEditMode}
            data-missing={missingRequiredParameters.join(',')}
            data-shadowed={shadowedReservedNames.join(',')}
        />
    ),
}));

vi.mock('../dateZoom', () => ({
    DateZoom: () => <div data-testid="date-zoom" />,
}));

const baseProps: ComponentProps<typeof ControlsBar> = {
    isEditMode: false,
    activeTabUuid: undefined,
    hasTilesThatSupportFilters: true,
    hasDashboardTiles: true,
    parameters: {},
    shadowedReservedNames: [],
    parameterValues: {},
    onParameterChange: vi.fn(),
    onParameterClearAll: vi.fn(),
    isParameterLoading: false,
    missingRequiredParameters: [],
    pinnedParameters: [],
    onParameterPin: vi.fn(),
    parameterOrder: [],
    onParameterReorder: vi.fn(),
    isDateZoomDisabled: false,
    onCollapse: vi.fn(),
};

describe('ControlsBar', () => {
    const setIsAddFilterDisabled = vi.fn();
    const visibilityToggle = () =>
        screen.getByRole('button', {
            name: 'Toggle filter visibility for viewers',
        });

    beforeEach(() => {
        setIsAddFilterDisabled.mockClear();
        mockCompact.current = false;
        mockSidebar.current = { isSidebarOpen: false };
        mockDashboardContext.current = {
            isAddFilterDisabled: false,
            allFilters: { dimensions: [], metrics: [], tableCalculations: [] },
            setIsDateZoomDisabled: vi.fn(),
            setIsAddFilterDisabled,
            parameterControls: [],
        };
    });

    it('renders the shipped filters, date zoom and hide button in view mode', () => {
        renderWithProviders(<ControlsBar {...baseProps} />);

        expect(
            screen.getByRole('button', { name: 'Add filter' }),
        ).toBeInTheDocument();
        expect(screen.getByTestId('date-zoom')).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Hide' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Required' }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Add' }),
        ).not.toBeInTheDocument();
        expect(screen.queryByTestId('filter-pills')).not.toBeInTheDocument();
        expect(screen.queryByTestId('parameters')).not.toBeInTheDocument();
        expect(screen.getByTestId('parameter-control-pills')).toHaveAttribute(
            'data-edit-mode',
            'false',
        );
    });

    it('renders Add, the pills and the Required button in edit mode', () => {
        renderWithProviders(<ControlsBar {...baseProps} isEditMode />);

        expect(
            screen.getByRole('button', { name: 'Required' }),
        ).toBeInTheDocument();
        expect(screen.getByTestId('filter-pills')).toBeInTheDocument();
        expect(screen.getByTestId('parameter-control-pills')).toHaveAttribute(
            'data-edit-mode',
            'true',
        );
        expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Add filter' }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole('button', {
                name: 'Toggle date zoom visibility for viewers',
            }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Hide' }),
        ).not.toBeInTheDocument();
    });

    it('hides the Required button while the sidebar is open', () => {
        mockSidebar.current = { isSidebarOpen: true };
        renderWithProviders(<ControlsBar {...baseProps} isEditMode />);

        expect(
            screen.queryByRole('button', { name: 'Required' }),
        ).not.toBeInTheDocument();
        expect(screen.getByTestId('filter-pills')).toBeInTheDocument();
    });

    it('has no "Add filter" visibility toggle in view mode', () => {
        renderWithProviders(<ControlsBar {...baseProps} />);

        expect(
            screen.queryByRole('button', {
                name: 'Toggle filter visibility for viewers',
            }),
        ).not.toBeInTheDocument();
    });

    it('hides "Add filter" from viewers with the eye next to Add', async () => {
        renderWithProviders(<ControlsBar {...baseProps} isEditMode />);

        expect(
            visibilityToggle().querySelector('.tabler-icon-eye'),
        ).not.toBeNull();
        fireEvent.mouseEnter(visibilityToggle());
        expect(
            await screen.findByText('Visible to viewers. Click to hide.'),
        ).toBeInTheDocument();

        fireEvent.click(visibilityToggle());
        expect(setIsAddFilterDisabled).toHaveBeenCalledWith(true);
    });

    it('shows "Add filter" to viewers again, also while the sidebar is open', async () => {
        mockSidebar.current = { isSidebarOpen: true };
        mockDashboardContext.current = {
            ...mockDashboardContext.current,
            isAddFilterDisabled: true,
        };
        renderWithProviders(<ControlsBar {...baseProps} isEditMode />);

        expect(
            visibilityToggle().querySelector('.tabler-icon-eye-off'),
        ).not.toBeNull();
        fireEvent.mouseEnter(visibilityToggle());
        expect(
            await screen.findByText('Hidden from viewers. Click to show.'),
        ).toBeInTheDocument();

        fireEvent.click(visibilityToggle());
        expect(setIsAddFilterDisabled).toHaveBeenCalledWith(false);
    });

    it('hands the parameter pill states to the control pills', () => {
        renderWithProviders(
            <ControlsBar
                {...baseProps}
                missingRequiredParameters={['region']}
                shadowedReservedNames={['start']}
            />,
        );

        const pills = screen.getByTestId('parameter-control-pills');
        expect(pills).toHaveAttribute('data-missing', 'region');
        expect(pills).toHaveAttribute('data-shadowed', 'start');
    });

    it('renders the shipped parameters only when the tab has parameters', () => {
        renderWithProviders(
            <ControlsBar
                {...baseProps}
                parameters={{
                    region: { label: 'Region', options: ['EMEA'] },
                }}
            />,
        );

        expect(screen.getByTestId('parameters')).toHaveTextContent('region');
    });

    it('leaves the parameters held by a control out of the shipped parameters', () => {
        mockDashboardContext.current = {
            ...mockDashboardContext.current,
            parameterControls: [
                {
                    id: 'control',
                    label: 'Region',
                    parameterKeys: ['region', 'sales_region'],
                    tileTargets: {},
                },
            ],
        };
        const { rerender } = renderWithProviders(
            <ControlsBar
                {...baseProps}
                parameters={{
                    region: { label: 'Region' },
                    sales_region: { label: 'Sales region' },
                    plan: { label: 'Plan' },
                }}
            />,
        );

        expect(screen.getByTestId('parameters').textContent).toBe('plan');

        rerender(
            <ControlsBar
                {...baseProps}
                parameters={{ region: { label: 'Region' } }}
            />,
        );
        expect(screen.queryByTestId('parameters')).not.toBeInTheDocument();
    });

    it('collapses into a drawer trigger on compact viewports in view mode', () => {
        mockCompact.current = true;
        renderWithProviders(<ControlsBar {...baseProps} />);

        expect(
            screen.queryByRole('button', { name: 'Add filter' }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole('button', {
                name: 'Filters and parameters',
                expanded: false,
            }),
        ).toBeInTheDocument();
    });
});
