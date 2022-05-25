import { HTMLTable, NonIdealState } from '@blueprintjs/core';
import {
    AdditionalMetric,
    Field,
    findFieldByIdInExplore,
    friendlyName,
    getItemMap,
    getResultValues,
    isNumericItem,
    TableCalculation,
} from '@lightdash/common';
import React, { FC, useMemo } from 'react';
import { mapDataToTable } from '../../utils/tableData';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import { LoadingChart } from '../SimpleChart';
import {
    TableCell,
    TableHeader,
    TableInnerWrapper,
    TableRow,
    TableWrapper,
} from './SimpleTable.styles';

const SimpleTable: FC = () => {
    const { resultsData, isLoading, columnOrder, explore } =
        useVisualizationContext();
    const tableItems = resultsData?.rows
        ? getResultValues(resultsData?.rows).slice(0, 25)
        : [];

    const itemMap = useMemo<
        Record<string, Field | AdditionalMetric | TableCalculation>
    >(() => {
        if (explore && resultsData) {
            return getItemMap(
                explore,
                resultsData.metricQuery.additionalMetrics,
                resultsData.metricQuery.tableCalculations,
            );
        }
        return {};
    }, [explore, resultsData]);
    const rows = mapDataToTable(tableItems, columnOrder);
    const headers = columnOrder.map((fieldId) => {
        const field =
            explore && fieldId
                ? findFieldByIdInExplore(explore, fieldId)
                : undefined;

        return field
            ? `${field.tableLabel} ${field.label}`
            : friendlyName(fieldId);
    });

    const validData = rows && headers;
    if (isLoading) return <LoadingChart />;

    return (
        <>
            {validData ? (
                <TableWrapper className="cohere-block">
                    <TableInnerWrapper>
                        <HTMLTable style={{ width: '100%' }} bordered condensed>
                            <TableHeader>
                                <tr>
                                    {headers.map((header: string) => (
                                        <th>{header}</th>
                                    ))}
                                </tr>
                            </TableHeader>
                            <tbody>
                                {rows.map(
                                    (row: string[] | boolean[], i: number) => (
                                        <TableRow i={i}>
                                            {row.map(
                                                (
                                                    item: string | boolean,
                                                    index,
                                                ) => (
                                                    <TableCell
                                                        isNaN={
                                                            !isNumericItem(
                                                                itemMap[
                                                                    headers[
                                                                        index
                                                                    ]
                                                                ],
                                                            )
                                                        }
                                                    >
                                                        {item || '-'}
                                                    </TableCell>
                                                ),
                                            )}
                                        </TableRow>
                                    ),
                                )}
                            </tbody>
                        </HTMLTable>
                    </TableInnerWrapper>
                </TableWrapper>
            ) : (
                <div style={{ padding: '50px 0' }}>
                    <NonIdealState
                        title="No data available"
                        description="Query metrics and dimensions with results."
                        icon="chart"
                    />
                </div>
            )}
        </>
    );
};

export default SimpleTable;
