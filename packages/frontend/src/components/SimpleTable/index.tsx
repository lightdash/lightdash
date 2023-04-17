import { NonIdealState } from '@blueprintjs/core';
import { Box } from '@mantine/core';
import { FC } from 'react';
import PivotTable from '../common/PivotTable';
import Table from '../common/Table';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import { LoadingChart } from '../SimpleChart';
import CellContextMenu from './CellContextMenu';
import DashboardCellContextMenu from './DashboardCellContextMenu';

type SimpleTableProps = {
    isDashboard: boolean;
    tileUuid?: string;
    className?: string;
    $padding?: number;
    $shouldExpand?: boolean;
    minimal?: boolean;
};

const SimpleTable: FC<SimpleTableProps> = ({
    isDashboard,
    tileUuid,
    className,
    $shouldExpand,
    $padding,
    minimal = false,
    ...rest
}) => {
    const {
        isLoading,
        columnOrder,
        tableConfig: {
            rows,
            error,
            columns,
            showColumnCalculation,
            conditionalFormattings,
            hideRowNumbers,
            pivotTableData,
            getFieldLabel,
            getField,
        },
        isSqlRunner,
        explore,
    } = useVisualizationContext();

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

    if (pivotTableData.error || pivotTableData.data) {
        return (
            <Box w="100%" h="100%" p="xs" sx={{ overflowX: 'scroll' }}>
                {pivotTableData.error || !pivotTableData.data ? (
                    <NonIdealState
                        title="Results not available"
                        description={pivotTableData.error}
                        icon="error"
                    />
                ) : (
                    <PivotTable
                        w="100%"
                        data={pivotTableData.data}
                        conditionalFormattings={conditionalFormattings}
                        getFieldLabel={getFieldLabel}
                        getField={getField}
                        hideRowNumbers={hideRowNumbers}
                    />
                )}
            </Box>
        );
    }

    return (
        <Table
            minimal={minimal}
            $shouldExpand={$shouldExpand}
            $padding={$padding}
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
            {...rest}
        />
    );
};

export default SimpleTable;
