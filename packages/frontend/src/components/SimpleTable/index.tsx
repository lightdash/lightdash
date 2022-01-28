import { Button, Colors, HTMLTable } from '@blueprintjs/core';
import { friendlyName } from 'common';
import React, { FC, useEffect, useState } from 'react';
import { TrackSection } from '../../providers/TrackingProvider';
import { SectionName } from '../../types/Events';
import { TableHeader, TableInnerWrapper, TableWrapper } from './SimpleTable';

interface Props {
    data: any;
}
const SimpleTable: FC<Props> = ({ data }) => {
    const [paginatedData, setPaginatedData] = useState(data.slice(0, 25));

    const [currentPage, setCurrentPage] = useState<number>(0);
    const pageCount = Math.ceil(data?.length / 25);

    const canNextPage =
        currentPage + 1 < pageCount && currentPage + 1 !== pageCount;
    const canPrevPage = currentPage > 0;

    const headerGroup = paginatedData.map((item: {}) => Object.keys(item))[0];
    const tableRows = paginatedData.map((row: {}) => Object.values(row));

    const modifiedItem = (item: string | boolean) => {
        if (typeof item === 'boolean') {
            return item ? 'Yes' : 'No';
        }
        return item;
    };

    useEffect(() => {
        setPaginatedData(data.slice(currentPage * 25, currentPage * 25 + 25));
    }, [currentPage]);

    return (
        <TrackSection name={SectionName.RESULTS_TABLE}>
            <TableWrapper className="cohere-block">
                <TableInnerWrapper>
                    <HTMLTable style={{ width: '100%' }} bordered condensed>
                        <TableHeader>
                            <tr>
                                {headerGroup.map((header: string) => (
                                    <th>{friendlyName(header)}</th>
                                ))}
                            </tr>
                        </TableHeader>

                        <tbody>
                            {tableRows.map((row: [], i: number) => (
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

                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        paddingTop: '10px',
                    }}
                >
                    {pageCount > 1 && (
                        <div
                            style={{
                                display: 'flex',
                                flexDirection: 'row',
                                justifyContent: 'flex-end',
                                alignItems: 'center',
                            }}
                        >
                            {canPrevPage && (
                                <Button
                                    icon="arrow-left"
                                    onClick={() => {
                                        setCurrentPage(currentPage - 1);
                                    }}
                                />
                            )}
                            <span
                                style={{
                                    paddingRight: '5px',
                                    paddingLeft: '5px',
                                }}
                            >
                                Page {currentPage + 1} of {pageCount}
                            </span>
                            {canNextPage && (
                                <Button
                                    icon="arrow-right"
                                    onClick={() =>
                                        setCurrentPage(currentPage + 1)
                                    }
                                />
                            )}
                        </div>
                    )}
                </div>
            </TableWrapper>
        </TrackSection>
    );
};

export default SimpleTable;
