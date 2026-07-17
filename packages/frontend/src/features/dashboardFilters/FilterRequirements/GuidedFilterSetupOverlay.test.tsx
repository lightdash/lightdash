import { FilterOperator, type DashboardFilterRule } from '@lightdash/common';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import GuidedFilterSetupOverlay from './GuidedFilterSetupOverlay';

const unmetRule: DashboardFilterRule = {
    id: 'filter-1',
    target: {
        fieldId: 'customers_first_name',
        tableName: 'customers',
    },
    operator: FilterOperator.EQUALS,
    values: [],
    disabled: true,
    required: true,
    label: undefined,
};

const mockDashboardContext = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));

vi.mock('../../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector) => selector(mockDashboardContext.current)),
}));

vi.mock('./useFilterableItemsMap', () => ({
    useFilterableItemsMap: vi.fn(() => ({})),
}));

// Stub the filter input (its Mantine autocomplete is inert in jsdom) but
// capture popoverProps so tests can drive the dropdown open/close protocol
const memberInputPopoverProps = vi.hoisted(() => ({
    current: null as {
        onOpen?: () => void;
        onClose?: () => void;
    } | null,
}));

vi.mock('../../../components/common/Filters/FilterInputs', () => ({
    default: vi.fn(({ popoverProps }) => {
        memberInputPopoverProps.current = popoverProps;
        return <input placeholder="any value" />;
    }),
}));

describe('GuidedFilterSetupOverlay', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // jsdom does not implement scrollIntoView
        Object.defineProperty(Element.prototype, 'scrollIntoView', {
            configurable: true,
            writable: true,
            value: vi.fn(),
        });
        mockDashboardContext.current = {
            projectUuid: 'project-1',
            dashboard: { name: 'Sales dashboard' },
            dashboardFilters: {
                dimensions: [unmetRule],
                metrics: [],
                tableCalculations: [],
            },
            allFilters: {
                dimensions: [unmetRule],
                metrics: [],
                tableCalculations: [],
            },
            dashboardTiles: [],
            filterableFieldsByTileUuid: {},
            allFilterableFieldsMap: {},
            requiredFiltersNote: 'Pick a customer to get started',
            activeTab: undefined,
            updateDimensionDashboardFilter: vi.fn(),
            updateMetricDashboardFilter: vi.fn(),
        };
    });

    afterEach(() => {
        delete (Element.prototype as Partial<Element>).scrollIntoView;
    });

    it('renders nothing while the filterable fields are still loading', () => {
        mockDashboardContext.current.isLoadingDashboardFilters = true;

        renderWithProviders(<GuidedFilterSetupOverlay onDismiss={vi.fn()} />);

        expect(screen.queryByRole('dialog')).toBeNull();
        expect(screen.queryByTestId('guided-filter-setup')).toBeNull();
    });

    it('renders the guided setup with the unmet rule and requirement progress', () => {
        renderWithProviders(<GuidedFilterSetupOverlay onDismiss={vi.fn()} />);

        expect(screen.getByTestId('guided-filter-setup')).not.toBeNull();
        expect(
            screen.getByText('Set filters to load Sales dashboard'),
        ).not.toBeNull();
        expect(
            screen.getByText('Pick a customer to get started'),
        ).not.toBeNull();
        expect(screen.getByText('customers_first_name')).not.toBeNull();
        expect(screen.getByText('0 of 1 set')).not.toBeNull();
        expect(screen.getByText('1 more to go')).not.toBeNull();
    });

    it('dismisses from the close button but not from clicks inside the card', async () => {
        const onDismiss = vi.fn();
        renderWithProviders(<GuidedFilterSetupOverlay onDismiss={onDismiss} />);

        await userEvent.click(screen.getByTestId('guided-filter-setup'));
        expect(onDismiss).not.toHaveBeenCalled();

        const closeButton = document.querySelector('.mantine-8-Modal-close');
        expect(closeButton).not.toBeNull();
        await userEvent.click(closeButton as HTMLElement);
        expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('dismisses on backdrop clicks only', async () => {
        const onDismiss = vi.fn();
        renderWithProviders(<GuidedFilterSetupOverlay onDismiss={onDismiss} />);

        const backdrop = document.querySelector('.mantine-8-Modal-overlay');
        expect(backdrop).not.toBeNull();
        await userEvent.click(backdrop as HTMLElement);
        expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('renders as a focused dialog and dismisses on Escape', async () => {
        const onDismiss = vi.fn();
        renderWithProviders(<GuidedFilterSetupOverlay onDismiss={onDismiss} />);

        const dialog = screen.getByRole('dialog', {
            name: 'Set filters to load this dashboard',
        });
        // The modal's focus trap activates asynchronously
        await waitFor(() =>
            expect(dialog.contains(document.activeElement)).toBe(true),
        );

        await userEvent.keyboard('{Escape}');
        expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('changes the rule operator from the inline operator menu', async () => {
        renderWithProviders(<GuidedFilterSetupOverlay onDismiss={vi.fn()} />);

        const operatorButton = screen.getByRole('button', {
            name: 'Change operator for customers_first_name',
        });
        expect(operatorButton.textContent).toContain('is');

        await userEvent.click(operatorButton);
        // Mantine renders the dropdown hidden in jsdom, so query and click it directly
        const option = await screen.findByRole('menuitem', {
            name: 'starts with',
            hidden: true,
        });
        fireEvent.click(option);

        expect(
            mockDashboardContext.current.updateDimensionDashboardFilter,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                operator: FilterOperator.STARTS_WITH,
                disabled: true,
            }),
            0,
            false,
            false,
        );
    });

    it('satisfies the rule immediately when a no-value operator is picked', async () => {
        renderWithProviders(<GuidedFilterSetupOverlay onDismiss={vi.fn()} />);

        await userEvent.click(
            screen.getByRole('button', {
                name: 'Change operator for customers_first_name',
            }),
        );
        fireEvent.click(
            await screen.findByRole('menuitem', {
                name: 'is null',
                hidden: true,
            }),
        );

        expect(
            mockDashboardContext.current.updateDimensionDashboardFilter,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                operator: FilterOperator.NULL,
                disabled: false,
            }),
            0,
            false,
            false,
        );
    });

    it('does not dismiss on Escape while the operator menu is open', async () => {
        const onDismiss = vi.fn();
        renderWithProviders(<GuidedFilterSetupOverlay onDismiss={onDismiss} />);

        await userEvent.click(
            screen.getByRole('button', {
                name: 'Change operator for customers_first_name',
            }),
        );
        await screen.findByRole('menuitem', {
            name: 'starts with',
            hidden: true,
        });

        // Without the sub-popover wiring this Escape would close the overlay
        await userEvent.keyboard('{Escape}');
        expect(onDismiss).not.toHaveBeenCalled();
    });

    it('does not dismiss on Escape while a filter dropdown inside the card is open', async () => {
        const onDismiss = vi.fn();
        renderWithProviders(<GuidedFilterSetupOverlay onDismiss={onDismiss} />);

        // The filter input reports its open dropdown via popoverProps.onOpen,
        // so Escape stands down while it is open
        act(() => memberInputPopoverProps.current?.onOpen?.());
        await userEvent.keyboard('{Escape}');
        expect(onDismiss).not.toHaveBeenCalled();

        // With the dropdown closed again, Escape dismisses the overlay
        act(() => memberInputPopoverProps.current?.onClose?.());
        await userEvent.keyboard('{Escape}');
        expect(onDismiss).toHaveBeenCalledTimes(1);
    });
});
