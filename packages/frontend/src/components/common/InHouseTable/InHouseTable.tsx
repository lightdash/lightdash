import {
    Box,
    Button,
    Group,
    LoadingOverlay,
    Pagination,
    Paper,
    Skeleton,
    Table,
    Text,
    UnstyledButton,
} from '@mantine-8/core';
import {
    IconArrowDown,
    IconArrowUp,
    IconArrowsSort,
    IconFilter,
    IconSearch,
} from '@tabler/icons-react';
import {
    flexRender,
    type Column,
    type Header,
    type Row,
    type RowData,
    type RowSelectionState,
} from '@tanstack/react-table';
import { useVirtualizer, type VirtualItem } from '@tanstack/react-virtual';
import {
    memo,
    useCallback,
    useEffect,
    useMemo,
    type CSSProperties,
} from 'react';
import MantineIcon from '../MantineIcon';
import classes from './InHouseTable.module.css';
import {
    type InHouseTableColumnDef,
    type InHouseTableInstance,
    type InHouseTableMantineProps,
    type InHouseTablePropFactory,
} from './types';

const cx = (...classNames: Array<false | null | string | undefined>) =>
    classNames.filter(Boolean).join(' ');

type SanitizedMantineProps<TElement extends HTMLElement> = Omit<
    InHouseTableMantineProps<TElement>,
    'ref' | 'styles' | 'sx'
> & {
    className?: string;
    style?: CSSProperties;
};

const assignRef = <TElement,>(
    ref: React.Ref<TElement> | undefined,
    value: TElement | null,
) => {
    if (!ref) return;
    if (typeof ref === 'function') {
        ref(value);
        return;
    }
    ref.current = value;
};

const sxToStyle = (sx: unknown): CSSProperties => {
    if (!sx || typeof sx !== 'object' || Array.isArray(sx)) {
        return {};
    }

    return Object.fromEntries(
        Object.entries(sx).filter(([key, value]) => {
            if (/[&: >.[#@]/.test(key)) return false;
            return (
                value === undefined ||
                typeof value === 'string' ||
                typeof value === 'number'
            );
        }),
    ) as CSSProperties;
};

const sanitizeMantineProps = <TElement extends HTMLElement>(
    props?: InHouseTableMantineProps<TElement>,
    options?: { includeSxStyle?: boolean },
): SanitizedMantineProps<TElement> => {
    if (!props) {
        return {};
    }
    const { ref: _ref, styles: _styles, sx, style, ...rest } = props;
    return {
        ...rest,
        style: {
            ...(options?.includeSxStyle ? sxToStyle(sx) : {}),
            ...style,
        },
    } as SanitizedMantineProps<TElement>;
};

const mergeMantineProps = <TElement extends HTMLElement>(
    baseProps: SanitizedMantineProps<TElement>,
    overrideProps: SanitizedMantineProps<TElement>,
): SanitizedMantineProps<TElement> => ({
    ...baseProps,
    ...overrideProps,
    className: cx(baseProps.className, overrideProps.className),
    style: {
        ...baseProps.style,
        ...overrideProps.style,
    },
});

const resolveProps = <TElement extends HTMLElement, TArgs>(
    propFactory: InHouseTablePropFactory<TElement, TArgs> | undefined,
    args: TArgs,
) =>
    typeof propFactory === 'function' ? propFactory(args) : (propFactory ?? {});

const getLightdashColumnDef = <TData extends RowData>(
    column: Column<TData, unknown>,
) =>
    (
        column.columnDef.meta as
            | { lightdashColumnDef?: InHouseTableColumnDef<TData> }
            | undefined
    )?.lightdashColumnDef;

type ColumnSizeVars = CSSProperties & Record<`--${string}`, number>;

const sanitizeColumnIdForVar = (id: string) =>
    id.replace(/[^a-zA-Z0-9_-]/g, '_');

const getColumnSizeVarName = (type: 'col' | 'header', id: string) =>
    `--in-house-table-${type}-${sanitizeColumnIdForVar(id)}-size` as const;

const getColumnSizeVar = (type: 'col' | 'header', id: string) =>
    `calc(var(${getColumnSizeVarName(type, id)}) * 1px)`;

const useColumnSizeVars = <TData extends RowData>(
    table: InHouseTableInstance<TData>,
) => {
    const columnSizing = table.getState().columnSizing;
    const columnSizingInfo = table.getState().columnSizingInfo;

    return useMemo(() => {
        const vars: ColumnSizeVars = {};

        for (const [columnId, size] of Object.entries(columnSizing)) {
            vars[getColumnSizeVarName('col', columnId)] = size;
        }

        for (const header of table.getFlatHeaders()) {
            vars[getColumnSizeVarName('header', header.id)] = header.getSize();
            vars[getColumnSizeVarName('col', header.column.id)] =
                header.column.getSize();
        }

        if (columnSizingInfo.isResizingColumn) {
            const resizingColumn = table.getColumn(
                String(columnSizingInfo.isResizingColumn),
            );

            if (resizingColumn) {
                vars[getColumnSizeVarName('col', resizingColumn.id)] =
                    resizingColumn.getSize();
            }
        }

        return vars;
    }, [columnSizing, columnSizingInfo, table]);
};

const defaultEstimateSize = () => 44;
const TALL_SKELETON_ROW_HEIGHT = 64;
const DISPLAY_COLUMN_IDS = new Set([
    'mrt-row-actions',
    'mrt-row-numbers',
    'mrt-row-select',
]);
const ROW_SELECT_COLUMN_ID = 'mrt-row-select';

const getRowSelectCellStyle = (columnId: string): CSSProperties | undefined =>
    columnId === ROW_SELECT_COLUMN_ID
        ? {
              paddingLeft: 0,
              paddingRight: 0,
              textAlign: 'center',
          }
        : undefined;

const isRowSelectColumn = (columnId: string) =>
    columnId === ROW_SELECT_COLUMN_ID;

const getSkeletonRowHeight = <TData extends RowData>(
    table: InHouseTableInstance<TData>,
) =>
    table.lightdashOptions.rowVirtualizerProps?.estimateSize?.() ??
    defaultEstimateSize();

const getSkeletonWidth = (columnId: string, columnIndex: number) => {
    if (columnId === 'mrt-row-select') return 20;
    if (columnId === 'mrt-row-actions') return 28;
    if (columnId === 'mrt-row-numbers') return 24;

    const widths = ['72%', '48%', '58%', '42%', '52%'];
    return widths[columnIndex % widths.length];
};

const SortIcon = <TData extends RowData>({
    header,
    table,
}: {
    header: Header<TData, unknown>;
    table: InHouseTableInstance<TData>;
}) => {
    const sortState = header.column.getIsSorted();
    const icons = table.lightdashOptions.icons;

    if (sortState === 'asc') {
        return icons?.IconSortAscending ? (
            icons.IconSortAscending()
        ) : (
            <IconArrowUp size={14} />
        );
    }

    if (sortState === 'desc') {
        return icons?.IconSortDescending ? (
            icons.IconSortDescending()
        ) : (
            <IconArrowDown size={14} />
        );
    }

    return icons?.IconArrowsSort ? (
        icons.IconArrowsSort()
    ) : (
        <IconArrowsSort size={14} />
    );
};

const HeaderContent = <TData extends RowData>({
    header,
}: {
    header: Header<TData, unknown>;
    isResizingColumn: boolean;
    table: InHouseTableInstance<TData>;
    sortState: false | 'asc' | 'desc';
}) => {
    if (header.isPlaceholder) return null;

    return flexRender(header.column.columnDef.header, header.getContext());
};

const MemoizedHeaderContent = memo(
    HeaderContent,
    (previous, next) =>
        previous.header.id === next.header.id &&
        previous.header.isPlaceholder === next.header.isPlaceholder &&
        previous.header.column.id === next.header.column.id &&
        previous.header.column.columnDef.header ===
            next.header.column.columnDef.header &&
        previous.isResizingColumn === next.isResizingColumn &&
        previous.table === next.table &&
        previous.sortState === next.sortState,
) as typeof HeaderContent;

const HeaderCell = <TData extends RowData>({
    header,
    table,
}: {
    header: Header<TData, unknown>;
    table: InHouseTableInstance<TData>;
}) => {
    const options = table.lightdashOptions;
    const columnDef = getLightdashColumnDef(header.column);
    const headCellArgs = {
        column: header.column,
        header,
        table,
    };
    const headCellProps = mergeMantineProps(
        sanitizeMantineProps(
            resolveProps(options.mantineTableHeadCellProps, headCellArgs),
        ),
        sanitizeMantineProps(
            resolveProps(columnDef?.mantineTableHeadCellProps, headCellArgs),
        ),
    );
    const canSort = header.column.getCanSort();
    const canResize =
        options.enableColumnResizing === true && header.column.getCanResize();
    const isResizing = header.column.getIsResizing();
    const isAnyColumnResizing = Boolean(
        table.getState().columnSizingInfo.isResizingColumn,
    );
    const sortState = header.column.getIsSorted();
    const headerContent = (
        <MemoizedHeaderContent
            header={header}
            isResizingColumn={isAnyColumnResizing}
            sortState={sortState}
            table={table}
        />
    );

    return (
        <Table.Th
            {...headCellProps}
            aria-sort={
                sortState === 'asc'
                    ? 'ascending'
                    : sortState === 'desc'
                      ? 'descending'
                      : undefined
            }
            className={cx(
                classes.headCell,
                isRowSelectColumn(header.column.id) && classes.rowSelectCell,
                headCellProps.className,
            )}
            style={{
                width: getColumnSizeVar('header', header.id),
                ...headCellProps.style,
                ...getRowSelectCellStyle(header.column.id),
            }}
        >
            {canSort ? (
                <UnstyledButton
                    className={classes.sortButton}
                    onClick={header.column.getToggleSortingHandler()}
                >
                    <span className={classes.headerLabel}>{headerContent}</span>
                    <span className={classes.sortIcon}>
                        <SortIcon header={header} table={table} />
                    </span>
                </UnstyledButton>
            ) : (
                <div className={classes.headCellContent}>
                    <span className={classes.headerLabel}>{headerContent}</span>
                </div>
            )}

            {canResize ? (
                <Box
                    className={cx(
                        classes.resizeHandle,
                        isResizing && classes.resizeHandleResizing,
                    )}
                    onDoubleClick={() => header.column.resetSize()}
                    onMouseDown={header.getResizeHandler()}
                    onTouchStart={header.getResizeHandler()}
                />
            ) : null}
        </Table.Th>
    );
};

const FooterCell = <TData extends RowData>({
    header,
    table,
}: {
    header: Header<TData, unknown>;
    table: InHouseTableInstance<TData>;
}) => {
    const options = table.lightdashOptions;
    const footerCellProps = sanitizeMantineProps(
        resolveProps(options.mantineTableFooterCellProps, {
            column: header.column,
            header,
            table,
        }),
    );
    const footerContent = flexRender(
        header.column.columnDef.footer,
        header.getContext(),
    );

    return (
        <Table.Th
            {...footerCellProps}
            className={cx(
                classes.footerCell,
                isRowSelectColumn(header.column.id) && classes.rowSelectCell,
                footerCellProps.className,
            )}
            style={{
                width: getColumnSizeVar('header', header.id),
                ...footerCellProps.style,
                ...getRowSelectCellStyle(header.column.id),
            }}
        >
            {footerContent}
        </Table.Th>
    );
};

const SkeletonRows = <TData extends RowData>({
    table,
}: {
    table: InHouseTableInstance<TData>;
}) => {
    const columns = table.getVisibleLeafColumns();
    const skeletonRowHeight = getSkeletonRowHeight(table);
    const isTallRow = skeletonRowHeight >= TALL_SKELETON_ROW_HEIGHT;
    const firstContentColumnId = columns.find(
        (column) => !DISPLAY_COLUMN_IDS.has(column.id),
    )?.id;

    return Array.from({ length: 8 }, (_, rowIndex) => (
        <Table.Tr key={rowIndex} className={classes.bodyRow}>
            {columns.map((column, columnIndex) => (
                <Table.Td
                    key={column.id}
                    className={cx(
                        classes.bodyCell,
                        classes.skeletonCell,
                        isRowSelectColumn(column.id) && classes.rowSelectCell,
                    )}
                    style={{
                        height: skeletonRowHeight,
                        width: getColumnSizeVar('col', column.id),
                        ...getRowSelectCellStyle(column.id),
                    }}
                >
                    <div className={classes.skeletonStack}>
                        <Skeleton
                            className={classes.skeletonLine}
                            height={isTallRow ? 14 : 12}
                            radius="xl"
                            width={getSkeletonWidth(column.id, columnIndex)}
                        />
                        {isTallRow && column.id === firstContentColumnId ? (
                            <Skeleton
                                className={classes.skeletonLineSecondary}
                                height={10}
                                radius="xl"
                                width={rowIndex % 2 === 0 ? '42%' : '34%'}
                            />
                        ) : null}
                    </div>
                </Table.Td>
            ))}
        </Table.Tr>
    ));
};

type BodyRowsProps<TData extends RowData> = {
    table: InHouseTableInstance<TData>;
    rows: Row<TData>[];
    virtualRows?: VirtualItem[];
    measureElement?: (element: HTMLTableRowElement | null) => void;
    editingCellId: string | null;
    isResizingColumn: boolean;
    rowSelection: RowSelectionState;
    visibleColumnIds: string;
};

const BodyRows = <TData extends RowData>({
    table,
    rows,
    virtualRows,
    measureElement,
}: BodyRowsProps<TData>) => {
    const options = table.lightdashOptions;
    const rowsToRender = virtualRows
        ? virtualRows
              .map((virtualRow) => ({
                  row: rows[virtualRow.index],
                  virtualRow,
              }))
              .filter(
                  (
                      row,
                  ): row is {
                      row: NonNullable<(typeof rows)[number]>;
                      virtualRow: VirtualItem;
                  } => row.row !== undefined,
              )
        : rows.map((row) => ({ row, virtualRow: undefined }));

    return (
        <>
            {rowsToRender.map(({ row, virtualRow }) => {
                const rowProps = sanitizeMantineProps(
                    resolveProps(options.mantineTableBodyRowProps, {
                        row,
                        table,
                    }),
                );
                const rowCellStyle: CSSProperties | undefined =
                    rowProps.style?.backgroundColor !== undefined
                        ? { backgroundColor: rowProps.style.backgroundColor }
                        : undefined;
                const isLastDataRow = row === rows[rows.length - 1];
                const lastDataRowCellStyle: CSSProperties | undefined =
                    isLastDataRow ? { borderBottom: 0 } : undefined;

                return (
                    <Table.Tr
                        {...rowProps}
                        key={row.id}
                        className={cx(
                            classes.bodyRow,
                            rowProps.onClick !== undefined &&
                                classes.clickableRow,
                            row.getIsSelected() && classes.rowSelected,
                            isLastDataRow && classes.lastBodyRow,
                            rowProps.className,
                        )}
                        data-index={virtualRow?.index}
                        ref={virtualRow ? measureElement : undefined}
                    >
                        {row.getVisibleCells().map((cell) => {
                            const columnDef = getLightdashColumnDef(
                                cell.column,
                            );
                            const cellArgs = {
                                cell,
                                column: cell.column,
                                row,
                                table,
                            };
                            const cellProps = mergeMantineProps(
                                sanitizeMantineProps(
                                    resolveProps(
                                        options.mantineTableBodyCellProps,
                                        cellArgs,
                                    ),
                                ),
                                sanitizeMantineProps(
                                    resolveProps(
                                        columnDef?.mantineTableBodyCellProps,
                                        cellArgs,
                                    ),
                                ),
                            );

                            return (
                                <Table.Td
                                    {...cellProps}
                                    key={cell.id}
                                    className={cx(
                                        classes.bodyCell,
                                        isRowSelectColumn(cell.column.id) &&
                                            classes.rowSelectCell,
                                        cellProps.className,
                                    )}
                                    style={{
                                        width: getColumnSizeVar(
                                            'col',
                                            cell.column.id,
                                        ),
                                        ...rowCellStyle,
                                        ...cellProps.style,
                                        ...lastDataRowCellStyle,
                                        ...getRowSelectCellStyle(
                                            cell.column.id,
                                        ),
                                    }}
                                >
                                    {options.enableEditing &&
                                    columnDef?.Edit &&
                                    table.lightdashState.editingCell?.id ===
                                        cell.id
                                        ? columnDef.Edit({
                                              ...cell.getContext(),
                                              cell,
                                              row,
                                              table,
                                          })
                                        : flexRender(
                                              cell.column.columnDef.cell,
                                              cell.getContext(),
                                          )}
                                </Table.Td>
                            );
                        })}
                    </Table.Tr>
                );
            })}
        </>
    );
};

const areVirtualRowsEqual = (
    previousRows: VirtualItem[] | undefined,
    nextRows: VirtualItem[] | undefined,
) => {
    if (previousRows === nextRows) return true;
    if (!previousRows || !nextRows) return previousRows === nextRows;
    if (previousRows.length !== nextRows.length) return false;

    return previousRows.every((previousRow, index) => {
        const nextRow = nextRows[index];
        return (
            nextRow !== undefined &&
            previousRow.index === nextRow.index &&
            previousRow.start === nextRow.start &&
            previousRow.size === nextRow.size
        );
    });
};

const MemoizedBodyRows = memo(BodyRows, (previous, next) => {
    if (!previous.isResizingColumn && !next.isResizingColumn) {
        return false;
    }

    return (
        previous.rows === next.rows &&
        previous.rowSelection === next.rowSelection &&
        previous.editingCellId === next.editingCellId &&
        previous.visibleColumnIds === next.visibleColumnIds &&
        areVirtualRowsEqual(previous.virtualRows, next.virtualRows)
    );
}) as typeof BodyRows;

const DefaultBottomToolbar = <TData extends RowData>({
    table,
}: {
    table: InHouseTableInstance<TData>;
}) => {
    if (table.lightdashOptions.enablePagination === false) {
        return null;
    }

    const pageCount = table.getPageCount();

    if (pageCount <= 1) {
        return null;
    }

    return (
        <Group
            justify="space-between"
            px="md"
            py="sm"
            className={classes.bottomToolbar}
        >
            <Text c="ldGray.6" fz="xs" fw={500}>
                {table.getFilteredRowModel().rows.length} rows
            </Text>
            <Pagination
                size="xs"
                total={pageCount}
                value={table.getState().pagination.pageIndex + 1}
                onChange={(page) => table.setPageIndex(page - 1)}
            />
        </Group>
    );
};

const DefaultEmptyState = <TData extends RowData>({
    table,
}: {
    table: InHouseTableInstance<TData>;
}) => {
    const emptyState = table.lightdashOptions.emptyState;
    const search = emptyState?.search?.trim();
    const isFiltered = Boolean(search) || emptyState?.hasActiveFilters === true;
    const entityName = emptyState?.entityName ?? 'records';
    const message =
        isFiltered && emptyState?.filteredMessage
            ? emptyState.filteredMessage
            : !isFiltered && emptyState?.emptyMessage
              ? emptyState.emptyMessage
              : search
                ? `No ${entityName} matching "${search}"`
                : isFiltered
                  ? `No ${entityName} match the current filters`
                  : 'No records to display';

    return (
        <div className={classes.emptyState}>
            <MantineIcon
                icon={isFiltered && search ? IconSearch : IconFilter}
                size="xl"
                color="ldGray.4"
                className={classes.emptyStateIcon}
            />
            <Text fz="sm" fw={500} c="ldGray.6">
                {message}
            </Text>
            {isFiltered && emptyState?.onClearFilters ? (
                <Button
                    variant="subtle"
                    size="xs"
                    color="gray"
                    onClick={emptyState.onClearFilters}
                >
                    Clear all filters
                </Button>
            ) : null}
        </div>
    );
};

export const InHouseTable = <TData extends RowData>({
    table,
}: {
    table: InHouseTableInstance<TData>;
}) => {
    const options = table.lightdashOptions;
    const runtimeState = table.lightdashState;
    const containerRef = table.refs.tableContainerRef;
    const rows = table.getRowModel().rows;
    const visibleColumns = table.getVisibleLeafColumns();
    const visibleColumnIds = visibleColumns
        .map((column) => column.id)
        .join('|');
    const enableVirtualization = options.enableRowVirtualization === true;
    const sortingState = table.getState().sorting;
    const globalFilterState = table.getState().globalFilter;
    const rowSelectionState = table.getState().rowSelection;
    const editingCellId = runtimeState.editingCell?.id ?? null;
    const columnSizeVars = useColumnSizeVars(table);
    const isResizingColumn = Boolean(
        table.getState().columnSizingInfo.isResizingColumn,
    );
    const rowVirtualizer = useVirtualizer<HTMLDivElement, HTMLTableRowElement>({
        count: rows.length,
        enabled: enableVirtualization,
        estimateSize:
            options.rowVirtualizerProps?.estimateSize ?? defaultEstimateSize,
        getScrollElement: () => containerRef.current,
        overscan: options.rowVirtualizerProps?.overscan ?? 10,
    });
    const virtualRows = enableVirtualization
        ? rowVirtualizer.getVirtualItems()
        : undefined;
    const paddingTop = virtualRows?.[0]?.start ?? 0;
    const paddingBottom = useMemo(() => {
        if (!virtualRows || virtualRows.length === 0) return 0;
        const lastVirtualRow = virtualRows[virtualRows.length - 1];
        if (!lastVirtualRow) return 0;
        return rowVirtualizer.getTotalSize() - lastVirtualRow.end;
    }, [rowVirtualizer, virtualRows]);

    useEffect(() => {
        if (options.rowVirtualizerInstanceRef) {
            options.rowVirtualizerInstanceRef.current = rowVirtualizer;
        }
    }, [options.rowVirtualizerInstanceRef, rowVirtualizer]);

    useEffect(() => {
        if (!enableVirtualization) return;
        rowVirtualizer.scrollToIndex(0);
    }, [enableVirtualization, globalFilterState, rowVirtualizer, sortingState]);

    const handleContainerRef = useCallback(
        (node: HTMLDivElement | null) => {
            containerRef.current = node;
            assignRef(options.mantineTableContainerProps?.ref, node);
        },
        [containerRef, options.mantineTableContainerProps?.ref],
    );

    const paperProps = sanitizeMantineProps(options.mantinePaperProps, {
        includeSxStyle: true,
    });
    const containerProps = sanitizeMantineProps(
        options.mantineTableContainerProps,
        { includeSxStyle: true },
    );
    const tableProps = sanitizeMantineProps(
        options.mantineTableProps,
    ) as SanitizedMantineProps<HTMLTableElement> &
        Omit<
            NonNullable<typeof options.mantineTableProps>,
            'ref' | 'styles' | 'sx'
        >;
    const headRowProps = sanitizeMantineProps(options.mantineTableHeadRowProps);
    const headProps = sanitizeMantineProps(options.mantineTableHeadProps);
    const bodyProps = sanitizeMantineProps(options.mantineTableBodyProps);
    const topToolbar = options.renderTopToolbar?.({ table });
    const bottomToolbar = options.renderBottomToolbar?.({ table }) ?? (
        <DefaultBottomToolbar table={table} />
    );
    const hasCustomEmptyRowsFallback =
        options.renderEmptyRowsFallback !== undefined;
    const emptyRowsFallback = hasCustomEmptyRowsFallback ? (
        <div className={classes.emptyState}>
            {options.renderEmptyRowsFallback?.({ table })}
        </div>
    ) : (
        <DefaultEmptyState table={table} />
    );
    const showSkeletons =
        runtimeState.showSkeletons ||
        (runtimeState.isLoading && rows.length === 0);
    const hasFooter = table
        .getFooterGroups()
        .some((footerGroup) =>
            footerGroup.headers.some(
                (header) => header.column.columnDef.footer,
            ),
        );

    return (
        <Paper
            {...paperProps}
            className={cx(classes.paper, paperProps.className)}
        >
            <LoadingOverlay
                loaderProps={{ color: 'gray', size: 'sm' }}
                overlayProps={{
                    backgroundOpacity: 0.28,
                    blur: 1,
                    radius: 'sm',
                }}
                visible={runtimeState.showLoadingOverlay}
                {...options.mantineLoadingOverlayProps}
            />
            {options.enableTopToolbar !== false && topToolbar ? (
                <div className={classes.topToolbar}>{topToolbar}</div>
            ) : null}
            {runtimeState.showProgressBars ? (
                <div
                    aria-label="Loading table rows"
                    className={classes.progress}
                />
            ) : null}
            <Box
                {...containerProps}
                ref={handleContainerRef}
                className={cx(classes.container, containerProps.className)}
            >
                <Table
                    {...tableProps}
                    className={cx(
                        classes.table,
                        tableProps.highlightOnHover === true &&
                            classes.highlightOnHover,
                        tableProps.withColumnBorders === true &&
                            classes.columnBorders,
                        isResizingColumn && classes.columnResizing,
                        tableProps.className,
                    )}
                    style={{
                        minWidth: table.getTotalSize(),
                        ...columnSizeVars,
                        ...tableProps.style,
                    }}
                >
                    <colgroup>
                        {visibleColumns.map((column) => (
                            <col
                                key={column.id}
                                style={{
                                    width: getColumnSizeVar('col', column.id),
                                }}
                            />
                        ))}
                    </colgroup>
                    <Table.Thead
                        {...headProps}
                        className={cx(
                            options.enableStickyHeader === false
                                ? undefined
                                : classes.head,
                            headProps.className,
                        )}
                        style={headProps.style}
                    >
                        {table.getHeaderGroups().map((headerGroup) => (
                            <Table.Tr
                                {...headRowProps}
                                key={headerGroup.id}
                                className={cx(
                                    classes.headRow,
                                    headRowProps.className,
                                )}
                            >
                                {headerGroup.headers.map((header) => (
                                    <HeaderCell
                                        key={header.id}
                                        header={header}
                                        table={table}
                                    />
                                ))}
                            </Table.Tr>
                        ))}
                    </Table.Thead>
                    <Table.Tbody
                        {...bodyProps}
                        className={cx(bodyProps.className)}
                    >
                        {paddingTop > 0 ? (
                            <Table.Tr>
                                <Table.Td
                                    className={classes.fillerCell}
                                    colSpan={visibleColumns.length}
                                    style={{
                                        border: 0,
                                        height: paddingTop,
                                        padding: 0,
                                    }}
                                />
                            </Table.Tr>
                        ) : null}

                        {showSkeletons ? (
                            <SkeletonRows table={table} />
                        ) : rows.length > 0 ? (
                            <MemoizedBodyRows
                                editingCellId={editingCellId}
                                isResizingColumn={isResizingColumn}
                                measureElement={rowVirtualizer.measureElement}
                                rows={rows}
                                rowSelection={rowSelectionState}
                                table={table}
                                virtualRows={virtualRows}
                                visibleColumnIds={visibleColumnIds}
                            />
                        ) : (
                            <Table.Tr>
                                <Table.Td
                                    className={classes.emptyCell}
                                    colSpan={visibleColumns.length}
                                >
                                    {runtimeState.showAlertBanner ? (
                                        <div className={classes.emptyState}>
                                            Unable to load rows
                                        </div>
                                    ) : (
                                        emptyRowsFallback
                                    )}
                                </Table.Td>
                            </Table.Tr>
                        )}

                        {paddingBottom > 0 ? (
                            <Table.Tr>
                                <Table.Td
                                    className={classes.fillerCell}
                                    colSpan={visibleColumns.length}
                                    style={{
                                        border: 0,
                                        height: paddingBottom,
                                        padding: 0,
                                    }}
                                />
                            </Table.Tr>
                        ) : null}
                    </Table.Tbody>
                    {hasFooter ? (
                        <Table.Tfoot className={classes.foot}>
                            {table.getFooterGroups().map((footerGroup) => (
                                <Table.Tr key={footerGroup.id}>
                                    {footerGroup.headers.map((header) => (
                                        <FooterCell
                                            key={header.id}
                                            header={header}
                                            table={table}
                                        />
                                    ))}
                                </Table.Tr>
                            ))}
                        </Table.Tfoot>
                    ) : null}
                </Table>
            </Box>
            {options.enableBottomToolbar !== false && bottomToolbar ? (
                <div className={classes.bottomToolbar}>{bottomToolbar}</div>
            ) : null}
        </Paper>
    );
};

export const MantineReactTable = InHouseTable;
