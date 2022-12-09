import { NonIdealState } from '@blueprintjs/core';
import { FC } from 'react';
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
};

const SimpleTable: FC<SimpleTableProps> = ({
    isDashboard,
    tileUuid,
    className,
    $shouldExpand,
    $padding,
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
            hideRowNumbers,
        },
        resultsData,
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

    return (
        <Table
            $shouldExpand={$shouldExpand}
            $padding={$padding}
            className={className}
            status="success"
            data={rows}
            columns={columns}
            columnOrder={columnOrder}
            hideRowNumbers={hideRowNumbers}
            showColumnCalculation={showColumnCalculation}
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
                            metricQuery={resultsData?.metricQuery}
                        />
                    );
                return (
                    <CellContextMenu
                        {...props}
                        metricQuery={resultsData?.metricQuery}
                        explore={explore}
                    />
                );
            }}
            {...rest}
        />
    );
};

export default SimpleTable;
