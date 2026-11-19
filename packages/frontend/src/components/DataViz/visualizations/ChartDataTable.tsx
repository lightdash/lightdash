import {
    DimensionType,
    SortByDirection,
    type RawResultRow,
    type VizColumnsConfig,
    type VizTableHeaderSortConfig,
} from '@lightdash/common';
import { Badge, Flex, Group, Tooltip, type FlexProps } from '@mantine/core';
import { IconArrowDown, IconArrowUp } from '@tabler/icons-react';
import {
    createCell,
    flexRender,
    type TableOptions,
} from '@tanstack/react-table';
import { clsx } from 'clsx';
import { SMALL_TEXT_LENGTH } from '../../common/LightTable/constants';
import MantineIcon from '../../common/MantineIcon';
import { ColumnWindowColGroup } from '../../common/Table/ColumnWindowColGroup';
import BodyCell from '../../common/Table/ScrollableTable/BodyCell';
import { VirtualizedArea } from '../../common/Table/ScrollableTable/TableBody';
import { Table as TableStyled, Tr } from '../../common/Table/Table.styles';
import { renderColumns } from '../../common/Table/useColumnWindow';
import { useVirtualTable } from '../hooks/useVirtualTable';
import { RawResultCellContextMenu } from './RawResultCellContextMenu';
import styles from './Table.module.css';

type ChartDataTableProps = {
    columnNames: string[];
    rows: RawResultRow[];
    columnsConfig?: VizColumnsConfig;
    flexProps?: FlexProps;
    thSortConfig?: VizTableHeaderSortConfig;
    onTHClick?: (fieldName: string) => void;
};

type ResultsTableOptions = {
    enableJsonViewer?: boolean;
    density?: 'default' | 'compact';
    columnTypes?: Record<string, DimensionType>;
};

export const ResultsTable = ({
    flexProps,
    thSortConfig,
    onTHClick,
    density = 'default',
    columnTypes,
    showGroupColumnTooltip = false,
    ...data
}: ChartDataTableProps &
    ResultsTableOptions & {
        meta?: TableOptions<RawResultRow>['meta'];
        showGroupColumnTooltip?: boolean;
    }) => {
    const isCompact = density === 'compact';
    const {
        viewport,
        headers,
        virtualRows,
        table,
        paddingTop,
        paddingBottom,
        columnWindow,
        columnCount,
    } = useVirtualTable({
        ...data,
        isCompact,
        columnTypes,
        sortConfig: onTHClick ? thSortConfig : undefined,
    });
    const renderedColumnCount = columnWindow?.slots.length ?? columnCount;

    const renderHeader = (index: number) => {
        if (isCompact && index === 0) {
            return (
                <th
                    key="index"
                    aria-colindex={columnWindow ? 1 : undefined}
                    className={clsx(styles.rowIndex, styles.headerCell)}
                >
                    #
                </th>
            );
        }
        const header = headers[isCompact ? index - 1 : index];
        const sortConfig = thSortConfig?.[header.id];
        const onClick =
            sortConfig && onTHClick ? () => onTHClick(header.id) : undefined;
        const aggregation = data.columnsConfig?.[header.id]?.aggregation;
        const label = flexRender(
            header.column.columnDef.header,
            header.getContext(),
        );
        const content = (
            <Group gap="two" fz="sm">
                {aggregation && (
                    <Badge size="sm" color="indigo" radius="xs">
                        {aggregation}
                    </Badge>
                )}
                {isCompact ? (
                    <span className={styles.headerLabel}>
                        {label}
                        {columnTypes?.[header.id] && (
                            <span className={styles.columnType}>
                                {columnTypes[header.id]}
                            </span>
                        )}
                    </span>
                ) : (
                    label
                )}
                {onClick && sortConfig?.direction && (
                    <MantineIcon
                        icon={
                            sortConfig.direction === SortByDirection.ASC
                                ? IconArrowUp
                                : IconArrowDown
                        }
                    />
                )}
            </Group>
        );
        return (
            <th
                key={`field:${header.id}`}
                aria-colindex={columnWindow ? index + 1 : undefined}
                title={
                    columnWindow
                        ? data.columnsConfig?.[header.id]?.label || header.id
                        : undefined
                }
                onClick={onClick}
                className={styles.headerCell}
                data-sortable={onClick ? true : undefined}
            >
                {showGroupColumnTooltip ? (
                    <Tooltip
                        label="You cannot sort by a group column"
                        disabled={!!onClick}
                        position="top"
                    >
                        {content}
                    </Tooltip>
                ) : (
                    content
                )}
            </th>
        );
    };

    const renderRow = (index: number) => {
        const row = table.getRowModel().rows[index];
        const cells = columnWindow ? undefined : row.getVisibleCells();
        return (
            <Tr key={index} $index={index}>
                {renderColumns(columnWindow, columnCount, (columnIndex) => {
                    if (isCompact && columnIndex === 0) {
                        return (
                            <td
                                key="index"
                                className={styles.rowIndex}
                                aria-colindex={columnWindow ? 1 : undefined}
                            >
                                {index + 1}
                            </td>
                        );
                    }
                    const dataIndex = isCompact ? columnIndex - 1 : columnIndex;
                    const { column } = headers[dataIndex];
                    const cell = cells
                        ? cells[dataIndex]
                        : createCell(table, row, column, column.id);
                    const value = cell.getValue() as RawResultRow[0];
                    const isNull = value === null || value === undefined;

                    return (
                        <BodyCell
                            key={cell.id}
                            columnIndex={
                                columnWindow ? columnIndex + 1 : undefined
                            }
                            index={index}
                            cell={cell}
                            isNumericItem={
                                isCompact &&
                                columnTypes?.[cell.column.id] ===
                                    DimensionType.NUMBER
                            }
                            hasData={!!value}
                            cellContextMenu={RawResultCellContextMenu}
                            isLargeText={
                                (value?.toString() || '').length >
                                SMALL_TEXT_LENGTH
                            }
                        >
                            {cell.getIsPlaceholder() ? null : isCompact &&
                              isNull ? (
                                <span className={styles.nullValue}>null</span>
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
        );
    };

    return (
        <Flex
            ref={viewport}
            direction="column"
            miw="100%"
            {...flexProps}
            className={clsx('sentry-block ph-no-capture', styles.wrapper)}
            data-testid={
                showGroupColumnTooltip ? 'chart-data-table' : undefined
            }
        >
            <TableStyled
                className={clsx(isCompact && styles.compact)}
                aria-colcount={columnWindow ? columnCount : undefined}
                $virtualWidth={columnWindow?.width}
            >
                <ColumnWindowColGroup columnWindow={columnWindow} />
                <Tooltip.Group>
                    <thead>
                        <tr>
                            {renderColumns(
                                columnWindow,
                                columnCount,
                                renderHeader,
                            )}
                        </tr>
                    </thead>
                </Tooltip.Group>
                <tbody>
                    {paddingTop > 0 && (
                        <VirtualizedArea
                            cellCount={renderedColumnCount}
                            padding={paddingTop}
                        />
                    )}
                    {virtualRows.map(({ index }) => renderRow(index))}
                    {paddingBottom > 0 && (
                        <VirtualizedArea
                            cellCount={renderedColumnCount}
                            padding={paddingBottom}
                        />
                    )}
                </tbody>
            </TableStyled>
        </Flex>
    );
};

export const ChartDataTable = (props: ChartDataTableProps) => (
    <ResultsTable {...props} showGroupColumnTooltip />
);
