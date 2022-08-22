import { NonIdealState } from '@blueprintjs/core';
import { FC } from 'react';
import Table from '../common/Table';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import { LoadingChart } from '../SimpleChart';
import CellContextMenu from './CellContextMenu';
import { TableWrapper } from './SimpleTable.styles';

const SimpleTable: FC = () => {
    const {
        isLoading,
        columnOrder,
        tableConfig: { rows, error, columns, showColumnCalculation },
        isSqlRunner,
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
                    return <CellContextMenu {...props} />;
                }}
            />
        </TableWrapper>
    );
};

export default SimpleTable;
