import { Box, Flex } from '@mantine/core';
import { noop } from '@mantine/utils';
import { IconAlertCircle } from '@tabler/icons-react';
import { type FC, useCallback, useMemo } from 'react';
import { isTableVisualizationConfig } from '../LightdashVisualization/types';
import { useVisualizationContext } from '../LightdashVisualization/useVisualizationContext';
import { LoadingChart } from '../SimpleChart';
import PivotTable from '../common/PivotTable';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';
import Table from '../common/Table';
import { ResultCount } from '../common/Table/TablePagination';
import {
    type CellContextMenuProps,
    type HeaderProps,
} from '../common/Table/types';
import CellContextMenu from './CellContextMenu';
import DashboardCellContextMenu from './DashboardCellContextMenu';
import DashboardHeaderContextMenu from './DashboardHeaderContextMenu';
import MinimalCellContextMenu from './MinimalCellContextMenu';

type SimpleTableProps = {
    isDashboard: boolean;
    tileUuid?: string;
    className?: string;
    $shouldExpand?: boolean;
    minimal?: boolean;
};

const SimpleTable: FC<SimpleTableProps> = ({
    isDashboard,
    tileUuid,
    className,
    $shouldExpand,
    minimal = false,
    ...rest
}) => {
    const { columnOrder, itemsMap, visualizationConfig, resultsData } =
        useVisualizationContext();

    const lazyLoadStatus = useMemo(() => {
        if (resultsData && resultsData.rows.length > 0) {
            return 'success';
        } else {
            return 'loading';
        }
    }, [resultsData]);

    const showColumnCalculation = useMemo(() => {
        if (!isTableVisualizationConfig(visualizationConfig)) {
            return undefined;
        }

        return visualizationConfig.chartConfig.showColumnCalculation;
    }, [visualizationConfig]);

    const pagination = useMemo(() => {
        return {
            show: showColumnCalculation,
        };
    }, [showColumnCalculation]);

    const headerContextMenu = useCallback<
        FC<React.PropsWithChildren<HeaderProps>>
    >(
        (props) => {
            if (!minimal && isDashboard && tileUuid)
                return (
                    <DashboardHeaderContextMenu
                        {...props}
                        tileUuid={tileUuid}
                    />
                );
            return null;
        },
        [isDashboard, minimal, tileUuid],
    );

    const cellContextMenu = useCallback<
        FC<React.PropsWithChildren<CellContextMenuProps>>
    >(
        (props) => {
            if (minimal) {
                return <MinimalCellContextMenu {...props} />;
            }
            if (isDashboard && tileUuid) {
                return (
                    <DashboardCellContextMenu {...props} itemsMap={itemsMap} />
                );
            }
            return <CellContextMenu {...props} />;
        },
        [isDashboard, itemsMap, minimal, tileUuid],
    );

    if (!isTableVisualizationConfig(visualizationConfig)) return null;

    const {
        columns,
        conditionalFormattings,
        minMaxMap,
        hideRowNumbers,
        pivotTableData,
        getFieldLabel,
        getField,
        showResultsTotal,
        showSubtotals,
    } = visualizationConfig.chartConfig;

    if (pivotTableData.error) {
        return (
            <SuboptimalState
                title="Results not available"
                description={pivotTableData.error}
                icon={IconAlertCircle}
            />
        );
    } else if (pivotTableData.loading || pivotTableData.data) {
        // todo: load all results for pivot table
        return (
            <Box
                p="xs"
                pb={showResultsTotal ? 'xxl' : 'xl'}
                miw="100%"
                h="100%"
            >
                {pivotTableData.data ? (
                    <>
                        <PivotTable
                            className={className}
                            data={pivotTableData.data}
                            conditionalFormattings={conditionalFormattings}
                            minMaxMap={minMaxMap}
                            getFieldLabel={getFieldLabel}
                            getField={getField}
                            hideRowNumbers={hideRowNumbers}
                            showSubtotals={showSubtotals}
                            {...rest}
                        />
                        {showResultsTotal && (
                            <Flex justify="flex-end" pt="xxs" align="center">
                                <ResultCount
                                    count={pivotTableData.data.rowsCount}
                                />
                            </Flex>
                        )}
                    </>
                ) : (
                    <LoadingChart />
                )}
            </Box>
        );
    }

    return (
        <Box p="xs" pb="md" miw="100%" h="100%">
            <Table
                minimal={minimal}
                $shouldExpand={$shouldExpand}
                className={className}
                status={lazyLoadStatus}
                data={resultsData?.rows || []}
                totalRowsCount={resultsData?.totalResults || 0}
                isFetchingRows={!!resultsData?.isFetchingRows}
                loadingState={LoadingChart}
                fetchMoreRows={resultsData?.fetchMoreRows || noop}
                columns={columns}
                columnOrder={columnOrder}
                hideRowNumbers={hideRowNumbers}
                showColumnCalculation={showColumnCalculation}
                showSubtotals={showSubtotals}
                conditionalFormattings={conditionalFormattings}
                minMaxMap={minMaxMap}
                footer={pagination}
                headerContextMenu={headerContextMenu}
                cellContextMenu={cellContextMenu}
                pagination={{ showResultsTotal }}
                {...rest}
            />
        </Box>
    );
};

export default SimpleTable;
