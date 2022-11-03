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
};

const SimpleTable: FC<SimpleTableProps> = ({ isDashboard, className }) => {
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
            status="success"
            data={rows}
            columns={columns}
            columnOrder={columnOrder}
            hideRowNumbers={hideRowNumbers}
            footer={{
                show: showColumnCalculation,
            }}
            className={className}
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
        />
    );
};

export default SimpleTable;
