import { HTMLTable, NonIdealState } from '@blueprintjs/core';
import { getResultValues, isNumericItem } from '@lightdash/common';
import React, { FC } from 'react';
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
        tableConfig: { itemMap, filterVisible, getHeader },
    } = useVisualizationContext();
    const tableItems = resultsData?.rows
        ? getResultValues(resultsData?.rows).slice(0, 25)
        : [];

    const validData = tableItems;
    if (isLoading) return <LoadingChart />;

    return (
        <>
            {validData ? (
                <TableWrapper className="cohere-block">
                    <TableInnerWrapper>
                        <HTMLTable style={{ width: '100%' }} bordered condensed>
                            <TableHeader>
                                <tr>
                                    {columnOrder
                                        .filter(filterVisible)
                                        .map((fieldId: string) => (
                                            <th>{getHeader(fieldId)}</th>
                                        ))}
                                </tr>
                            </TableHeader>
                            <tbody>
                                {tableItems.map((row, i: number) => (
                                    <TableRow i={i}>
                                        {columnOrder
                                            .filter(filterVisible)
                                            .map((fieldId) => (
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
