import React, { FC } from 'react';
import Table from '../common/Table';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import { LoadingChart } from '../SimpleChart';
import UnderlyingDataModal from '../UnderlyingData/UnderlyingDataModal';
import UnderlyingDataProvider from '../UnderlyingData/UnderlyingDataProvider';
import { CellContextMenu } from './CellContextMenu';
import { TableWrapper } from './SimpleTable.styles';

const SimpleTable: FC = () => {
    const {
        resultsData,
        isLoading,
        columnOrder,
        tableConfig: { columns, showColumnCalculation },
        explore,
    } = useVisualizationContext();

    if (isLoading) return <LoadingChart />;

    return (
        <TableWrapper>
            <UnderlyingDataProvider tableName={explore?.name || ''}>
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
                <UnderlyingDataModal />
            </UnderlyingDataProvider>
        </TableWrapper>
    );
};

export default SimpleTable;
