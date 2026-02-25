import { Box, Button, Flex, Text } from '@mantine/core';
import { noop } from '@mantine/utils';
import { IconAlertCircle, IconRefresh, IconTable } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useRef, type FC } from 'react';
import {
    isChunkLoadError,
    triggerChunkErrorReload,
} from '../../features/chunkErrorHandler';
import { useAutoColumnWidths } from '../../hooks/useAutoColumnWidths';
import { useIsTableColumnWidthStabilizationEnabled } from '../../hooks/useIsTableColumnWidthStabilizationEnabled';
import LoadingChart from '../common/LoadingChart';
import PivotTable from '../common/PivotTable';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';
import Table from '../common/Table';
import { ResultCount } from '../common/Table/TablePagination';
import {
    type CellContextMenuProps,
    type HeaderProps,
} from '../common/Table/types';
import { isTableVisualizationConfig } from '../LightdashVisualization/types';
import { useVisualizationContext } from '../LightdashVisualization/useVisualizationContext';
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
    const {
        columnOrder,
        itemsMap,
        visualizationConfig,
        resultsData,
        isLoading,
    } = useVisualizationContext();

    const hasSignaledScreenshotReady = useRef(false);

    const getCellText = useCallback(
        (row: Record<string, unknown>, colId: string) => {
            const cell = row[colId] as
                | { value?: { formatted?: string } }
                | undefined;
            return cell?.value?.formatted ?? '';
        },
        [],
    );

    const isTableColumnWidthStabilizationEnabled =
        useIsTableColumnWidthStabilizationEnabled();

    const autoColumnWidths = useAutoColumnWidths({
        columnIds: columnOrder,
        rows: (resultsData?.rows ?? []) as Record<string, unknown>[],
        getCellText,
        enabled: isTableColumnWidthStabilizationEnabled,
    });

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

        // Signal ready for both success and idle (idle = no data to fetch)
        if (loadResultsStatus === 'success' || loadResultsStatus === 'idle') {
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

    useEffect(() => {
        if (shouldPaginateResults) return;

        // Load all the rows
        resultsData?.setFetchAll(true);
    }, [shouldPaginateResults, resultsData]);

    const columnsWithWidths = useMemo(() => {
        const rawColumns = isTableVisualizationConfig(visualizationConfig)
            ? visualizationConfig.chartConfig.columns
            : [];
        if (Object.keys(autoColumnWidths).length === 0) return rawColumns;
        return rawColumns.map((col) => {
            const colId = col.id ?? '';
            const autoWidth = autoColumnWidths[colId];
            if (!autoWidth) return col;
            return {
                ...col,
                meta: {
                    ...col.meta,
                    width: autoWidth,
                    style: {
                        ...col.meta?.style,
                        width: autoWidth,
                        minWidth: autoWidth,
                        maxWidth: autoWidth,
                    },
                },
            };
        });
    }, [visualizationConfig, autoColumnWidths]);

    if (!isTableVisualizationConfig(visualizationConfig)) return null;

    const {
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
                p={isDashboard ? 0 : 'xs'}
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
        <Box p={isDashboard ? 0 : 'xs'} pb="md" miw="100%" h="100%">
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
                columns={columnsWithWidths}
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
                {...rest}
            />
        </Box>
    );
};

export default SimpleTable;
