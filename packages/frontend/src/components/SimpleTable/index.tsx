import React, { FC } from 'react';
import Table from '../common/Table';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import { LoadingChart } from '../SimpleChart';
import { TableWrapper } from './SimpleTable.styles';

const SimpleTable: FC = () => {
    const {
        resultsData,
        isLoading,
        columnOrder,
        tableConfig: { columns },
    } = useVisualizationContext();

    if (isLoading) return <LoadingChart />;

    return (
        <TableWrapper>
            <Table
                status={'success'}
                data={resultsData?.rows || []}
                columns={columns}
                columnOrder={columnOrder}
            />
        </TableWrapper>
    );
};

export default SimpleTable;
