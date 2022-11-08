import { NonIdealState } from '@blueprintjs/core';
import { FC } from 'react';
import Table from '../common/Table';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import { LoadingChart } from '../SimpleChart';
import CellContextMenu from './CellContextMenu';
import DashboardCellContextMenu from './DashboardCellContextMenu';

type SimpleTableProps = {
    isDashboard: boolean;
    className?: string;
    $shouldExpand?: boolean;
};

const SimpleTable: FC<SimpleTableProps> = ({
    isDashboard,
    className,
    $shouldExpand,
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
                if (isDashboard)
                    return (
                        <DashboardCellContextMenu
                            {...props}
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
