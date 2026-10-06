import { screen } from '@testing-library/react';
import { type ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { FilterBar } from './FilterBar';

const mockDashboardContext = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));
const mockCompact = vi.hoisted(() => ({ current: false }));

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

vi.mock('./RequirementsButton', () => ({
    RequirementsButton: () => <button>Required</button>,
}));

vi.mock('./AddFilter', () => ({
    AddFilter: () => <button>Add filter (edit)</button>,
}));
vi.mock('./ParameterValuesButton', () => ({
    ParameterValuesButton: () => <button>Parameter values</button>,
}));
vi.mock('./FilterPills', () => ({
    FilterPills: () => <div data-testid="filter-pills" />,
}));
vi.mock('../parameters', () => ({
    Parameters: () => <div data-testid="parameters" />,
}));

vi.mock('../../components/PinnedParameters', () => ({
    default: () => <div data-testid="pinned-parameters" />,
}));

vi.mock('../dateZoom', () => ({
    DateZoom: () => <div data-testid="date-zoom" />,
}));

const baseProps: ComponentProps<typeof FilterBar> = {
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

describe('FilterBar', () => {
    beforeEach(() => {
        mockCompact.current = false;
        mockDashboardContext.current = {
            isAddFilterDisabled: false,
            allFilters: { dimensions: [], metrics: [], tableCalculations: [] },
            setIsDateZoomDisabled: vi.fn(),
        };
    });

    it('renders the add filter control, date zoom and hide button in view mode', () => {
        renderWithProviders(<FilterBar {...baseProps} />);

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
        expect(screen.queryByTestId('parameters')).not.toBeInTheDocument();
    });

    it('renders the Required button and no hide button in edit mode', () => {
        renderWithProviders(<FilterBar {...baseProps} isEditMode />);

        expect(
            screen.getByRole('button', { name: 'Required' }),
        ).toBeInTheDocument();
        expect(screen.getByTestId('filter-pills')).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Add filter (edit)' }),
        ).toBeInTheDocument();
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

    it('renders parameters only when the tab has some', () => {
        renderWithProviders(
            <FilterBar
                {...baseProps}
                parameters={{
                    region: { label: 'Region', options: ['EMEA'] },
                }}
            />,
        );

        expect(screen.getByTestId('parameters')).toBeInTheDocument();
        expect(screen.getByTestId('pinned-parameters')).toBeInTheDocument();
    });

    it('collapses into a drawer trigger on compact viewports in view mode', () => {
        mockCompact.current = true;
        renderWithProviders(<FilterBar {...baseProps} />);

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
