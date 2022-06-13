import {
    Button,
    ButtonGroup,
    Colors,
    HTMLTable,
    Icon,
    Tag,
} from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import { DimensionType, hexToRGB, isNumericItem } from '@lightdash/common';
import React, { FC, ReactNode, useEffect } from 'react';
import {
    DragDropContext,
    Draggable,
    DraggableProvided,
    DraggableProvidedDraggableProps,
    DraggableStateSnapshot,
    Droppable,
} from 'react-beautiful-dnd';
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
import {
    Container,
    PageCount,
    PaginationWrapper,
    RowNumber,
    RowNumberColumn,
    RowNumberHeader,
    RowTotalFooter,
    TableCell,
    TableContainer,
    TableFooter,
    TableInnerContainer,
    TableOuterContainer,
} from './ResultsTable.styles';
import { EmptyState, IdleState, LoadingState } from './States';

const getSortIndicator = (
    type: ColumnInstance['type'],
    dimensionType: DimensionType,
    desc: boolean,
    sortIndex: number,
    isMultiSort: boolean,
) => {
    const style = { marginLeft: '5px' };

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
            }}
        >
            {isMultiSort && (
                <Tag minimal style={style}>
                    {sortIndex + 1}
                </Tag>
            )}
            {desc ? (
                <Icon
                    style={style}
                    icon={
                        type === 'dimension' && dimensionType === 'string'
                            ? 'sort-alphabetical-desc'
                            : 'sort-numerical-desc'
                    }
                />
            ) : (
                <Icon
                    style={style}
                    icon={
                        type === 'dimension' && dimensionType === 'string'
                            ? 'sort-alphabetical'
                            : 'sort-numerical'
                    }
                />
            )}
        </div>
    );
};

const ColumnColors = {
    rowNumber: Colors.WHITE,
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
        <div
            style={{
                display: 'flex',
                justifyContent: 'space-between',
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
    </div>
);

const DEFAULT_PAGE_SIZE = 25;

type Props = {
    isEditMode: boolean;
    loading: boolean;
    idle: boolean;
    data: any;
    dataColumns: any;
    dataColumnOrder: string[];
    onColumnOrderChange?: (order: string[]) => void;
    idleState?: ReactNode;
    loadingState?: ReactNode;
    emptyState?: ReactNode;
    tableAction?: ReactNode;
    headerContextMenu?: FC<{ column: any }>;
    cellContextMenu?: FC<{ cell: any }>;
};

export const ResultsTable: FC<Props> = ({
    isEditMode,
    loading,
    idle,
    dataColumns,
    dataColumnOrder,
    data,
    onColumnOrderChange,
    idleState,
    loadingState,
    emptyState,
    headerContextMenu,
    cellContextMenu,
}) => {
    const HeaderContextMenu = headerContextMenu || React.Fragment;
    const CellContextMenu = cellContextMenu || React.Fragment;
    const currentColOrder = React.useRef<Array<string>>([]);
    const {
        getTableProps,
        getTableBodyProps,
        headerGroups,
        footerGroups,
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
        setPageSize,
        state: { pageSize },
    } = useReactTable(
        {
            columns: dataColumns,
            data,
            initialState: {
                pageIndex: 0,
                pageSize: DEFAULT_PAGE_SIZE,
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
            <Container className="cohere-block">
                <TableOuterContainer>
                    <TableInnerContainer>
                        <TableContainer>
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
                                        <RowNumberColumn />
                                        {headerGroup.headers.map((column) => (
                                            <>
                                                <col
                                                    {...column.getHeaderProps([
                                                        getColumnStyle(
                                                            column.type,
                                                        ),
                                                    ])}
                                                />
                                            </>
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
                                                        <RowNumberHeader>
                                                            #
                                                        </RowNumberHeader>
                                                        {headerGroup.headers.map(
                                                            (column, index) => (
                                                                <th
                                                                    {...column.getHeaderProps(
                                                                        isEditMode &&
                                                                            column.getSortByToggleProps
                                                                            ? [
                                                                                  column.getSortByToggleProps(),
                                                                              ]
                                                                            : [],
                                                                    )}
                                                                >
                                                                    <Tooltip2
                                                                        fill
                                                                        content={
                                                                            column.description
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
                                                                            isDragDisabled={
                                                                                !isEditMode
                                                                            }
                                                                        >
                                                                            {(
                                                                                provided,
                                                                                snapshot,
                                                                            ) => (
                                                                                <HeaderContextMenu
                                                                                    column={
                                                                                        column
                                                                                    }
                                                                                >
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
                                                                                </HeaderContextMenu>
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
                                                <RowNumber>
                                                    {row.index + 1}
                                                </RowNumber>
                                                {row.cells.map((cell) => {
                                                    return (
                                                        <TableCell
                                                            {...cell.getCellProps(
                                                                [
                                                                    getRowStyle(
                                                                        row.index,
                                                                    ),
                                                                ],
                                                            )}
                                                            isNaN={
                                                                !isNumericItem(
                                                                    cell.column
                                                                        ?.field ||
                                                                        cell
                                                                            .column
                                                                            ?.tableCalculation,
                                                                )
                                                            }
                                                        >
                                                            <CellContextMenu
                                                                cell={cell}
                                                            >
                                                                {cell.render(
                                                                    'Cell',
                                                                )}
                                                            </CellContextMenu>
                                                        </TableCell>
                                                    );
                                                })}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    {rows.length > 0 &&
                                        footerGroups.map((group) => (
                                            <tr
                                                {...group.getFooterGroupProps()}
                                                style={{ background: 'white' }}
                                            >
                                                <RowTotalFooter>
                                                    Total
                                                </RowTotalFooter>
                                                {group.headers.map((column) => (
                                                    <TableCell
                                                        {...column.getFooterProps()}
                                                        isNaN={
                                                            !isNumericItem(
                                                                column?.field ||
                                                                    column?.tableCalculation,
                                                            )
                                                        }
                                                    >
                                                        {column.render(
                                                            'Footer',
                                                        )}
                                                    </TableCell>
                                                ))}
                                            </tr>
                                        ))}
                                </tfoot>
                            </HTMLTable>
                        </TableContainer>
                    </TableInnerContainer>
                    {loading && loadingState}
                    {idle && idleState}
                    {!loading && !idle && rows.length === 0 && emptyState}
                </TableOuterContainer>
                <TableFooter>
                    <ButtonGroup>
                        {rows.length > DEFAULT_PAGE_SIZE && (
                            <>
                                <Button
                                    active={pageSize !== DEFAULT_PAGE_SIZE}
                                    text="Scroll"
                                    onClick={() => setPageSize(rows.length)}
                                />
                                <Button
                                    active={pageSize === DEFAULT_PAGE_SIZE}
                                    text="Pages"
                                    onClick={() =>
                                        setPageSize(DEFAULT_PAGE_SIZE)
                                    }
                                />
                            </>
                        )}
                    </ButtonGroup>
                    {pageCount > 1 ? (
                        <PaginationWrapper>
                            <PageCount>
                                <b>{parseInt(page[0].id, 10) + 1}</b> -{' '}
                                <b>
                                    {parseInt(page[page.length - 1].id, 10) + 1}
                                </b>{' '}
                                of <b>{rows.length} results</b>
                            </PageCount>
                            <Button
                                style={{ marginLeft: 20 }}
                                icon="arrow-left"
                                onClick={previousPage}
                                disabled={!canPreviousPage}
                            />
                            <Button
                                style={{ marginLeft: 10 }}
                                icon="arrow-right"
                                onClick={nextPage}
                                disabled={!canNextPage}
                            />
                        </PaginationWrapper>
                    ) : (
                        <PageCount>
                            <b>{rows.length} results</b>
                        </PageCount>
                    )}
                </TableFooter>
            </Container>
        </TrackSection>
    );
};

ResultsTable.defaultProps = {
    idleState: <IdleState />,
    loadingState: <LoadingState />,
    emptyState: <EmptyState />,
    tableAction: undefined,
};
