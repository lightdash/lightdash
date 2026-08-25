import { type TableCalculation } from '@lightdash/common';
import { explorerActions, explorerReducer } from './explorerSlice';

describe('explorerSlice pivot axis updates', () => {
    it('preserves both axis changes when moving a row dimension to columns', () => {
        const initialState = explorerReducer(
            undefined,
            explorerActions.setPivotConfig({
                columns: ['months_since_start'],
                rows: ['cohort_month', 'plan_name'],
            }),
        );

        const withUpdatedColumns = explorerReducer(
            initialState,
            explorerActions.setPivotColumns([
                'months_since_start',
                'plan_name',
            ]),
        );
        const result = explorerReducer(
            withUpdatedColumns,
            explorerActions.setPivotRows(['cohort_month']),
        );

        expect(result.unsavedChartVersion.pivotConfig).toEqual({
            columns: ['months_since_start', 'plan_name'],
            rows: ['cohort_month'],
        });
    });

    it('preserves both axis changes when moving a column dimension to rows', () => {
        const initialState = explorerReducer(
            undefined,
            explorerActions.setPivotConfig({
                columns: ['months_since_start', 'plan_name'],
                rows: ['cohort_month'],
            }),
        );

        const withUpdatedColumns = explorerReducer(
            initialState,
            explorerActions.setPivotColumns(['months_since_start']),
        );
        const result = explorerReducer(
            withUpdatedColumns,
            explorerActions.setPivotRows(['cohort_month', 'plan_name']),
        );

        expect(result.unsavedChartVersion.pivotConfig).toEqual({
            columns: ['months_since_start'],
            rows: ['cohort_month', 'plan_name'],
        });
    });
});

describe('explorerSlice table calculation updates', () => {
    const tableCalculation: TableCalculation = {
        name: 'revenue_growth',
        displayName: 'Revenue growth',
        sql: '${orders.revenue}',
    };

    it.each([
        {
            name: 'adding',
            action: explorerActions.addTableCalculation(tableCalculation),
        },
        {
            name: 'updating',
            action: explorerActions.updateTableCalculation({
                oldName: tableCalculation.name,
                tableCalculation: {
                    ...tableCalculation,
                    sql: '${orders.net_revenue}',
                },
            }),
        },
        {
            name: 'deleting',
            action: explorerActions.deleteTableCalculation(
                tableCalculation.name,
            ),
        },
    ])('requests a query after $name a calculation', ({ action }) => {
        const result = explorerReducer(undefined, action);

        expect(result.queryExecution.pendingFetch).toBe(true);
    });
});
