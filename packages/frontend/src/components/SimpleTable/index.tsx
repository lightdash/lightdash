import { type ColumnProperties } from '@lightdash/common';
import { Box, Button, Flex, Text } from '@mantine/core';
import { noop } from '@mantine/utils';
import { IconAlertCircle, IconRefresh, IconTable } from '@tabler/icons-react';
import { type FC, useCallback, useEffect, useMemo, useRef } from 'react';
import {
    isChunkLoadError,
    triggerChunkErrorReload,
} from '../../features/chunkErrorHandler';
import { useDashboardUIPreference } from '../../hooks/dashboard/useDashboardUIPreference';
import { isTableVisualizationConfig } from '../LightdashVisualization/types';
import { useVisualizationContext } from '../LightdashVisualization/useVisualizationContext';
import LoadingChart from '../common/LoadingChart';
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
    onScreenshotReady?: () => void;
    onScreenshotError?: () => void;
};

const SimpleTable: FC<SimpleTableProps> = ({
    isDashboard,
    tileUuid,
    className,
    $shouldExpand,
    minimal = false,
    onScreenshotReady,
    onScreenshotError,
    ...rest
}) => {
    const { isDashboardRedesignEnabled } = useDashboardUIPreference();
    const {
        columnOrder,
        itemsMap,
        visualizationConfig,
        resultsData,
        isLoading,
    } = useVisualizationContext();

    const hasSignaledScreenshotReady = useRef(false);

    const shouldPaginateResults = useMemo(() => {
        return Boolean(
            !resultsData ||
                !isTableVisualizationConfig(visualizationConfig) ||
                // When subtotals are disable and there is no pivot table data, we don't need to load all the rows
                (!visualizationConfig.chartConfig.showSubtotals &&
                    !visualizationConfig.chartConfig.pivotTableData?.data),
        );
    }, [resultsData, visualizationConfig]);

    const loadResultsStatus = useMemo(() => {
        if (!resultsData) {
            return 'loading';
        }

        if (
            !isLoading &&
            resultsData.rows.length === 0 &&
            !resultsData.hasFetchedAllRows
        ) {
            return 'idle';
        }

        // When paginated, it's success as soon as there are rows
        // When not paginated, it's success as soon as all rows have been fetched
        const isSuccess = shouldPaginateResults
            ? resultsData.rows.length > 0 || resultsData.hasFetchedAllRows
            : resultsData.hasFetchedAllRows;

        return isSuccess ? 'success' : 'loading';
    }, [resultsData, shouldPaginateResults, isLoading]);

    useEffect(() => {
        if (hasSignaledScreenshotReady.current) return;
        if (!onScreenshotReady && !onScreenshotError) return;
        if (!isTableVisualizationConfig(visualizationConfig)) return;

        const { pivotTableData, isPivotTableEnabled } =
            visualizationConfig.chartConfig;

        if (pivotTableData.error) {
            onScreenshotError?.();
            hasSignaledScreenshotReady.current = true;
            return;
        }

        if (isPivotTableEnabled) {
            if (pivotTableData.data && resultsData?.hasFetchedAllRows) {
                onScreenshotReady?.();
                hasSignaledScreenshotReady.current = true;
            }
            return;
        }

        if (loadResultsStatus === 'success') {
            onScreenshotReady?.();
            hasSignaledScreenshotReady.current = true;
        }
    }, [
        visualizationConfig,
        loadResultsStatus,
        resultsData?.hasFetchedAllRows,
        onScreenshotReady,
        onScreenshotError,
    ]);

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
            if (isDashboard && tileUuid)
                return (
                    <DashboardHeaderContextMenu
                        {...props}
                        tileUuid={tileUuid}
                    />
                );
            return null;
        },
        [isDashboard, tileUuid],
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

    const DashboardEmptyState = useCallback(() => {
        return (
            <SuboptimalState
                icon={IconTable}
                title="No results"
                description="This query ran successfully but returned no results"
            />
        );
    }, []);

    // Column width change handler for table visualization
    const handleColumnWidthChange = useCallback(
        (columnId: string, width: number | undefined) => {
            if (!isTableVisualizationConfig(visualizationConfig)) return;

            const widthUpdate: Partial<ColumnProperties> =
                width === undefined ? { width: undefined } : { width };
            visualizationConfig.chartConfig.updateColumnProperty(
                columnId,
                widthUpdate,
            );
        },
        [visualizationConfig],
    );

    useEffect(() => {
        if (shouldPaginateResults) return;

        // Load all the rows
        resultsData?.setFetchAll(true);
    }, [shouldPaginateResults, resultsData]);

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
        const isWorkerFetchError = isChunkLoadError(pivotTableData.error);
        if (isWorkerFetchError) {
            return (
                <SuboptimalState
                    icon={IconAlertCircle}
                    title="Application update required"
                    description={
                        <Box>
                            <Text mb="xs">
                                Refresh your browser to load the latest version
                                and display this visualization correctly.
                            </Text>
                            <Text size="sm" color="dimmed">
                                If this persists after refreshing, contact
                                support.
                            </Text>
                        </Box>
                    }
                    action={
                        <Button
                            variant="default"
                            size={'xs'}
                            leftIcon={<IconRefresh size={16} />}
                            onClick={triggerChunkErrorReload}
                        >
                            Refresh page
                        </Button>
                    }
                />
            );
        }
        return (
            <SuboptimalState
                title="Results not available"
                description={pivotTableData.error}
                icon={IconAlertCircle}
            />
        );
    } else if (pivotTableData.loading || pivotTableData.data) {
        return (
            <Box
                p={isDashboard && isDashboardRedesignEnabled ? 0 : 'xs'}
                pb={showResultsTotal ? 'xxl' : 'xl'}
                miw="100%"
                h="100%"
            >
                {pivotTableData.data && resultsData?.hasFetchedAllRows ? (
                    <>
                        <PivotTable
                            className={className}
                            data={pivotTableData.data}
                            isMinimal={minimal}
                            isDashboard={isDashboard}
                            conditionalFormattings={conditionalFormattings}
                            minMaxMap={minMaxMap}
                            getFieldLabel={getFieldLabel}
                            getField={getField}
                            hideRowNumbers={hideRowNumbers}
                            showSubtotals={showSubtotals}
                            columnProperties={
                                visualizationConfig.chartConfig.columnProperties
                            }
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
        <Box
            p={isDashboard && isDashboardRedesignEnabled ? 0 : 'xs'}
            pb="md"
            miw="100%"
            h="100%"
        >
            <Table
                isDashboard={isDashboard}
                minimal={minimal}
                $shouldExpand={$shouldExpand}
                className={className}
                status={loadResultsStatus}
                data={resultsData?.rows || []}
                totalRowsCount={resultsData?.totalResults || 0}
                isFetchingRows={!!resultsData?.isFetchingRows}
                loadingState={() => <LoadingChart />}
                emptyState={isDashboard ? DashboardEmptyState : undefined}
                fetchMoreRows={resultsData?.fetchMoreRows || noop}
                columns={columns}
                columnOrder={columnOrder}
                hideRowNumbers={hideRowNumbers}
                showColumnCalculation={showColumnCalculation}
                showSubtotals={showSubtotals}
                conditionalFormattings={conditionalFormattings}
                minMaxMap={minMaxMap}
                columnProperties={
                    visualizationConfig.chartConfig.columnProperties
                }
                footer={pagination}
                headerContextMenu={headerContextMenu}
                cellContextMenu={cellContextMenu}
                pagination={{ showResultsTotal }}
                enableColumnResizing={!minimal}
                onColumnWidthChange={handleColumnWidthChange}
                {...rest}
            />
        </Box>
    );
};

export default SimpleTable;
