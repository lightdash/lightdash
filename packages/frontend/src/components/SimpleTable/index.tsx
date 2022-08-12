import { FC } from 'react';
import Table from '../common/Table';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import { LoadingChart } from '../SimpleChart';
import CellContextMenu from './CellContextMenu';
import { TableWrapper } from './SimpleTable.styles';

const SimpleTable: FC = () => {
    const {
        resultsData,
        isLoading,
        columnOrder,
        tableConfig: { columns, showColumnCalculation },
        pivotDimensions,
        plotData,
    } = useVisualizationContext();

    if (isLoading) return <LoadingChart />;
    const pivotDimension = pivotDimensions?.[0];
    console.log('plotData', plotData);
    return (
        <TableWrapper>
            <Table
                status={'success'}
                data={pivotDimension ? plotData : resultsData?.rows || []}
                columns={columns as any}
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
