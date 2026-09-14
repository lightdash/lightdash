import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';

const mocks = vi.hoisted(() => ({
    context: { current: {} as Record<string, unknown> },
}));

vi.mock('../common/PivotTable', () => ({
    default: ({ enableContextMenu }: { enableContextMenu?: boolean }) => (
        <div
            data-testid="pivot-table"
            data-context-menu-enabled={String(enableContextMenu)}
        />
    ),
}));

vi.mock('../common/Table', () => ({
    default: ({
        cellContextMenu,
        headerContextMenu,
    }: {
        cellContextMenu?: unknown;
        headerContextMenu?: unknown;
    }) => (
        <div
            data-testid="table"
            data-cell-menu-enabled={String(cellContextMenu !== undefined)}
            data-header-menu-enabled={String(headerContextMenu !== undefined)}
        />
    ),
}));

vi.mock('../LightdashVisualization/types', () => ({
    isTableVisualizationConfig: () => true,
}));

vi.mock('../LightdashVisualization/useVisualizationContext', () => ({
    useVisualizationContext: () => mocks.context.current,
}));

// Module mocks must be registered before importing the component.
// eslint-disable-next-line import/first
import SimpleTable from '.';

const buildContext = (isPivotTableEnabled: boolean) => ({
    columnOrder: [],
    itemsMap: {},
    visualizationConfig: {
        chartConfig: {
            columns: [],
            pivotTableData: {
                data: isPivotTableEnabled ? { rowsCount: 1 } : undefined,
                loading: false,
                error: undefined,
            },
            isPivotTableEnabled,
            isPivotResultStale: false,
            showColumnCalculation: true,
            showResultsTotal: false,
            showSubtotals: false,
            showSubtotalsExpanded: false,
            showRowGrouping: false,
            updateColumnProperty: vi.fn(),
            getFieldLabel: vi.fn(),
            getField: vi.fn(),
        },
    },
    resultsData: {
        rows: [{}],
        totalResults: 1,
        hasFetchedAllRows: true,
        setFetchAll: vi.fn(),
    },
    isLoading: false,
    isEditMode: false,
    parameters: undefined,
    hasExplorerStore: false,
});

describe('SimpleTable context menus', () => {
    beforeEach(() => {
        mocks.context.current = buildContext(false);
    });

    it('removes menus from an unpivoted table when disabled', () => {
        renderWithProviders(
            <SimpleTable isDashboard={false} enableContextMenu={false} />,
        );

        expect(screen.getByTestId('table')).toHaveAttribute(
            'data-cell-menu-enabled',
            'false',
        );
        expect(screen.getByTestId('table')).toHaveAttribute(
            'data-header-menu-enabled',
            'false',
        );
    });

    it('removes menus from a pivoted table when disabled', () => {
        mocks.context.current = buildContext(true);

        renderWithProviders(
            <SimpleTable isDashboard={false} enableContextMenu={false} />,
        );

        expect(screen.getByTestId('pivot-table')).toHaveAttribute(
            'data-context-menu-enabled',
            'false',
        );
    });

    it('preserves unpivoted menus by default', () => {
        renderWithProviders(<SimpleTable isDashboard={false} />);

        expect(screen.getByTestId('table')).toHaveAttribute(
            'data-cell-menu-enabled',
            'true',
        );
    });

    it('preserves pivoted menus by default', () => {
        mocks.context.current = buildContext(true);

        renderWithProviders(<SimpleTable isDashboard={false} />);

        expect(screen.getByTestId('pivot-table')).toHaveAttribute(
            'data-context-menu-enabled',
            'true',
        );
    });
});
