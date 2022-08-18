import React, { FC } from 'react';
import Table from '../common/Table';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import { LoadingChart } from '../SimpleChart';
import { CellContextMenu } from './CellContextMenu';
import { TableWrapper } from './SimpleTable.styles';

const SimpleTable: FC = () => {
    const {
        resultsData,
        isLoading,
        columnOrder,
        tableConfig: { columns, showColumnCalculation },
    } = useVisualizationContext();

    if (isLoading) return <LoadingChart />;

    return (
        <TableWrapper>
            <Table
                status={'success'}
                data={resultsData?.rows || []}
                columns={columns}
                columnOrder={columnOrder}
                footer={{
                    show: showColumnCalculation,
                }}
                cellContextMenu={(props) => <CellContextMenu {...props} />}
            />
        </TableWrapper>
    );
};

export default SimpleTable;
