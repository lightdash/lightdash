import { Colors, HTMLTable, NonIdealState } from '@blueprintjs/core';
import { friendlyName } from 'common';
import React, { FC } from 'react';
import { mapDataToTable, modifiedItem } from '../../utils/tableData';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import { LoadingChart } from '../SimpleChart';
import {
    TableHeader,
    TableInnerWrapper,
    TableWrapper,
} from './SimpleTable.styles';

const SimpleTable: FC = () => {
    const { plotData, isLoading } = useVisualizationContext();
    const tableItems = plotData ? plotData.slice(0, 25) : [];

    const { headers, rows } = mapDataToTable(tableItems);
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
                                        <tr
                                            style={{
                                                backgroundColor: `${
                                                    i % 2
                                                        ? Colors.LIGHT_GRAY5
                                                        : Colors.LIGHT_GRAY4
                                                }`,
                                            }}
                                        >
                                            {row.map(
                                                (item: string | boolean) => (
                                                    <td>
                                                        {modifiedItem(item)}
                                                    </td>
                                                ),
                                            )}
                                        </tr>
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
