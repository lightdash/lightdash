import { Button, Colors, HTMLTable, Icon, Tag } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import { DimensionType, friendlyName, hexToRGB } from 'common';
import React, { FC, ReactNode, useEffect } from 'react';
import {
    DragDropContext,
    Draggable,
    DraggableProvided,
    DraggableProvidedDraggableProps,
    DraggableStateSnapshot,
    Droppable,
} from 'react-beautiful-dnd';
import { CSVLink } from 'react-csv';
import {
    ColumnInstance,
    HeaderGroup,
    useColumnOrder,
    usePagination,
    useTable as useReactTable,
} from 'react-table';
import { TrackSection } from '../../providers/TrackingProvider';
import { SectionName } from '../../types/Events';
import TableCalculationHeaderButton from '../TableCalculationHeaderButton';
import { EmptyState, IdleState, LoadingState } from './States';

const getSortIndicator = (
    type: ColumnInstance['type'],
    dimensionType: DimensionType,
    desc: boolean,
    sortIndex: number,
    isMultiSort: boolean,
) => {
    const style = { paddingLeft: '5px' };
    if (type === 'dimension' && dimensionType === 'string')
        return (
            <>
                {isMultiSort && (
                    <Tag minimal style={style}>
                        {sortIndex + 1}
                    </Tag>
                )}
                {desc ? (
                    <Icon style={style} icon="sort-alphabetical-desc" />
                ) : (
                    <Icon style={style} icon="sort-alphabetical" />
                )}
            </>
        );
    return (
        <>
            {isMultiSort && (
                <Tag minimal style={style}>
                    {sortIndex + 1}
                </Tag>
            )}
            {desc ? (
                <Icon style={style} icon="sort-numerical-desc" />
            ) : (
                <Icon style={style} icon="sort-numerical" />
            )}
        </>
    );
};

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

const getItemStyle = (
    { isDragging, isDropAnimating }: DraggableStateSnapshot,
    draggableStyle: DraggableProvidedDraggableProps['style'],
): object => ({
    ...draggableStyle,
    userSelect: 'none',
    ...(!isDragging && { transform: 'translate(0,0)' }),
    ...(isDropAnimating && { transitionDuration: '0.001s' }),
});

interface ItemProps {
    index?: number;
    column?: HeaderGroup;
    provided: DraggableProvided;
    snapshot: DraggableStateSnapshot;
}

const Item: FC<ItemProps> = ({
    index,
    column,
    provided: { draggableProps, innerRef, dragHandleProps },
    snapshot,
}) => (
    <div
        {...draggableProps}
        {...dragHandleProps}
        ref={innerRef}
        style={{
            ...getItemStyle(snapshot, draggableProps.style),
        }}
    >
        {column?.render('Header')}
        {column?.isSorted &&
            getSortIndicator(
                column.type,
                column.dimensionType,
                column.isSortedDesc || false,
                column.sortedIndex,
                column.isMultiSort,
            )}
        {column?.tableCalculation && (
            <TableCalculationHeaderButton
                tableCalculation={{ ...column.tableCalculation, index }}
            />
        )}
    </div>
);

type Props = {
    loading: boolean;
    idle: boolean;
    name?: string;
    data: any;
    dataColumns: any;
    dataColumnOrder: string[];
    onColumnOrderChange?: (order: string[]) => void;
    idleState?: ReactNode;
    loadingState?: ReactNode;
    emptyState?: ReactNode;
    tableAction?: ReactNode;
};

export const ResultsTable: FC<Props> = ({
    loading,
    idle,
    dataColumns,
    dataColumnOrder,
    data,
    onColumnOrderChange,
    name,
    idleState,
    loadingState,
    emptyState,
    tableAction,
}) => {
    const currentColOrder = React.useRef<Array<string>>([]);
    const {
        getTableProps,
        getTableBodyProps,
        headerGroups,
        page,
        rows,
        prepareRow,
        allColumns,
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
            <div
                className="cohere-block"
                style={{
                    height: '100%',
                    padding: '10px',
                    minHeight: 300,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                }}
            >
                <div
                    style={{
                        display: 'block',
                        maxWidth: '100%',
                    }}
                >
                    <div
                        style={{
                            display: 'flex',
                            maxWidth: '100%',
                            flexDirection: 'row',
                        }}
                    >
                        <div style={{ flex: 1, overflowX: 'auto' }}>
                            <HTMLTable
                                style={{ width: '100%' }}
                                bordered
                                condensed
                                {...getTableProps()}
                            >
                                {headerGroups.map((headerGroup) => (
                                    <colgroup
                                        key={`headerGroup_${headerGroup.id}`}
                                    >
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
                                        <DragDropContext
                                            key={`DragDropContext_${headerGroup.id}`}
                                            onDragStart={() => {
                                                currentColOrder.current =
                                                    allColumns.map(
                                                        (o: any) => o.id,
                                                    );
                                            }}
                                            onDragUpdate={(dragUpdateObj) => {
                                                const colOrder = [
                                                    ...currentColOrder.current,
                                                ];
                                                const sIndex =
                                                    dragUpdateObj.source.index;
                                                const dIndex =
                                                    dragUpdateObj.destination &&
                                                    dragUpdateObj.destination
                                                        .index;

                                                if (
                                                    typeof dIndex === 'number'
                                                ) {
                                                    colOrder.splice(sIndex, 1);
                                                    colOrder.splice(
                                                        dIndex,
                                                        0,
                                                        dragUpdateObj.draggableId,
                                                    );
                                                    onColumnOrderChange?.(
                                                        colOrder,
                                                    );
                                                }
                                            }}
                                            onDragEnd={() => undefined}
                                        >
                                            <Droppable
                                                droppableId="droppable"
                                                direction="horizontal"
                                                renderClone={(
                                                    provided,
                                                    snapshot,
                                                    rubric,
                                                ) => {
                                                    const column =
                                                        headerGroup.headers.find(
                                                            ({ id }) =>
                                                                id ===
                                                                rubric.draggableId,
                                                        );
                                                    return (
                                                        <Item
                                                            column={column}
                                                            provided={provided}
                                                            snapshot={snapshot}
                                                        />
                                                    );
                                                }}
                                            >
                                                {(droppableProvided) => (
                                                    <tr
                                                        ref={
                                                            droppableProvided.innerRef
                                                        }
                                                        {...headerGroup.getHeaderGroupProps()}
                                                        {...droppableProvided.droppableProps}
                                                    >
                                                        {headerGroup.headers.map(
                                                            (column, index) => (
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
                                                                        content={
                                                                            column.description
                                                                                ? column.description
                                                                                : friendlyName(
                                                                                      column.id,
                                                                                  )
                                                                        }
                                                                    >
                                                                        <Draggable
                                                                            key={
                                                                                column.id
                                                                            }
                                                                            draggableId={
                                                                                column.id
                                                                            }
                                                                            index={
                                                                                index
                                                                            }
                                                                        >
                                                                            {(
                                                                                provided,
                                                                                snapshot,
                                                                            ) => (
                                                                                <Item
                                                                                    index={
                                                                                        index
                                                                                    }
                                                                                    column={
                                                                                        column
                                                                                    }
                                                                                    provided={
                                                                                        provided
                                                                                    }
                                                                                    snapshot={
                                                                                        snapshot
                                                                                    }
                                                                                />
                                                                            )}
                                                                        </Draggable>
                                                                    </Tooltip2>
                                                                </th>
                                                            ),
                                                        )}
                                                    </tr>
                                                )}
                                            </Droppable>
                                        </DragDropContext>
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
                                                            getRowStyle(
                                                                row.index,
                                                            ),
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
                        </div>
                        {tableAction && (
                            <div
                                style={{
                                    display: 'flex',
                                    backgroundColor: hexToRGB(
                                        Colors.GRAY4,
                                        0.2,
                                    ),
                                    boxShadow:
                                        'inset 1px 0 0 0 rgb(16 22 26 / 15%)',
                                }}
                            >
                                {tableAction}
                            </div>
                        )}
                    </div>
                    {loading && loadingState}
                    {idle && idleState}
                    {!loading && !idle && rows.length === 0 && emptyState}
                </div>
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        paddingTop: '10px',
                    }}
                >
                    <div>
                        {rows.length > 0 ? (
                            <CSVLink
                                role="button"
                                tabIndex={0}
                                className="bp3-button"
                                data={rows.map((row) => row.values)}
                                filename={`lightdash-${
                                    name || 'export'
                                }-${new Date().toISOString().slice(0, 10)}.csv`}
                                target="_blank"
                            >
                                <Icon icon="export" />
                                <span>Export CSV</span>
                            </CSVLink>
                        ) : null}
                    </div>
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
            </div>
        </TrackSection>
    );
};

ResultsTable.defaultProps = {
    idleState: <IdleState />,
    loadingState: <LoadingState />,
    emptyState: <EmptyState />,
    tableAction: undefined,
};
