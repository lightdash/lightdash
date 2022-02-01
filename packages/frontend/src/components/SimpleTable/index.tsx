import { Colors, HTMLTable } from '@blueprintjs/core';
import { friendlyName } from 'common';
import React, { FC } from 'react';
import { mapDataToTable, modifiedItem } from '../../utils/tableData';
import {
    TableHeader,
    TableInnerWrapper,
    TableWrapper,
} from './SimpleTable.styles';

interface Props {
    data: Record<string, any>[];
}
const SimpleTable: FC<Props> = ({ data }) => {
    if (!data) return null;
    const tableItems = data.slice(0, 25);
    const { headers, rows } = mapDataToTable(tableItems);

    return (
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
                        {rows.map((row: string[] | boolean[], i: number) => (
                            <tr
                                style={{
                                    backgroundColor: `${
                                        i % 2
                                            ? Colors.LIGHT_GRAY5
                                            : Colors.LIGHT_GRAY4
                                    }`,
                                }}
                            >
                                {row.map((item: string | boolean) => (
                                    <td>{modifiedItem(item)}</td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </HTMLTable>
            </TableInnerWrapper>
        </TableWrapper>
    );
};

export default SimpleTable;
