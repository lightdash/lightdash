import { HTMLTable, NonIdealState } from '@blueprintjs/core';
import {
    AdditionalMetric,
    Field,
    friendlyName,
    getAdditionalMetricLabel,
    getItemLabel,
    getItemMap,
    getResultValues,
    isAdditionalMetric,
    isField,
    isNumericItem,
    TableCalculation,
} from '@lightdash/common';
import React, { FC, useMemo } from 'react';
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
        columnOrder,
        explore,
        tableConfig: { showTableNames },
    } = useVisualizationContext();
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

    const headers = columnOrder.map((fieldId) => {
        const field = itemMap && itemMap[fieldId];
        if (isAdditionalMetric(field)) {
            // AdditionalMetric
            return getAdditionalMetricLabel(field);
        } else if (isField(field)) {
            // Field

            return showTableNames ? getItemLabel(field) : field.label;
        } else {
            //TableCalculation
            return friendlyName(fieldId);
        }
    });

    const validData = tableItems && headers;
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
                                {tableItems.map((row, i: number) => (
                                    <TableRow i={i}>
                                        {columnOrder.map((fieldId) => (
                                            <TableCell
                                                key={fieldId}
                                                isNaN={
                                                    !isNumericItem(
                                                        itemMap[fieldId],
                                                    )
                                                }
                                            >
                                                {row[fieldId] || '-'}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                ))}
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
