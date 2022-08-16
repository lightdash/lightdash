import { NonIdealState } from '@blueprintjs/core';
import { ApiQueryResults } from '@lightdash/common';
import React, { FC } from 'react';
import usePlottedData from '../../hooks/plottedData/usePlottedData';
import Table from '../common/Table';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import { LoadingChart } from '../SimpleChart';
import CellContextMenu from './CellContextMenu';
import { TableWrapper } from './SimpleTable.styles';

type ValidTableProps = {
    resultsData: ApiQueryResults | undefined;
    pivotDimensions: string[] | undefined;
    isColumnVisible: (fieldId: string) => boolean;
    columns: any[];
    columnOrder: string[];
    showColumnCalculation: boolean;
};

const ValidTable: FC<ValidTableProps> = ({
    resultsData,
    pivotDimensions,
    isColumnVisible,
    columns,
    columnOrder,
    showColumnCalculation,
}) => {
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

        resultsData
            ? resultsData.metricQuery.dimensions.filter(
                  (itemId) =>
                      isColumnVisible(itemId) &&
                      !pivotDimensions?.includes(itemId),
              )
            : undefined,
    );
    const pivotDimension = pivotDimensions?.[0];
    return (
        <TableWrapper>
            <Table
                status={'success'}
                data={pivotDimension ? plotData : resultsData?.rows || []}
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
const SimpleTable: FC = () => {
    const {
        resultsData,
        isLoading,
        columnOrder,
        tableConfig: {
            exceedsMaxPivotValues,
            columns,
            showColumnCalculation,
            isColumnVisible,
        },
        pivotDimensions,
    } = useVisualizationContext();

    if (isLoading) return <LoadingChart />;

    if (exceedsMaxPivotValues) {
        return (
            <NonIdealState
                title="No data available"
                description="Exceeded max amount of 20 pivot values"
                icon="error"
            />
        );
    }

    return (
        <ValidTable
            resultsData={resultsData}
            columns={columns}
            columnOrder={columnOrder}
            isColumnVisible={isColumnVisible}
            showColumnCalculation={showColumnCalculation}
            pivotDimensions={pivotDimensions}
        />
    );
};

export default SimpleTable;
