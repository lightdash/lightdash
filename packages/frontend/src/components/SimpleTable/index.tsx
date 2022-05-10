import { HTMLTable, NonIdealState } from '@blueprintjs/core';
import { friendlyName, getResultValues } from 'common';
import React, { FC } from 'react';
import { mapDataToTable, modifiedItem } from '../../utils/tableData';
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
    } = useVisualizationContext();
    const tableItems = resultsData?.rows
        ? getResultValues(resultsData?.rows).slice(0, 25)
        : [];

    const rows = mapDataToTable(tableItems, headers);
    const validData = rows && headers;

    const isNaN = (number: string | boolean) => {
        return (
            typeof number === 'boolean' ||
            (number?.includes && number.includes('Z')) ||
            Number.isNaN(Number(number))
        );
    };

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
                                                (item: string | boolean) => (
                                                    <TableCell
                                                        isNaN={isNaN(item)}
                                                    >
                                                        {modifiedItem(item)}
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
