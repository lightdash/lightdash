import { Colors } from '@blueprintjs/core';
import { ResultRow } from 'common';
import React from 'react';
import { useColumns } from '../../hooks/useColumns';
import { useExplore } from '../../hooks/useExplore';
import { useQueryResults } from '../../hooks/useQueryResults';
import { useExplorer } from '../../providers/ExplorerProvider';
import { CellContextMenu } from '../ResultsTable/CellContextMenu';
import ColumnHeaderContextMenu from '../ResultsTable/ColumnHeaderContextMenu';
import { ResultsTable as Table } from '../ResultsTable/ResultsTable';
import {
    EmptyStateExploreLoading,
    EmptyStateNoColumns,
    EmptyStateNoTableData,
    NoTableSelected,
} from './ExplorerResultsNonIdealStates';

function getValues(rows: ResultRow[]): { [col: string]: any }[] {
    return rows.map((row: ResultRow) => {
        let newRow: { [col: string]: any } = {};
        Object.keys(row).forEach((key: string) => {
            const value: string =
                row[key]?.value?.formatted || row[key]?.value?.raw || row[key];
            newRow[key] = value;
        });
        return newRow;
    });
}
export const ExplorerResults = () => {
    const dataColumns = useColumns();
    const queryResults = useQueryResults();
    const {
        state: {
            tableName: activeTableName,
            columnOrder: explorerColumnOrder,
            dimensions,
            metrics,
        },
        actions: { setColumnOrder: setExplorerColumnOrder },
    } = useExplorer();
    const activeExplore = useExplore(activeTableName);
    const safeData = React.useMemo(
        () => (queryResults.status === 'success' ? queryResults.data.rows : []),
        [queryResults.status, queryResults.data],
    );
    const rawData = getValues(safeData);

    if (!activeTableName) return <NoTableSelected />;

    if (activeExplore.isLoading) return <EmptyStateExploreLoading />;

    if (dataColumns.length === 0) return <EmptyStateNoColumns />;

    let IdleState = (
        <EmptyStateNoTableData description="Run query to view your results and visualize them as a chart." />
    );
    if (dimensions.length <= 0)
        IdleState = (
            <EmptyStateNoTableData
                description={
                    <>
                        Pick one or more{' '}
                        <span style={{ color: Colors.BLUE1 }}>dimensions</span>{' '}
                        to split your selected metric by.
                    </>
                }
            />
        );

    if (metrics.length <= 0)
        IdleState = (
            <EmptyStateNoTableData
                description={
                    <>
                        Pick a{' '}
                        <span style={{ color: Colors.ORANGE1 }}>metric</span> to
                        make calculations across your selected dimensions.
                    </>
                }
            />
        );

    return (
        <Table
            data={rawData}
            dataColumns={dataColumns}
            loading={queryResults.isLoading}
            idle={queryResults.isIdle}
            dataColumnOrder={explorerColumnOrder}
            onColumnOrderChange={setExplorerColumnOrder}
            idleState={IdleState}
            cellContextMenu={CellContextMenu}
            headerContextMenu={ColumnHeaderContextMenu}
        />
    );
};
