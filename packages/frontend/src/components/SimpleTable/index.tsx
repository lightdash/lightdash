import { NonIdealState } from '@blueprintjs/core';
import { ChartType } from '@lightdash/common';
import { Box, Flex } from '@mantine/core';
import { FC } from 'react';
import PivotTable from '../common/PivotTable';
import Table from '../common/Table';
import { ResultCount } from '../common/Table/TablePagination';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import { LoadingChart } from '../SimpleChart';
import CellContextMenu from './CellContextMenu';
import DashboardCellContextMenu from './DashboardCellContextMenu';

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
        explore,
        visualizationConfig,
    } = useVisualizationContext();

    const isTable = visualizationConfig?.chartType === ChartType.TABLE;
    if (!isTable) return null;

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
    } = visualizationConfig.chartConfig;

    if (isLoading) return <LoadingChart />;

    if (error) {
        return (
            <NonIdealState
                title="Results not available"
                description={error}
                icon="error"
            />
        );
    }

    if (pivotTableData.error) {
        return (
            <NonIdealState
                title="Results not available"
                description={pivotTableData.error}
                icon="error"
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
                conditionalFormattings={conditionalFormattings}
                footer={{
                    show: showColumnCalculation,
                }}
                cellContextMenu={(props) => {
                    if (isSqlRunner) return <>{props.children}</>;
                    if (isDashboard && tileUuid)
                        return (
                            <DashboardCellContextMenu
                                {...props}
                                tileUuid={tileUuid}
                                explore={explore}
                            />
                        );
                    return <CellContextMenu {...props} />;
                }}
                pagination={{ showResultsTotal }}
                {...rest}
            />
        </Box>
    );
};

export default SimpleTable;
