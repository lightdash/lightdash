/**
 * Component-level tests for the custom-dimension branch of ColumnHeaderContextMenu.
 *
 * Specifically verifies the `hideRemove` guard: when the user cannot author custom
 * SQL on a saved chart, no removal options should appear at all (regression from the
 * original fix which left the generic "Remove" unconditional).
 */
import { CustomDimensionType, DimensionType } from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import ColumnHeaderContextMenu from './ColumnHeaderContextMenu';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../../features/explorer/store', () => ({
    useExplorerDispatch: () => vi.fn(),
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
                // savedChart is set per test via the selector mock
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
    // The test env also mounts a React Query DevTools button, so we can't use
    // getByRole('button') alone. Find the column-header chevron button by
    // aria-label="Open React Query Devtools" exclusion, or by picking the
    // first button that is NOT the devtools toggle.
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

            // Mantine Menu renders items via portal — use findByText to wait for async render
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

            // Wait for the menu to actually open by confirming a known item IS present.
            // isFilterableField returns true for CustomDimensionType.SQL, so "Filter by"
            // will always appear in the dropdown — use it as the anchor.
            await screen.findByRole('menuitem', { name: /Filter by/ });

            // With hideRemove=true, neither removal option should be present
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

            // Mantine Menu renders items via portal — use findByText to wait for async render
            expect(await screen.findByText('Remove')).toBeInTheDocument();
            expect(
                await screen.findByText('Remove custom dimension'),
            ).toBeInTheDocument();
        });
    });
});
