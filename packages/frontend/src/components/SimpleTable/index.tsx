import { HTMLTable, NonIdealState } from '@blueprintjs/core';
import {
    Field,
    fieldId,
    friendlyName,
    getFields,
    getItemId,
    getResultValues,
    isAdditionalMetric,
    isNumericItem,
    TableCalculation,
} from 'common';
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
    const {
        resultsData,
        isLoading,
        columnOrder: headers,
        explore,
    } = useVisualizationContext();
    const tableItems = resultsData?.rows
        ? getResultValues(resultsData?.rows).slice(0, 25)
        : [];

    const itemMap = useMemo<Record<string, Field | TableCalculation>>(() => {
        if (explore && resultsData) {
            return [
                ...getFields(explore),
                ...(resultsData.metricQuery.additionalMetrics || []),
                ...resultsData.metricQuery.tableCalculations,
            ].reduce(
                (acc, item) => ({
                    ...acc,
                    [isAdditionalMetric(item)
                        ? fieldId(item)
                        : getItemId(item)]: item,
                }),
                {},
            );
        }
        return {};
    }, [explore, resultsData]);

    const rows = mapDataToTable(tableItems, headers);
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
                                        <th>{friendlyName(header)}</th>
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
