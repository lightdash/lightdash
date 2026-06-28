/**
 * Component-level tests for the custom-dimension branch of ColumnHeaderContextMenu.
 *
 * Two concerns:
 * 1. Render guard — the `hideRemove` flag correctly shows/hides both removal items.
 * 2. Dispatch wiring — clicking "Remove" dispatches toggleDimension (deselect, not
 *    delete) and clicking "Remove custom dimension" dispatches removeCustomDimension.
 */
import { CustomDimensionType, DimensionType } from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import ColumnHeaderContextMenu from './ColumnHeaderContextMenu';

// ---------------------------------------------------------------------------
// vi.hoisted: mockDispatch must be created before vi.mock() is hoisted
// ---------------------------------------------------------------------------
const mockDispatch = vi.hoisted(() => vi.fn());

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../../features/explorer/store', () => ({
    useExplorerDispatch: () => mockDispatch,
    useExplorerSelector: vi.fn((selector: (s: unknown) => unknown) =>
        selector({
            explorer: {
                unsavedChartVersion: {
                    tableName: 'my_table',
                    metricQuery: {
                        additionalMetrics: [],
                        tableCalculations: [],
                        customDimensions: [],
                    },
                },
            },
        }),
    ),
    selectAdditionalMetrics: (s: {
        explorer: {
            unsavedChartVersion: {
                metricQuery: { additionalMetrics: unknown[] };
            };
        };
    }) => s.explorer.unsavedChartVersion.metricQuery.additionalMetrics,
    selectTableCalculations: (s: {
        explorer: {
            unsavedChartVersion: {
                metricQuery: { tableCalculations: unknown[] };
            };
        };
    }) => s.explorer.unsavedChartVersion.metricQuery.tableCalculations,
    selectTableName: (s: {
        explorer: { unsavedChartVersion: { tableName: string } };
    }) => s.explorer.unsavedChartVersion.tableName,
    selectSavedChart: vi.fn(),
    explorerActions: {
        setSortFields: vi.fn(),
        toggleDimension: vi.fn((id: string) => ({
            type: 'toggleDimension',
            id,
        })),
        removeCustomDimension: vi.fn((id: string) => ({
            type: 'removeCustomDimension',
            id,
        })),
        toggleCustomDimensionModal: vi.fn(),
        toggleAdditionalMetricModal: vi.fn(),
        togglePeriodOverPeriodComparisonModal: vi.fn(),
        removeField: vi.fn((id: string) => ({ type: 'removeField', id })),
    },
}));

vi.mock('../../../hooks/useExplore', () => ({
    useExplore: () => ({ data: undefined }),
}));

vi.mock('../../../hooks/useFilters', () => ({
    useFilters: () => ({ addFilter: vi.fn() }),
}));

vi.mock('../../../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'test-project-uuid',
}));

vi.mock('../../../providers/Tracking/useTracking', () => ({
    default: () => ({ track: vi.fn() }),
}));

vi.mock('./ColumnHeaderSortMenuOptions', () => ({
    default: () => null,
}));

vi.mock('./FormatMenuOptions', () => ({
    default: () => null,
}));

vi.mock('./QuickCalculations', () => ({
    default: () => null,
}));

vi.mock('../../../features/tableCalculation', () => ({
    DeleteTableCalculationModal: () => null,
    UpdateTableCalculationModal: () => null,
}));

import { selectSavedChart } from '../../../features/explorer/store';
// ---------------------------------------------------------------------------
// Hook that drives hideRemove
// ---------------------------------------------------------------------------
import * as CannotAuthorModule from '../../../hooks/user/useCannotAuthorCustomSql';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CUSTOM_SQL_DIM = {
    id: 'my_table_sql_dim',
    name: 'sql_dim',
    table: 'my_table',
    type: CustomDimensionType.SQL,
    sql: 'FLOOR(${my_table.amount} / 100)',
    dimensionType: DimensionType.NUMBER,
} as const;

const CUSTOM_BIN_DIM = {
    id: 'my_table_bin_dim',
    name: 'bin_dim',
    table: 'my_table',
    type: CustomDimensionType.BIN,
    dimensionId: 'my_table_amount',
    binType: 'fixed_number' as const,
    binNumber: 5,
} as const;

function makeHeader(item: typeof CUSTOM_SQL_DIM | typeof CUSTOM_BIN_DIM) {
    return {
        column: {
            id: item.id,
            columnDef: { meta: { item } },
        },
    } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

function openMenu() {
    const buttons = screen.getAllByRole('button');
    const trigger = buttons.find(
        (b) => b.getAttribute('aria-label') !== 'Open React Query Devtools',
    )!;
    fireEvent.click(trigger);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ColumnHeaderContextMenu — custom dimension removal options', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // -------------------------------------------------------------------------
    // Render-guard tests: verify correct items appear / are hidden
    // -------------------------------------------------------------------------

    describe('regular BIN custom dimension (hideRemove always false)', () => {
        beforeEach(() => {
            vi.spyOn(
                CannotAuthorModule,
                'useCannotAuthorCustomSql',
            ).mockReturnValue(false);
            vi.mocked(selectSavedChart).mockReturnValue(undefined as any);
        });

        it('shows "Remove" (deselect) and "Remove custom dimension" (delete)', async () => {
            renderWithProviders(
                <ColumnHeaderContextMenu header={makeHeader(CUSTOM_BIN_DIM)} />,
            );
            openMenu();

            // Mantine Menu renders items via portal — use findByText to wait for async render
            expect(await screen.findByText('Remove')).toBeInTheDocument();
            expect(
                await screen.findByText('Remove custom dimension'),
            ).toBeInTheDocument();
        });
    });

    describe('custom SQL dimension — user CAN author (hideRemove = false)', () => {
        beforeEach(() => {
            vi.spyOn(
                CannotAuthorModule,
                'useCannotAuthorCustomSql',
            ).mockReturnValue(false);
            vi.mocked(selectSavedChart).mockReturnValue({
                uuid: 'chart-123',
            } as any);
        });

        it('shows both removal options', async () => {
            renderWithProviders(
                <ColumnHeaderContextMenu header={makeHeader(CUSTOM_SQL_DIM)} />,
            );
            openMenu();

            expect(await screen.findByText('Remove')).toBeInTheDocument();
            expect(
                await screen.findByText('Remove custom dimension'),
            ).toBeInTheDocument();
        });
    });

    describe('custom SQL dimension — user CANNOT author + saved chart (hideRemove = true)', () => {
        beforeEach(() => {
            vi.spyOn(
                CannotAuthorModule,
                'useCannotAuthorCustomSql',
            ).mockReturnValue(true);
            vi.mocked(selectSavedChart).mockReturnValue({
                uuid: 'chart-123',
            } as any);
        });

        it('shows neither "Remove" nor "Remove custom dimension"', async () => {
            renderWithProviders(
                <ColumnHeaderContextMenu header={makeHeader(CUSTOM_SQL_DIM)} />,
            );
            openMenu();

            // Confirm the menu IS open — isFilterableField returns true for SQL custom dims
            await screen.findByRole('menuitem', { name: /Filter by/ });

            expect(screen.queryByText('Remove')).not.toBeInTheDocument();
            expect(
                screen.queryByText('Remove custom dimension'),
            ).not.toBeInTheDocument();
        });
    });

    describe('custom SQL dimension — user CANNOT author but NO saved chart (hideRemove = false)', () => {
        beforeEach(() => {
            vi.spyOn(
                CannotAuthorModule,
                'useCannotAuthorCustomSql',
            ).mockReturnValue(true);
            vi.mocked(selectSavedChart).mockReturnValue(undefined as any);
        });

        it('shows both removal options (not on a saved chart, so hideRemove stays false)', async () => {
            renderWithProviders(
                <ColumnHeaderContextMenu header={makeHeader(CUSTOM_SQL_DIM)} />,
            );
            openMenu();

            expect(await screen.findByText('Remove')).toBeInTheDocument();
            expect(
                await screen.findByText('Remove custom dimension'),
            ).toBeInTheDocument();
        });
    });

    // -------------------------------------------------------------------------
    // Dispatch-wiring tests: verify the correct Redux action fires on click
    // -------------------------------------------------------------------------

    describe('dispatch wiring — "Remove" deselects, does not delete', () => {
        beforeEach(() => {
            vi.spyOn(
                CannotAuthorModule,
                'useCannotAuthorCustomSql',
            ).mockReturnValue(false);
            vi.mocked(selectSavedChart).mockReturnValue(undefined as any);
        });

        it('clicking "Remove" dispatches toggleDimension (deselect), not removeField (delete)', async () => {
            renderWithProviders(
                <ColumnHeaderContextMenu header={makeHeader(CUSTOM_SQL_DIM)} />,
            );
            openMenu();

            fireEvent.click(await screen.findByText('Remove'));

            // Deselect action fired
            expect(mockDispatch).toHaveBeenCalledWith({
                type: 'toggleDimension',
                id: CUSTOM_SQL_DIM.id,
            });
            // Destructive delete NOT fired
            expect(mockDispatch).not.toHaveBeenCalledWith(
                expect.objectContaining({ type: 'removeField' }),
            );
            expect(mockDispatch).not.toHaveBeenCalledWith(
                expect.objectContaining({ type: 'removeCustomDimension' }),
            );
        });

        it('clicking "Remove custom dimension" dispatches removeCustomDimension (delete)', async () => {
            renderWithProviders(
                <ColumnHeaderContextMenu header={makeHeader(CUSTOM_SQL_DIM)} />,
            );
            openMenu();

            fireEvent.click(await screen.findByText('Remove custom dimension'));

            expect(mockDispatch).toHaveBeenCalledWith({
                type: 'removeCustomDimension',
                id: CUSTOM_SQL_DIM.id,
            });
            // Deselect NOT fired
            expect(mockDispatch).not.toHaveBeenCalledWith(
                expect.objectContaining({ type: 'toggleDimension' }),
            );
        });
    });
});
