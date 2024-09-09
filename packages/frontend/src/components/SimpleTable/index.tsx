import { Box, Flex } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import PivotTable from '../common/PivotTable';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';
import Table from '../common/Table';
import { ResultCount } from '../common/Table/TablePagination';
import { isTableVisualizationConfig } from '../LightdashVisualization/VisualizationConfigTable';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import { LoadingChart } from '../SimpleChart';
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
    const {
        isLoading,
        columnOrder,
        isSqlRunner,
        itemsMap,
        visualizationConfig,
    } = useVisualizationContext();

    if (!isTableVisualizationConfig(visualizationConfig)) return null;

    const {
        rows,
        error,
        columns,
        showColumnCalculation,
        conditionalFormattings,
        hideRowNumbers,
        pivotTableData,
        getFieldLabel,
        getField,
        showResultsTotal,
        showSubtotals,
    } = visualizationConfig.chartConfig;

    if (isLoading) return <LoadingChart />;

    if (error) {
        return (
            <SuboptimalState
                title="Results not available"
                description={error}
                icon={IconAlertCircle}
            />
        );
    }

    if (pivotTableData.error) {
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
                            getFieldLabel={getFieldLabel}
                            getField={getField}
                            hideRowNumbers={hideRowNumbers}
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
                status="success"
                data={rows}
                columns={columns}
                columnOrder={columnOrder}
                hideRowNumbers={hideRowNumbers}
                showColumnCalculation={showColumnCalculation}
                showSubtotals={showSubtotals}
                conditionalFormattings={conditionalFormattings}
                footer={{
                    show: showColumnCalculation,
                }}
                headerContextMenu={(props) => {
                    if (!minimal && isDashboard && tileUuid)
                        return (
                            <DashboardHeaderContextMenu
                                {...props}
                                tileUuid={tileUuid}
                            />
                        );
                    return null;
                }}
                cellContextMenu={(props) => {
                    if (isSqlRunner) return <>{props.children}</>;
                    if (minimal) {
                        return <MinimalCellContextMenu {...props} />;
                    }
                    if (isDashboard && tileUuid) {
                        return (
                            <DashboardCellContextMenu
                                {...props}
                                itemsMap={itemsMap}
                            />
                        );
                    }
                    return <CellContextMenu {...props} />;
                }}
                pagination={{ showResultsTotal }}
                {...rest}
            />
        </Box>
    );
};

export default SimpleTable;
