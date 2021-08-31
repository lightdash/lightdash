import {
    ColumnInstance,
    HeaderGroup,
    useColumnOrder,
    usePagination,
    useTable as useReactTable,
} from 'react-table';
import {
    Button,
    Colors,
    HTMLTable,
    Icon,
    NonIdealState,
    Spinner,
    Tag,
} from '@blueprintjs/core';
import {
    DragDropContext,
    Draggable,
    DraggableProvided,
    DraggableProvidedDraggableProps,
    DraggableStateSnapshot,
    Droppable,
} from 'react-beautiful-dnd';
import { ApiError, ApiQueryResults, DimensionType } from 'common';
import React, { FC, useEffect } from 'react';
import { CSVLink } from 'react-csv';
import { UseQueryResult } from 'react-query';
import { useColumns } from '../hooks/useColumns';
import { useTable } from '../hooks/useTable';
import { RefreshButton } from './RefreshButton';
import { useExplorer } from '../providers/ExplorerProvider';
import { Section } from '../providers/TrackingProvider';
import { SectionName } from '../types/Events';
import TableCalculationHeaderButton from './TableCalculationHeaderButton';
import AddColumnButton from './AddColumnButton';
import { useQueryResults } from '../hooks/useQueryResults';

const hexToRGB = (hex: string, alpha: number) => {
    // eslint-disable-next-line radix
    const h = parseInt(`0x${hex.substring(1)}`);
    // eslint-disable-next-line no-bitwise
    const r = (h >> 16) & 0xff;
    // eslint-disable-next-line no-bitwise
    const g = (h >> 8) & 0xff;
    // eslint-disable-next-line no-bitwise
    const b = h & 0xff;
    return `rgb(${r}, ${g}, ${b}, ${alpha})`;
};

const EmptyStateNoColumns = () => (
    <div style={{ padding: '50px 0' }}>
        <NonIdealState
            title="Select fields to explore"
            description="Get started by selecting metrics and dimensions."
            icon="hand-left"
        />
    </div>
);

const EmptyStateNoTableData = () => (
    <Section name={SectionName.EMPTY_RESULTS_TABLE}>
        <div style={{ padding: '50px 0' }}>
            <NonIdealState
                description="Click run query to see your results"
                action={<RefreshButton />}
            />
        </div>
    </Section>
);

const EmptyStateExploreLoading = () => (
    <NonIdealState title="Loading tables" icon={<Spinner />} />
);

const EmptyStateNoRows = () => (
    <NonIdealState
        title="Query returned no results"
        description="This query ran successfully but returned no results"
    />
);

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
    column?: HeaderGroup;
    provided: DraggableProvided;
    snapshot: DraggableStateSnapshot;
}

const Item: FC<ItemProps> = ({
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
                tableCalculation={column.tableCalculation}
            />
        )}
    </div>
);

export const ResultsTable = () => {
    const dataColumns = useColumns();
    const queryResults = useQueryResults();
    const {
        state: { tableName: activeTableName, columnOrder: explorerColumnOrder },
        actions: { setColumnOrder: setExplorerColumnOrder },
    } = useExplorer();
    const activeExplore = useTable();
    const safeData = React.useMemo(
        () => (queryResults.status === 'success' ? queryResults.data.rows : []),
        [queryResults.status, queryResults.data],
    );
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
        columns,
        pageCount,
        nextPage,
        canNextPage,
        previousPage,
        canPreviousPage,
        state: { pageIndex },
    } = useReactTable(
        {
            columns: dataColumns,
            data: safeData,
            initialState: {
                pageIndex: 0,
                pageSize: 25,
                columnOrder: explorerColumnOrder,
            },
        },
        usePagination,
        useColumnOrder,
    );

    useEffect(() => {
        setColumnOrder(explorerColumnOrder);
    }, [setColumnOrder, explorerColumnOrder]);

    if (activeExplore.isLoading) return <EmptyStateExploreLoading />;

    if (columns.length === 0) return <EmptyStateNoColumns />;

    return (
        <Section name={SectionName.RESULTS_TABLE}>
            <div
                style={{
                    height: '100%',
                    padding: '10px',
                    minHeight: '500px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                }}
            >
                <div style={{ display: 'block', maxWidth: '100%' }}>
                    <div
                        style={{
                            display: 'flex',
                            maxWidth: '100%',
                            flexDirection: 'row',
                        }}
                    >
                        <HTMLTable
                            bordered
                            condensed
                            {...getTableProps()}
                            style={{ flex: 1 }}
                        >
                            {headerGroups.map((headerGroup) => (
                                <colgroup key={headerGroup.id}>
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
                                                dragUpdateObj.destination.index;

                                            if (typeof dIndex === 'number') {
                                                colOrder.splice(sIndex, 1);
                                                colOrder.splice(
                                                    dIndex,
                                                    0,
                                                    dragUpdateObj.draggableId,
                                                );
                                                setExplorerColumnOrder(
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
                                                                    [
                                                                        column.getSortByToggleProps(),
                                                                    ],
                                                                )}
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
                        <div
                            style={{
                                display: 'flex',
                                backgroundColor: hexToRGB(Colors.GRAY4, 0.2),
                                boxShadow:
                                    'inset 1px 0 0 0 rgb(16 22 26 / 15%)',
                            }}
                        >
                            <AddColumnButton />
                        </div>
                    </div>
                    {queryResults.isLoading && (
                        <>
                            <div style={{ paddingTop: '20px' }} />
                            <NonIdealState
                                title="Loading results"
                                icon={<Spinner />}
                            />
                        </>
                    )}
                    {queryResults.isIdle && <EmptyStateNoTableData />}
                    {queryResults.status === 'success' &&
                        queryResults.data.rows.length === 0 && (
                            <EmptyStateNoRows />
                        )}
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
                                    activeTableName || 'export'
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
        </Section>
    );
};
