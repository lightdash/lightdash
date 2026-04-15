/**
 * Behavioral regression test for LIGHTDASH-FRONTEND-1FS (PROD-2048).
 *
 * Reproduces the exact user interaction that triggered the crash:
 *   Explorer → metric column → Quick Calculations menu → click an item
 *
 * The original crash happened when getSqlForQuickCalculation was called with
 * an undefined warehouseType and accessed .value on the result. This test
 * exercises the same UI interaction path against the current build to confirm
 * the crash no longer occurs and that the replacement template-based approach
 * dispatches the correct action.
 */
import {
    FieldType,
    MetricType,
    TableCalculationTemplateType,
    type Metric,
    type TableCalculation,
} from '@lightdash/common';
import { Menu } from '@mantine-8/core';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createExplorerStore,
    explorerActions,
} from '../../../features/explorer/store';
import Mantine8Provider from '../../../providers/Mantine8Provider';
import MantineProvider from '../../../providers/MantineProvider';
import ReactQueryProvider from '../../../providers/ReactQuery/ReactQueryProvider';
import AppProviderMock from '../../../testing/__mocks__/providers/AppProvider.mock';
import QuickCalculationMenuOptions from './QuickCalculations';

vi.mock('src/providers/ReactQueryProvider');
vi.mock('src/providers/TrackingProvider');

vi.mock('../../../providers/Tracking/useTracking', () => ({
    default: vi.fn(() => ({ track: vi.fn() })),
}));

const mockMetric: Metric = {
    fieldType: FieldType.METRIC,
    type: MetricType.SUM,
    name: 'total_revenue',
    label: 'Total Revenue',
    table: 'orders',
    tableLabel: 'Orders',
    sql: '${orders.revenue}',
    hidden: false,
};

/** Renders with full provider stack: React Query + Mantine v6/v8 + App context + Redux */
const renderQuickCalcMenu = (store: ReturnType<typeof createExplorerStore>) =>
    render(
        <ReactQueryProvider>
            <MantineProvider>
                <Mantine8Provider>
                    <AppProviderMock>
                        <Provider store={store}>
                            <MemoryRouter>
                                <Menu opened>
                                    <Menu.Dropdown>
                                        <QuickCalculationMenuOptions
                                            item={mockMetric}
                                        />
                                    </Menu.Dropdown>
                                </Menu>
                            </MemoryRouter>
                        </Provider>
                    </AppProviderMock>
                </Mantine8Provider>
            </MantineProvider>
        </ReactQueryProvider>,
    );

describe('QuickCalculationMenuOptions (behavioral regression — PROD-2048)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders Quick Calculations menu items without crashing', () => {
        const store = createExplorerStore();
        renderQuickCalcMenu(store);

        // The old getSqlForQuickCalculation crashed with TypeError before any
        // menu items could render. This confirms the component tree completes
        // rendering without error.
        expect(screen.getByText('Add quick calculation')).toBeInTheDocument();
        expect(screen.getByText('Running total')).toBeInTheDocument();
        expect(screen.getByText('Rank in column')).toBeInTheDocument();
        expect(
            screen.getByText('Percent change from previous'),
        ).toBeInTheDocument();
    });

    it('clicking "Running total" dispatches addTableCalculation with a template object (not raw SQL)', async () => {
        const user = userEvent.setup();
        const store = createExplorerStore();
        const dispatchSpy = vi.spyOn(store, 'dispatch');

        renderQuickCalcMenu(store);

        // Simulate: user sees Quick Calculations menu and clicks "Running total"
        // This is the exact interaction path described in the Sentry crash report.
        await user.click(screen.getByText('Running total'));

        await waitFor(() => {
            expect(dispatchSpy).toHaveBeenCalled();
        });

        // Find the addTableCalculation dispatch call
        const addCalcCall = dispatchSpy.mock.calls.find((call) => {
            const action = call[0] as { type: string };
            return (
                typeof action === 'object' &&
                action.type === explorerActions.addTableCalculation.type
            );
        });

        expect(addCalcCall).toBeDefined();
        const payload = (addCalcCall![0] as { payload: TableCalculation })
            .payload;

        // New code: template object dispatched (not raw SQL string)
        // Old getSqlForQuickCalculation produced: { sql: "SUM(...) OVER (...)" }
        // New generateTableCalculationTemplate produces: { template: { type, fieldId } }
        expect(payload.template).toBeDefined();
        expect(payload.template!.type).toBe(
            TableCalculationTemplateType.RUNNING_TOTAL,
        );
        expect(payload.template!.fieldId).toBe('orders_total_revenue');

        // Confirms getSqlForQuickCalculation is not called — no raw sql property
        expect(payload.sql).toBeUndefined();
    });

    it('clicking "Percent change from previous" dispatches a template, not SQL', async () => {
        const user = userEvent.setup();
        const store = createExplorerStore();
        const dispatchSpy = vi.spyOn(store, 'dispatch');

        renderQuickCalcMenu(store);

        await user.click(screen.getByText('Percent change from previous'));

        await waitFor(() => {
            expect(dispatchSpy).toHaveBeenCalled();
        });

        const addCalcCall = dispatchSpy.mock.calls.find((call) => {
            const action = call[0] as { type: string };
            return (
                typeof action === 'object' &&
                action.type === explorerActions.addTableCalculation.type
            );
        });

        expect(addCalcCall).toBeDefined();
        const payload = (addCalcCall![0] as { payload: TableCalculation })
            .payload;
        expect(payload.template!.type).toBe(
            TableCalculationTemplateType.PERCENT_CHANGE_FROM_PREVIOUS,
        );
        expect(payload.sql).toBeUndefined();
    });
});
