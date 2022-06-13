import { Colors } from '@blueprintjs/core';
import { getResultValues } from '@lightdash/common';
import React from 'react';
import { useColumns } from '../../../hooks/useColumns';
import { useExplore } from '../../../hooks/useExplore';
import { useExplorer } from '../../../providers/ExplorerProvider';
import { CellContextMenu } from '../../ResultsTable/CellContextMenu';
import ColumnHeaderContextMenu from '../../ResultsTable/ColumnHeaderContextMenu';
import { ResultsTable } from '../../ResultsTable/ResultsTable';
import {
    EmptyStateExploreLoading,
    EmptyStateNoColumns,
    EmptyStateNoTableData,
    NoTableSelected,
} from './ExplorerResultsNonIdealStates';

export const ExplorerResults = () => {
    const dataColumns = useColumns();
    const {
        state: {
            isEditMode,
            unsavedChartVersion: {
                tableName: activeTableName,
                metricQuery: { dimensions, metrics },
                tableConfig: { columnOrder: explorerColumnOrder },
            },
        },
        queryResults,
        actions: { setColumnOrder: setExplorerColumnOrder },
    } = useExplorer();
    const activeExplore = useExplore(activeTableName);
    const safeData = React.useMemo(
        () => (queryResults.status === 'success' ? queryResults.data.rows : []),
        [queryResults.status, queryResults.data],
    );
    const formattedData = getResultValues(safeData);

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
        <ResultsTable
            isEditMode={isEditMode}
            data={formattedData}
            dataColumns={dataColumns}
            loading={queryResults.isLoading}
            idle={queryResults.isIdle}
            dataColumnOrder={explorerColumnOrder}
            onColumnOrderChange={setExplorerColumnOrder}
            idleState={IdleState}
            cellContextMenu={isEditMode ? CellContextMenu : undefined}
            headerContextMenu={isEditMode ? ColumnHeaderContextMenu : undefined}
        />
    );
};
