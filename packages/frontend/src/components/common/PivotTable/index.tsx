import {
    formatItemValue,
    getConditionalFormattingColor,
    getConditionalFormattingConfig,
    getConditionalFormattingDescription,
    getItemId,
    isDimension,
    isField,
    isMetric,
    isNumericItem,
    MetricType,
    type ConditionalFormattingConfig,
    type ItemsMap,
    type PivotData,
    type ResultRow,
    type ResultValue,
} from '@lightdash/common';
import { Button, Group, Text, type BoxProps } from '@mantine/core';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import {
    flexRender,
    getCoreRowModel,
    getExpandedRowModel,
    useReactTable,
    type GroupingState,
    type Row,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import isEqual from 'lodash/isEqual';
import last from 'lodash/last';
import { readableColor } from 'polished';
import React, { useCallback, useEffect, useMemo, useRef, type FC } from 'react';
import { getDecimalPrecision } from '../../../hooks/tableVisualization/getDataAndColumns';
import { isSummable } from '../../../hooks/useColumnTotals';
import { getColorFromRange, isHexCodeColor } from '../../../utils/colorUtils';
import { getConditionalRuleLabel } from '../Filters/FilterInputs';
import Table from '../LightTable';
import { CELL_HEIGHT } from '../LightTable/styles';
import MantineIcon from '../MantineIcon';
import { getGroupedRowModelLightdash } from '../Table/getGroupedRowModelLightdash';
import { countSubRows } from '../Table/ScrollableTable/TableBody';
import {
    columnHelper,
    ROW_NUMBER_COLUMN_ID,
    type TableColumn,
} from '../Table/types';
import TotalCellMenu from './TotalCellMenu';
import ValueCellMenu from './ValueCellMenu';

const rowColumn: TableColumn = {
    id: ROW_NUMBER_COLUMN_ID,
    cell: (props) => props.row.index + 1,
    enableGrouping: false,
};

const VirtualizedArea: FC<{
    cellCount: number;
    height: number;
}> = ({ cellCount, height }) => {
    return (
        <Table.Row index={-1}>
            {[...Array(cellCount)].map((_, index) => (
                <Table.Cell key={index} h={height} />
            ))}
        </Table.Row>
    );
};

type PivotTableProps = BoxProps & // TODO: remove this
    React.RefAttributes<HTMLTableElement> & {
        data: PivotData;
        conditionalFormattings: ConditionalFormattingConfig[];
        hideRowNumbers: boolean;
        getFieldLabel: (fieldId: string) => string | undefined;
        getField: (fieldId: string) => ItemsMap[string] | undefined;
        showSubtotals?: boolean;
    };

const PivotTable: FC<PivotTableProps> = ({
    data,
    conditionalFormattings,
    hideRowNumbers = false,
    getFieldLabel,
    getField,
    className,
    showSubtotals = false,
    ...tableProps
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [grouping, setGrouping] = React.useState<GroupingState>([]);

    const hasColumnTotals = data.pivotConfig.columnTotals;

    const hasRowTotals = data.pivotConfig.rowTotals;

    const { columns, columnOrder } = useMemo(() => {
        const indexPlaceholders: Record<string, ResultValue>[] = Array(
            data.indexValueTypes.length,
        ).fill({});

        const headerPlaceholders: Record<string, ResultValue>[] = Array(
            data.headerValues.length,
        ).fill({});

        const headerInfoForColumns = data.headerValues.reduce<
            Array<Record<string, ResultValue>>
        >((acc, headerRow) => {
            return headerRow.map((headerColValue, headerColIndex) =>
                'value' in headerColValue
                    ? {
                          ...acc[headerColIndex],
                          [headerColValue.fieldId]: headerColValue.value,
                      }
                    : acc[headerColIndex],
            );
        }, headerPlaceholders);

        const finalHeaderInfoForColumns = [
            ...indexPlaceholders,
            ...headerInfoForColumns,
        ];

        const newColumnOrder: string[] = [];
        if (!hideRowNumbers) newColumnOrder.push(ROW_NUMBER_COLUMN_ID);

        let newColumns = data.retrofitData.pivotColumnInfo.map(
            (col, colIndex) => {
                newColumnOrder.push(col.fieldId);

                const itemId = col.underlyingId || col.baseId;
                const item = itemId ? getField(itemId) : undefined;

                const shouldAggregate =
                    col.columnType === 'rowTotal' ||
                    (item &&
                        isField(item) &&
                        isMetric(item) &&
                        [MetricType.SUM, MetricType.COUNT].includes(item.type));

                // TODO: Remove code duplicated from non-pivot table version.
                const aggregationFunction = shouldAggregate
                    ? (
                          columnId: string,
                          _leafRows: Row<ResultRow>[],
                          childRows: Row<ResultRow>[],
                      ) => {
                          const aggregatedValue = childRows.reduce<
                              number | null
                          >((agg, childRow) => {
                              const cellValue = childRow.getValue(columnId) as
                                  | ResultRow[number]
                                  | undefined;
                              const rawValue = cellValue?.value?.raw;

                              if (rawValue === null) return agg;
                              const adder = Number(rawValue);
                              if (isNaN(adder)) return agg;

                              const numericAgg = agg ?? 0;
                              const precision = getDecimalPrecision(
                                  adder,
                                  numericAgg,
                              );
                              return (
                                  (numericAgg * precision + adder * precision) /
                                  precision
                              );
                          }, null);

                          return (
                              <Text span fw={600}>
                                  {formatItemValue(item, aggregatedValue)}
                              </Text>
                          );
                      }
                    : undefined;

                const column: TableColumn = columnHelper.accessor(
                    (row: ResultRow) => {
                        return row[col.fieldId];
                    },
                    {
                        id: col.fieldId,
                        cell: (info: any) => {
                            return info.getValue()?.value?.formatted || '-';
                        },
                        meta: {
                            item: item,
                            type: col.columnType,
                            headerInfo:
                                colIndex < finalHeaderInfoForColumns.length
                                    ? finalHeaderInfoForColumns[colIndex]
                                    : undefined,
                        },
                        aggregationFn: aggregationFunction,
                        aggregatedCell: (info) => {
                            const value = info.getValue();
                            const ret = value ?? info.cell.getValue();
                            const numVal = Number(ret);
                            return isNaN(numVal) ? ret : numVal;
                        },
                    },
                );
                return column;
            },
        );

        if (!hideRowNumbers) newColumns = [rowColumn, ...newColumns];

        return { columns: newColumns, columnOrder: newColumnOrder };
    }, [
        data.retrofitData.pivotColumnInfo,
        data.indexValueTypes.length,
        data.headerValues,
        getField,
        hideRowNumbers,
    ]);

    const table = useReactTable({
        data: data.retrofitData.allCombinedData,
        columns: columns,
        state: {
            grouping,
            columnOrder: columnOrder,
            columnPinning: {
                left: [ROW_NUMBER_COLUMN_ID],
            },
        },
        onGroupingChange: setGrouping,
        getExpandedRowModel: getExpandedRowModel(),
        getGroupedRowModel: getGroupedRowModelLightdash(),
        getCoreRowModel: getCoreRowModel(),
    });

    const { rows } = table.getRowModel();

    const rowVirtualizer = useVirtualizer({
        getScrollElement: () => containerRef.current,
        count: rows.length,
        estimateSize: () => CELL_HEIGHT,
        overscan: 25,
    });
    const virtualRows = rowVirtualizer.getVirtualItems();

    const getColumnTotalValueFromAxis = useCallback(
        (total: unknown, colIndex: number): ResultValue | null => {
            const value = last(data.headerValues)?.[colIndex];
            if (!value || !value.fieldId) throw new Error('Invalid pivot data');

            const item = getField(value.fieldId);
            if (!isSummable(item)) {
                return null;
            }
            const formattedValue = formatItemValue(item, total);

            return {
                raw: total,
                formatted: formattedValue,
            };
        },
        [data.headerValues, getField],
    );

    const getMetricAsRowColumnTotalValueFromAxis = useCallback(
        (total: unknown, rowIndex: number): ResultValue => {
            const value = last(data.columnTotalFields?.[rowIndex]);
            if (!value || !value.fieldId) throw new Error('Invalid pivot data');

            const item = getField(value.fieldId);

            const formattedValue = formatItemValue(item, total);

            return {
                raw: total,
                formatted: formattedValue,
            };
        },
        [data.columnTotalFields, getField],
    );

    const getUnderlyingFieldValues = useCallback(
        (rowIndex: number, colIndex: number) => {
            const visibleCells = rows[rowIndex].getVisibleCells();
            const visibleCell = visibleCells[colIndex];
            const item = visibleCell.column.columnDef.meta?.item;
            const fullItemValue = visibleCell.getValue() as ResultRow[0];
            const itemValue = fullItemValue.value;
            let underlyingValues =
                isField(item) && itemValue
                    ? { [getItemId(item)]: itemValue }
                    : {};
            visibleCells.forEach((cell, cellIndex) => {
                if (cell.column.columnDef.meta?.type === 'indexValue') {
                    if (cell.column.columnDef.id) {
                        const fullValue = cell.getValue() as ResultRow[0];
                        underlyingValues[cell.column.columnDef.id] =
                            fullValue.value;
                    }
                } else if (cell.column.columnDef.meta?.type === 'label') {
                    const info = data.indexValues[rowIndex].find(
                        (indexValue) => indexValue.type === 'label',
                    );
                    if (info) underlyingValues[info.fieldId] = itemValue;
                } else if (
                    colIndex === cellIndex &&
                    cell.column.columnDef.meta?.headerInfo
                ) {
                    underlyingValues = {
                        ...underlyingValues,
                        ...cell.column.columnDef.meta.headerInfo,
                    };
                }
            });
            return underlyingValues;
        },
        [rows, data.indexValues],
    );

    const paddingTop = useMemo(() => {
        return virtualRows.length > 0 ? virtualRows?.[0]?.start || 0 : 0;
    }, [virtualRows]);

    const paddingBottom = useMemo(() => {
        return virtualRows.length > 0
            ? rowVirtualizer.getTotalSize() -
                  (virtualRows?.[virtualRows.length - 1]?.end || 0)
            : 0;
    }, [virtualRows, rowVirtualizer]);

    const cellsCountWithRowNumber = useMemo(() => {
        return (hideRowNumbers ? 0 : 1) + data.cellsCount;
    }, [hideRowNumbers, data.cellsCount]);

    useEffect(() => {
        // TODO: Remove code duplicated from non-pivot table version.
        if (showSubtotals) {
            const groupedColumns = data.indexValueTypes.map(
                (valueType) => valueType.fieldId,
            );
            const sortedColumns = table
                .getState()
                .columnOrder.reduce<string[]>((acc, sortedId) => {
                    return groupedColumns.includes(sortedId)
                        ? [...acc, sortedId]
                        : acc;
                }, [])
                // The last dimension column essentially groups rows for each unique value in that column.
                // Grouping on it would result in many useless expandable groups containing just one item.
                .slice(0, -1);

            if (!isEqual(sortedColumns, table.getState().grouping)) {
                table.setGrouping(sortedColumns);
            }
        } else {
            if (table.getState().grouping.length > 0) {
                table.resetGrouping();
            }
        }
    }, [showSubtotals, data.indexValueTypes, table, columnOrder]);

    return (
        <Table
            miw="100%"
            className={className}
            {...tableProps}
            containerRef={containerRef}
        >
            <Table.Head withSticky>
                {data.headerValues.map((headerValues, headerRowIndex) => (
                    <Table.Row
                        key={`header-row-${headerRowIndex}`}
                        index={headerRowIndex}
                    >
                        {/* shows empty cell if row numbers are visible */}
                        {hideRowNumbers ? null : headerRowIndex <
                          data.headerValues.length - 1 ? (
                            <Table.Cell withMinimalWidth />
                        ) : (
                            <Table.CellHead withMinimalWidth withBoldFont>
                                #
                            </Table.CellHead>
                        )}

                        {/* renders the title labels */}
                        {data.titleFields[headerRowIndex].map(
                            (titleField, titleFieldIndex) => {
                                const field = titleField?.fieldId
                                    ? getField(titleField?.fieldId)
                                    : undefined;

                                const isEmpty = !titleField?.fieldId;

                                const isHeaderTitle =
                                    titleField?.direction === 'header';

                                return isEmpty ? (
                                    <Table.Cell
                                        key={`title-${headerRowIndex}-${titleFieldIndex}`}
                                        withMinimalWidth
                                    />
                                ) : (
                                    <Table.CellHead
                                        key={`title-${headerRowIndex}-${titleFieldIndex}`}
                                        withAlignRight={isHeaderTitle}
                                        withMinimalWidth
                                        withBoldFont
                                        withTooltip={
                                            isField(field)
                                                ? field.description
                                                : undefined
                                        }
                                    >
                                        {titleField?.fieldId
                                            ? getFieldLabel(titleField?.fieldId)
                                            : undefined}
                                    </Table.CellHead>
                                );
                            },
                        )}

                        {/* renders the header values or labels */}
                        {headerValues.map((headerValue, headerColIndex) => {
                            const isLabel = headerValue.type === 'label';
                            const field = getField(headerValue.fieldId);

                            const description =
                                isLabel && isField(field)
                                    ? field.description
                                    : undefined;

                            return isLabel || headerValue.colSpan > 0 ? (
                                <Table.CellHead
                                    key={`header-${headerRowIndex}-${headerColIndex}`}
                                    withBoldFont={isLabel}
                                    withTooltip={description}
                                    colSpan={
                                        isLabel
                                            ? undefined
                                            : headerValue.colSpan
                                    }
                                >
                                    {isLabel
                                        ? getFieldLabel(headerValue.fieldId)
                                        : headerValue.value.formatted}
                                </Table.CellHead>
                            ) : null;
                        })}

                        {/* render the total label */}
                        {hasRowTotals
                            ? data.rowTotalFields?.[headerRowIndex].map(
                                  (totalLabel, headerColIndex) =>
                                      totalLabel ? (
                                          <Table.CellHead
                                              key={`header-total-${headerRowIndex}-${headerColIndex}`}
                                              withBoldFont
                                              withMinimalWidth
                                          >
                                              {totalLabel.fieldId
                                                  ? `Total ${getFieldLabel(
                                                        totalLabel.fieldId,
                                                    )}`
                                                  : `Total`}
                                          </Table.CellHead>
                                      ) : (
                                          <Table.Cell
                                              key={`header-total-${headerRowIndex}-${headerColIndex}`}
                                              withMinimalWidth
                                          />
                                      ),
                              )
                            : null}
                    </Table.Row>
                ))}
            </Table.Head>

            <Table.Body>
                {paddingTop > 0 && (
                    <VirtualizedArea
                        cellCount={cellsCountWithRowNumber}
                        height={paddingTop}
                    />
                )}

                {virtualRows.map((virtualRow) => {
                    const rowIndex = virtualRow.index;
                    const row = rows[rowIndex];
                    if (!row) return null;

                    const toggleExpander = row.getToggleExpandedHandler();

                    return (
                        <Table.Row key={`row-${rowIndex}`} index={rowIndex}>
                            {/* renders empty rows if there are no index values but titles */}
                            {data.indexValueTypes.length === 0 &&
                                data.titleFields[0].map(
                                    (_titleField, titleFieldIndex) => (
                                        <Table.Cell
                                            key={`empty-title-${rowIndex}-${titleFieldIndex}`}
                                        />
                                    ),
                                )}

                            {row.getVisibleCells().map((cell, colIndex) => {
                                const meta = cell.column.columnDef.meta;
                                let item = meta?.item;

                                if (item && isDimension(item)) {
                                    const underlyingId = data.indexValues[
                                        rowIndex
                                    ].find(
                                        (indexValue) =>
                                            indexValue.type === 'label',
                                    )?.fieldId;
                                    item = underlyingId
                                        ? getField(underlyingId)
                                        : undefined;
                                }

                                const fullValue =
                                    cell.getValue() as ResultRow[0];
                                const value = fullValue?.value;

                                const conditionalFormattingConfig =
                                    getConditionalFormattingConfig(
                                        item,
                                        value?.raw,
                                        conditionalFormattings,
                                    );

                                const conditionalFormattingColor =
                                    getConditionalFormattingColor(
                                        item,
                                        value?.raw,
                                        conditionalFormattingConfig,
                                        getColorFromRange,
                                    );

                                const conditionalFormatting = (() => {
                                    const tooltipContent =
                                        getConditionalFormattingDescription(
                                            item,
                                            conditionalFormattingConfig,
                                            getConditionalRuleLabel,
                                        );

                                    if (
                                        !conditionalFormattingColor ||
                                        !isHexCodeColor(
                                            conditionalFormattingColor,
                                        )
                                    ) {
                                        return undefined;
                                    }

                                    return {
                                        tooltipContent,
                                        color: readableColor(
                                            conditionalFormattingColor,
                                        ),
                                        backgroundColor:
                                            conditionalFormattingColor,
                                    };
                                })();

                                const fontColor =
                                    conditionalFormattingColor &&
                                    readableColor(
                                        conditionalFormattingColor,
                                    ) === 'white'
                                        ? 'white'
                                        : undefined;

                                const suppressContextMenu =
                                    (value === undefined ||
                                        cell.getIsPlaceholder()) &&
                                    !cell.getIsAggregated() &&
                                    !cell.getIsGrouped();
                                const allowInteractions = suppressContextMenu
                                    ? undefined
                                    : !!value?.formatted;

                                return (
                                    <Table.Cell
                                        key={`value-${rowIndex}-${colIndex}`}
                                        withAlignRight={isNumericItem(item)}
                                        withColor={conditionalFormatting?.color}
                                        withBoldFont={meta?.type === 'label'}
                                        withBackground={
                                            conditionalFormatting?.backgroundColor
                                        }
                                        withTooltip={
                                            conditionalFormatting?.tooltipContent
                                        }
                                        withInteractions={allowInteractions}
                                        withValue={value?.formatted}
                                        withMenu={(
                                            { isOpen, onClose, onCopy },
                                            render,
                                        ) => (
                                            <ValueCellMenu
                                                opened={isOpen}
                                                rowIndex={rowIndex}
                                                colIndex={colIndex}
                                                item={item}
                                                value={value}
                                                getUnderlyingFieldValues={
                                                    meta?.type === 'rowTotal'
                                                        ? undefined
                                                        : getUnderlyingFieldValues
                                                }
                                                onClose={onClose}
                                                onCopy={onCopy}
                                            >
                                                {render()}
                                            </ValueCellMenu>
                                        )}
                                    >
                                        {cell.getIsGrouped() ? (
                                            <Group spacing="two" noWrap>
                                                <Button
                                                    compact
                                                    size="xs"
                                                    variant="subtle"
                                                    styles={(theme) => ({
                                                        root: {
                                                            height: 'unset',
                                                            paddingLeft:
                                                                theme.spacing
                                                                    .two,
                                                            paddingRight:
                                                                theme.spacing
                                                                    .xxs,
                                                            fontFamily:
                                                                "'Inter', sans-serif",
                                                            fontFeatureSettings:
                                                                "'tnum'",
                                                        },
                                                        leftIcon: {
                                                            marginRight: 0,
                                                        },
                                                    })}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        e.preventDefault();
                                                        toggleExpander();
                                                    }}
                                                    leftIcon={
                                                        <MantineIcon
                                                            size={14}
                                                            icon={
                                                                row.getIsExpanded()
                                                                    ? IconChevronDown
                                                                    : IconChevronRight
                                                            }
                                                        />
                                                    }
                                                    style={{
                                                        color:
                                                            fontColor ??
                                                            'inherit',
                                                    }}
                                                >
                                                    ({countSubRows(row)})
                                                </Button>
                                                {flexRender(
                                                    cell.column.columnDef.cell,
                                                    cell.getContext(),
                                                )}
                                            </Group>
                                        ) : cell.getIsAggregated() ? (
                                            flexRender(
                                                cell.column.columnDef
                                                    .aggregatedCell ??
                                                    cell.column.columnDef.cell,
                                                cell.getContext(),
                                            )
                                        ) : cell.getIsPlaceholder() ? null : (
                                            flexRender(
                                                cell.column.columnDef.cell,
                                                cell.getContext(),
                                            )
                                        )}
                                    </Table.Cell>
                                );
                            })}
                        </Table.Row>
                    );
                })}

                {paddingBottom > 0 && (
                    <VirtualizedArea
                        cellCount={cellsCountWithRowNumber}
                        height={paddingBottom}
                    />
                )}
            </Table.Body>

            {hasColumnTotals ? (
                <Table.Footer withSticky>
                    {data.columnTotals?.map((row, totalRowIndex) => (
                        <Table.Row
                            key={`column-total-${totalRowIndex}`}
                            index={totalRowIndex}
                        >
                            {/* shows empty cell if row numbers are visible */}
                            {hideRowNumbers ? null : <Table.CellHead />}

                            {/* render the total label */}
                            {data.columnTotalFields?.[totalRowIndex].map(
                                (totalLabel, totalColIndex) =>
                                    totalLabel ? (
                                        <Table.CellHead
                                            key={`footer-total-${totalRowIndex}-${totalColIndex}`}
                                            withAlignRight
                                            withBoldFont
                                        >
                                            {totalLabel.fieldId
                                                ? `Total ${getFieldLabel(
                                                      totalLabel.fieldId,
                                                  )}`
                                                : `Total`}
                                        </Table.CellHead>
                                    ) : (
                                        <Table.CellHead
                                            key={`footer-total-${totalRowIndex}-${totalColIndex}`}
                                        />
                                    ),
                            )}

                            {row.map((total, totalColIndex) => {
                                const value = data.pivotConfig.metricsAsRows
                                    ? getMetricAsRowColumnTotalValueFromAxis(
                                          total,
                                          totalRowIndex,
                                      )
                                    : getColumnTotalValueFromAxis(
                                          total,
                                          totalColIndex,
                                      );
                                return value ? (
                                    <Table.CellHead
                                        key={`column-total-${totalRowIndex}-${totalColIndex}`}
                                        withAlignRight
                                        withBoldFont
                                        withInteractions
                                        withValue={value.formatted}
                                        withMenu={(
                                            { isOpen, onClose, onCopy },
                                            render,
                                        ) => (
                                            <TotalCellMenu
                                                opened={isOpen}
                                                onClose={onClose}
                                                onCopy={onCopy}
                                            >
                                                {render()}
                                            </TotalCellMenu>
                                        )}
                                    >
                                        {value.formatted}
                                    </Table.CellHead>
                                ) : (
                                    <Table.Cell
                                        key={`footer-total-${totalRowIndex}-${totalColIndex}`}
                                    />
                                );
                            })}

                            {hasRowTotals
                                ? data.rowTotalFields?.[0].map((_, index) => (
                                      <Table.Cell
                                          key={`footer-empty-${totalRowIndex}-${index}`}
                                      />
                                  ))
                                : null}
                        </Table.Row>
                    ))}
                </Table.Footer>
            ) : null}
        </Table>
    );
};

export default PivotTable;
