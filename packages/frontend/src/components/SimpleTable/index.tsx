import { NonIdealState } from '@blueprintjs/core';
import React, { FC } from 'react';
import Table from '../common/Table';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import { LoadingChart } from '../SimpleChart';
import CellContextMenu from './CellContextMenu';
import DashboardCellContextMenu from './DashboardCellContextMenu';
import { TableWrapper } from './SimpleTable.styles';

const SimpleTable: FC<{ isDashboard: boolean }> = ({ isDashboard }) => {
    const {
        isLoading,
        columnOrder,
        tableConfig: { rows, error, columns, showColumnCalculation },
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
        <TableWrapper>
            <Table
                status={'success'}
                data={rows}
                columns={columns}
                columnOrder={columnOrder}
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
            />
        </TableWrapper>
    );
};

export default SimpleTable;
