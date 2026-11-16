import {
    DashboardTileTypes,
    DimensionType,
    FieldType,
    FilterOperator,
    type DashboardComposerChartTile,
    type DashboardFilterRule,
    type Field,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createDashboardTestStore } from '../../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../../testing/DashboardStoreTestProvider';
import { renderWithProviders } from '../../../testing/testUtils';
import { FilterActions } from './constants';
import TileFilterConfiguration from './TileFilterConfiguration';

const statusField = {
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name: 'status',
    label: 'Status',
    table: 'orders',
    tableLabel: 'Orders',
    sql: '',
    hidden: false,
} as Field;

const composerTile: DashboardComposerChartTile = {
    uuid: 'composer-1',
    type: DashboardTileTypes.COMPOSER_CHART,
    x: 0,
    y: 0,
    h: 9,
    w: 12,
    tabUuid: null,
    properties: {
        title: 'Composer',
        composerChartUuid: 'chart-1',
        chartName: null,
    },
};

const rule = (
    tileTargets?: DashboardFilterRule['tileTargets'],
): DashboardFilterRule => ({
    id: 'rule',
    label: undefined,
    target: { fieldId: 'orders_status', tableName: 'orders' },
    operator: FilterOperator.EQUALS,
    values: ['shipped'],
    tileTargets,
});

const statusColumn = { reference: 'status', type: DimensionType.STRING };

const renderList = (
    filterRule: DashboardFilterRule,
    availableTileFilters: Record<string, Field[] | undefined>,
    columns = [statusColumn],
) => {
    const onChange = vi.fn();
    const store = createDashboardTestStore({
        sqlChartTilesMetadata: { 'composer-1': { columns } },
    });
    renderWithProviders(
        <DashboardStoreTestProvider store={store}>
            <TileFilterConfiguration
                tiles={[composerTile]}
                tabs={[]}
                field={statusField}
                filterRule={filterRule}
                availableTileFilters={availableTileFilters}
                onChange={onChange}
                onToggleAll={vi.fn()}
            />
        </DashboardStoreTestProvider>,
    );
    return onChange;
};

describe('TileFilterConfiguration on a composer tile', () => {
    it('lists the tile once, with its fields and SQL columns in one select', async () => {
        const onChange = renderList(rule(), {
            'composer-1': [statusField],
        });

        expect(screen.getAllByTestId('tile-filter-item')).toHaveLength(1);
        const select = screen.getByDisplayValue('Orders Status');
        await userEvent.click(select);
        // Fields as in the shipped select, columns in a trailing group
        expect(screen.queryByText('Fields')).not.toBeInTheDocument();
        expect(screen.getByText('SQL columns')).toBeInTheDocument();
        expect(
            screen.getByRole('option', { name: /Orders Status/ }),
        ).toBeInTheDocument();

        await userEvent.click(screen.getByRole('option', { name: 'status' }));
        expect(onChange).toHaveBeenLastCalledWith(
            FilterActions.ADD,
            'composer-1',
            {
                fieldId: 'status',
                tableName: 'mock_table',
                isSqlColumn: true,
            },
        );
    });

    it('shows a SQL column target as selected on a tile with no fields', () => {
        renderList(
            rule({
                'composer-1': {
                    fieldId: 'status',
                    tableName: 'mock_table',
                    isSqlColumn: true,
                },
            }),
            {},
        );

        expect(screen.getAllByTestId('tile-filter-item')).toHaveLength(1);
        expect(
            screen.getByRole('checkbox', { name: /Composer/ }),
        ).toBeChecked();
        expect(screen.getByDisplayValue('status')).toBeInTheDocument();
    });

    it('drops the row once a run reports no SQL columns and the tile has no fields', () => {
        renderList(rule(), {}, []);

        expect(screen.queryAllByTestId('tile-filter-item')).toHaveLength(0);
    });
});
