import { Button, Colors, HTMLTable } from '@blueprintjs/core';
import { friendlyName } from 'common';
import React, { FC } from 'react';
import { TrackSection } from '../../providers/TrackingProvider';
import { SectionName } from '../../types/Events';
import { LoadingState } from '../ResultsTable/States';
import { TableHeader, TableInnerWrapper, TableWrapper } from './SimpleTable';

interface Props {
    data: any;
    isLoading: boolean;
}
const SimpleTable: FC<Props> = ({ data, isLoading }) => {
    if (isLoading && !data) {
        return <LoadingState />;
    }
    const modifiedItem = (item: string | boolean) => {
        if (typeof item === 'boolean') {
            return item ? 'Yes' : 'No';
        }
        return item;
    };

    let currentPage = 0;
    const pageCount = Math.round((data?.length + 1) / 25);
    const canNextPage = currentPage < pageCount;
    let paginatedData = data?.slice(0, 25);

    const paginateNext = () => {
        currentPage += 1;
        paginatedData = data?.slice(currentPage * 25, currentPage * 25 + 25);
    };

    const headerGroup = paginatedData.map((item: {}) => Object.keys(item))[0];

    const tableRows = paginatedData.map((row: {}) => Object.values(row));

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
                            {/* {canPreviousPage && (
                                <Button
                                    icon="arrow-left"
                                    onClick={previousPage}
                                />
                            )} */}
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
                                    onClick={paginateNext}
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
