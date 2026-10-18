import { DimensionType, type RawResultRow } from '@lightdash/common';
import { Flex, Menu, useMantineTheme, type FlexProps } from '@mantine/core';
import { IconCopy } from '@tabler/icons-react';
import {
    flexRender,
    getCoreRowModel,
    useReactTable,
    type ColumnDef,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { clsx } from 'clsx';
import { useCallback, useMemo, useRef, type FC } from 'react';
import { JsonCellMenuItem } from '../../../../components/common/JsonViewer/JsonCellViewer';
import {
    getJsonCellValue,
    getJsonLikeString,
} from '../../../../components/common/JsonViewer/utils';
import { SMALL_TEXT_LENGTH } from '../../../../components/common/LightTable/constants';
import MantineIcon from '../../../../components/common/MantineIcon';
import { ROW_HEIGHT_PX } from '../../../../components/common/Table/constants';
import BodyCell from '../../../../components/common/Table/ScrollableTable/BodyCell';
import { VirtualizedArea } from '../../../../components/common/Table/ScrollableTable/TableBody';
import {
    Table as TableStyled,
    Tr,
} from '../../../../components/common/Table/Table.styles';
import { type CellContextMenuProps } from '../../../../components/common/Table/types';
import useToaster from '../../../../hooks/toaster/useToaster';
import { getJsonValueCell, getValueCell } from '../../../../hooks/useColumns';
import { useResizeObserver } from '../../../../hooks/useResizeObserver';
import styles from './SqlResultsTable.module.css';

const COMPACT_ROW_HEIGHT_PX = 28;

type TableDensity = 'default' | 'compact';

type Props = {
    rows: RawResultRow[];
    /** Column references in display order. */
    columns: string[];
    flexProps?: FlexProps;
    enableJsonViewer?: boolean;
    /** `compact` is the dense monospace grid used for raw SQL results. */
    density?: TableDensity;
    /** Warehouse type per column: shown under the header name and used to
     *  right-align numbers. Only read by the compact variant. */
    columnTypes?: Record<string, DimensionType>;
};

const SqlRunnerCellContextMenu = ({
    cell,
    onViewJsonCell,
}: CellContextMenuProps) => {
    const { showToastSuccess } = useToaster();
    const value = cell.getValue();
    const jsonValue = getJsonCellValue(value) ?? getJsonLikeString(value);

    return (
        <>
            <Menu.Item
                leftSection={<MantineIcon icon={IconCopy} />}
                onClick={() => {
                    void navigator.clipboard?.writeText(String(value ?? ''));
                    showToastSuccess({ title: 'Copied to clipboard!' });
                }}
            >
                Copy value
            </Menu.Item>

            {jsonValue && onViewJsonCell ? (
                <JsonCellMenuItem onClick={() => onViewJsonCell(jsonValue)} />
            ) : null}
        </>
    );
};

/** The rows of a SQL run as the warehouse returned them, virtualized. */
export const SqlResultsTable: FC<Props> = ({
    rows,
    columns,
    flexProps,
    enableJsonViewer = false,
    density = 'default',
    columnTypes = {},
}) => {
    const theme = useMantineTheme();
    const isCompact = density === 'compact';
    const rowHeight = isCompact ? COMPACT_ROW_HEIGHT_PX : ROW_HEIGHT_PX;

    const [setResizeRef] = useResizeObserver<HTMLDivElement>();
    const scrollElementRef = useRef<HTMLDivElement | null>(null);
    const tableWrapperRef = useCallback(
        (el: HTMLDivElement | null) => {
            scrollElementRef.current = el;
            setResizeRef(el);
        },
        [setResizeRef],
    );

    const tanstackColumns: ColumnDef<RawResultRow, string>[] = useMemo(
        () =>
            columns.map((column) => ({
                id: column,
                // react table has a bug with accessors that has dots in them
                // we found the fix here -> https://github.com/TanStack/table/issues/1671
                accessorFn: (row: RawResultRow) => row[column] as string,
                header: column,
                cell: enableJsonViewer ? getJsonValueCell : getValueCell,
            })),
        [columns, enableJsonViewer],
    );

    const table = useReactTable({
        data: rows,
        columns: tanstackColumns,
        getCoreRowModel: getCoreRowModel(),
    });

    const virtualizer = useVirtualizer({
        getScrollElement: () => scrollElementRef.current,
        count: rows.length,
        estimateSize: () => rowHeight,
        overscan: 25,
    });
    const virtualRows = virtualizer.getVirtualItems();
    const { rows: rowModelRows } = table.getRowModel();
    const paddingTop = virtualRows.length > 0 ? virtualRows[0]?.start || 0 : 0;
    const paddingBottom =
        virtualRows.length > 0
            ? virtualizer.getTotalSize() -
              (virtualRows[virtualRows.length - 1]?.end || 0)
            : 0;

    // The compact grid prepends a row-index column.
    const columnsCount = columns.length + (isCompact ? 1 : 0);

    return (
        <Flex
            ref={tableWrapperRef}
            direction="column"
            miw="100%"
            {...flexProps}
            className={clsx(
                styles.wrapper,
                'sentry-block ph-no-capture',
                flexProps?.className,
            )}
        >
            <TableStyled className={clsx(isCompact && styles.compact)}>
                <thead>
                    <tr>
                        {isCompact && (
                            <th
                                className={styles.rowIndex}
                                style={{
                                    backgroundColor: theme.colors.ldGray[0],
                                }}
                            >
                                #
                            </th>
                        )}
                        {table.getHeaderGroups().map((headerGroup) =>
                            headerGroup.headers.map((header) => (
                                <th
                                    key={header.id}
                                    style={{
                                        backgroundColor: theme.colors.ldGray[0],
                                    }}
                                >
                                    {isCompact ? (
                                        <span className={styles.headerLabel}>
                                            {flexRender(
                                                header.column.columnDef.header,
                                                header.getContext(),
                                            )}
                                            {columnTypes[header.id] && (
                                                <span
                                                    className={
                                                        styles.columnType
                                                    }
                                                >
                                                    {columnTypes[header.id]}
                                                </span>
                                            )}
                                        </span>
                                    ) : (
                                        flexRender(
                                            header.column.columnDef.header,
                                            header.getContext(),
                                        )
                                    )}
                                </th>
                            )),
                        )}
                    </tr>
                </thead>
                <tbody>
                    {paddingTop > 0 && (
                        <VirtualizedArea
                            cellCount={columnsCount}
                            padding={paddingTop}
                        />
                    )}
                    {virtualRows.map(({ index }) => (
                        <Tr key={index} $index={index}>
                            {isCompact && (
                                <td className={styles.rowIndex}>{index + 1}</td>
                            )}
                            {rowModelRows[index]
                                .getVisibleCells()
                                .map((cell) => {
                                    const cellValue: unknown = cell.getValue();
                                    const isNull =
                                        cellValue === null ||
                                        cellValue === undefined;

                                    return (
                                        <BodyCell
                                            key={cell.id}
                                            index={index}
                                            cell={cell}
                                            isNumericItem={
                                                isCompact &&
                                                columnTypes[cell.column.id] ===
                                                    DimensionType.NUMBER
                                            }
                                            hasData={!!cellValue}
                                            isLargeText={
                                                (cellValue?.toString() || '')
                                                    .length > SMALL_TEXT_LENGTH
                                            }
                                            cellContextMenu={
                                                enableJsonViewer
                                                    ? SqlRunnerCellContextMenu
                                                    : undefined
                                            }
                                        >
                                            {cell.getIsPlaceholder() ? null : isCompact &&
                                              isNull ? (
                                                <span
                                                    className={styles.nullValue}
                                                >
                                                    null
                                                </span>
                                            ) : (
                                                flexRender(
                                                    cell.column.columnDef.cell,
                                                    cell.getContext(),
                                                )
                                            )}
                                        </BodyCell>
                                    );
                                })}
                        </Tr>
                    ))}
                    {paddingBottom > 0 && (
                        <VirtualizedArea
                            cellCount={columnsCount}
                            padding={paddingBottom}
                        />
                    )}
                </tbody>
            </TableStyled>
        </Flex>
    );
};
