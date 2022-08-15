import React, { FC } from 'react';
import usePlottedData from '../../hooks/plottedData/usePlottedData';
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
        tableConfig: { columns, showColumnCalculation, isColumnVisible },
        pivotDimensions,
    } = useVisualizationContext();

    const plotData = usePlottedData(
        resultsData?.rows,
        pivotDimensions,
        resultsData
            ? [
                  ...resultsData.metricQuery.metrics,
                  ...resultsData.metricQuery.tableCalculations.map(
                      (tc) => tc.name,
                  ),
              ].filter((itemId) => isColumnVisible(itemId))
            : undefined,

        resultsData ? [resultsData.metricQuery.dimensions[0]] : undefined,
    );

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
