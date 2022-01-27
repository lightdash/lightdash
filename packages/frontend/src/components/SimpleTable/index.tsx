import { Button, Colors, HTMLTable } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import { hexToRGB } from 'common';
import React, { FC, useEffect, useMemo } from 'react';
import {
    ColumnInstance,
    useColumnOrder,
    usePagination,
    useTable as useReactTable,
} from 'react-table';
import { useColumns } from '../../hooks/useColumns';
import { useQueryResults } from '../../hooks/useQueryResults';
import { useExplorer } from '../../providers/ExplorerProvider';
import { TrackSection } from '../../providers/TrackingProvider';
import { SectionName } from '../../types/Events';
import { TableInnerWrapper, TableWrapper } from './SimpleTable';

const ColumnColors = {
    dimension: hexToRGB(Colors.BLUE1, 0.2),
    metric: hexToRGB(Colors.ORANGE1, 0.2),
    table_calculation: hexToRGB(Colors.GREEN1, 0.2),
};

const getColumnStyle = (type: ColumnInstance['type']) => ({
    style: {
        backgroundColor: ColumnColors[type],
    },
});

const getRowStyle = (rowIndex: number) => ({
    style: {
        backgroundColor: rowIndex % 2 ? undefined : Colors.LIGHT_GRAY4,
    },
});

const SimpleTable: FC = () => {
    const dataColumns = useColumns();
    const queryResults = useQueryResults();
    const data = useMemo(
        () => (queryResults.status === 'success' ? queryResults.data.rows : []),
        [queryResults.status, queryResults.data],
    );

    const {
        state: { columnOrder: dataColumnOrder },
    } = useExplorer();

    const {
        getTableProps,
        getTableBodyProps,
        headerGroups,
        page,
        prepareRow,
        setColumnOrder,
        pageCount,
        nextPage,
        canNextPage,
        previousPage,
        canPreviousPage,
        state: { pageIndex },
    } = useReactTable(
        {
            columns: dataColumns,
            data,
            initialState: {
                pageIndex: 0,
                pageSize: 25,
                columnOrder: dataColumnOrder,
            },
        },
        usePagination,
        useColumnOrder,
    );

    useEffect(() => {
        setColumnOrder(dataColumnOrder);
    }, [setColumnOrder, dataColumnOrder]);

    return (
        <TrackSection name={SectionName.RESULTS_TABLE}>
            <TableWrapper className="cohere-block">
                <TableInnerWrapper>
                    <HTMLTable
                        style={{ width: '100%' }}
                        bordered
                        condensed
                        {...getTableProps()}
                    >
                        {headerGroups.map((headerGroup) => (
                            <colgroup key={`headerGroup_${headerGroup.id}`}>
                                {headerGroup.headers.map((column) => (
                                    <col
                                        {...column.getHeaderProps([
                                            getColumnStyle(column.type),
                                        ])}
                                    />
                                ))}
                            </colgroup>
                        ))}
                        <thead>
                            {headerGroups.map((headerGroup) => (
                                <tr {...headerGroup.getHeaderGroupProps()}>
                                    {headerGroup.headers.map((column) => (
                                        <th
                                            {...column.getHeaderProps(
                                                column.getSortByToggleProps
                                                    ? [
                                                          column.getSortByToggleProps(),
                                                      ]
                                                    : [],
                                            )}
                                        >
                                            <Tooltip2
                                                content={column.description}
                                            >
                                                <div>
                                                    {column?.render('Header')}
                                                </div>
                                            </Tooltip2>
                                        </th>
                                    ))}
                                </tr>
                            ))}
                        </thead>

                        <tbody {...getTableBodyProps()}>
                            {page.map((row) => {
                                prepareRow(row);
                                return (
                                    <tr {...row.getRowProps()}>
                                        {row.cells.map((cell) => (
                                            <td
                                                {...cell.getCellProps([
                                                    getRowStyle(row.index),
                                                ])}
                                            >
                                                {cell.render('Cell')}
                                            </td>
                                        ))}
                                    </tr>
                                );
                            })}
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
                            {canPreviousPage && (
                                <Button
                                    icon="arrow-left"
                                    onClick={previousPage}
                                />
                            )}
                            <span
                                style={{
                                    paddingRight: '5px',
                                    paddingLeft: '5px',
                                }}
                            >
                                Page {pageIndex + 1} of {pageCount}
                            </span>
                            {canNextPage && (
                                <Button icon="arrow-right" onClick={nextPage} />
                            )}
                        </div>
                    )}
                </div>
            </TableWrapper>
        </TrackSection>
    );
};

export default SimpleTable;
