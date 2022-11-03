import { Colors } from '@blueprintjs/core';
import { Field, getItemMap, TableCalculation } from '@lightdash/common';
import React, { FC, memo, ReactNode, useCallback, useMemo } from 'react';
import { useColumns } from '../../../hooks/useColumns';
import { useExplore } from '../../../hooks/useExplore';
import { useExplorerContext } from '../../../providers/ExplorerProvider';
import { TrackSection } from '../../../providers/TrackingProvider';
import { SectionName } from '../../../types/Events';
import Table from '../../common/Table';
import CellContextMenu from './CellContextMenu';
import ColumnHeaderContextMenu from './ColumnHeaderContextMenu';
import {
    EmptyStateExploreLoading,
    EmptyStateNoColumns,
    EmptyStateNoTableData,
    NoTableSelected,
} from './ExplorerResultsNonIdealStates';
import { TableMaxHeightContainer } from './ResultsCard.styles';

export const ExplorerResults = memo(() => {
    const columns = useColumns();
    const isEditMode = useExplorerContext(
        (context) => context.state.isEditMode,
    );
    const activeTableName = useExplorerContext(
        (context) => context.state.unsavedChartVersion.tableName,
    );
    const dimensions = useExplorerContext(
        (context) => context.state.unsavedChartVersion.metricQuery.dimensions,
    );
    const metrics = useExplorerContext(
        (context) => context.state.unsavedChartVersion.metricQuery.metrics,
    );
    const explorerColumnOrder = useExplorerContext(
        (context) => context.state.unsavedChartVersion.tableConfig.columnOrder,
    );
    const resultsData = useExplorerContext(
        (context) => context.queryResults.data,
    );
    const status = useExplorerContext((context) => context.queryResults.status);
    const setColumnOrder = useExplorerContext(
        (context) => context.actions.setColumnOrder,
    );
    const { isLoading, data: exploreData } = useExplore(activeTableName, {
        refetchOnMount: false,
    });
    const tableCalculations = useExplorerContext(
        (context) =>
            context.state.unsavedChartVersion.metricQuery.tableCalculations,
    );
    const additionalMetrics = useExplorerContext(
        (context) =>
            context.state.unsavedChartVersion.metricQuery.additionalMetrics,
    );

    const itemsMap: Record<string, Field | TableCalculation> | undefined =
        useMemo(() => {
            if (exploreData) {
                return getItemMap(
                    exploreData,
                    additionalMetrics,
                    tableCalculations,
                );
            }
            return undefined;
        }, [exploreData, additionalMetrics, tableCalculations]);

    const cellContextMenu = useCallback(
        (props) => (
            <CellContextMenu
                isEditMode={isEditMode}
                {...props}
                itemsMap={itemsMap}
            />
        ),
        [isEditMode, itemsMap],
    );

    const IdleState: FC = useCallback(() => {
        let description: ReactNode =
            'Run query to view your results and visualize them as a chart.';
        if (dimensions.length <= 0) {
            description = (
                <>
                    Pick one or more{' '}
                    <span style={{ color: Colors.BLUE1 }}>dimensions</span> to
                    split your selected metric by.
                </>
            );
        } else if (metrics.length <= 0) {
            description = (
                <>
                    Pick a <span style={{ color: Colors.ORANGE1 }}>metric</span>{' '}
                    to make calculations across your selected dimensions.
                </>
            );
        }

        return <EmptyStateNoTableData description={description} />;
    }, [dimensions.length, metrics.length]);

    const pagination = useMemo(
        () => ({
            show: true,
        }),
        [],
    );
    const footer = useMemo(
        () => ({
            show: true,
        }),
        [],
    );

    if (!activeTableName) return <NoTableSelected />;

    if (isLoading) return <EmptyStateExploreLoading />;

    if (columns.length === 0) return <EmptyStateNoColumns />;

    return (
        <TrackSection name={SectionName.RESULTS_TABLE}>
            <TableMaxHeightContainer>
                <Table
                    status={status}
                    data={resultsData?.rows || []}
                    columns={columns}
                    columnOrder={explorerColumnOrder}
                    onColumnOrderChange={setColumnOrder}
                    cellContextMenu={cellContextMenu}
                    headerContextMenu={
                        isEditMode ? ColumnHeaderContextMenu : undefined
                    }
                    idleState={IdleState}
                    pagination={pagination}
                    footer={footer}
                />
            </TableMaxHeightContainer>
        </TrackSection>
    );
});
