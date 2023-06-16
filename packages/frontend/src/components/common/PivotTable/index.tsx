import {
    ConditionalFormattingConfig,
    Field,
    fieldId,
    formatItemValue,
    isField,
    PivotData,
    ResultValue,
    TableCalculation,
} from '@lightdash/common';
import { Table, TableProps } from '@mantine/core';
import { useVirtualizer } from '@tanstack/react-virtual';
import last from 'lodash-es/last';
import React, { FC, useCallback, useMemo } from 'react';
import { useScroll } from 'react-use';
import { isSummable } from '../../../hooks/useColumnTotals';
import Cell from './Cell';
import { usePivotTableStyles } from './tableStyles';
import ValueCell from './ValueCell';

const ROW_HEIGHT_PX = 34;

const VirtualizedArea: FC<{
    cellCount: number;
    height: number;
}> = ({ cellCount, height }) => {
    return (
        <tr>
            {[...Array(cellCount)].map((_, index) => (
                <Cell key={index} h={height} />
            ))}
        </tr>
    );
};

type PivotTableProps = TableProps &
    React.RefAttributes<HTMLTableElement> & {
        containerRef: React.RefObject<HTMLDivElement>;
        data: PivotData;
        conditionalFormattings: ConditionalFormattingConfig[];
        hideRowNumbers: boolean;
        getFieldLabel: (fieldId: string) => string | undefined;
        getField: (fieldId: string) => Field | TableCalculation;
    };

const PivotTable: FC<PivotTableProps> = ({
    containerRef,
    data,
    conditionalFormattings,
    hideRowNumbers = false,
    getFieldLabel,
    getField,
    className,
    ...tableProps
}) => {
    const { cx, classes } = usePivotTableStyles();

    const containerScroll = useScroll(containerRef);

    const isAtTop = useMemo(() => {
        if (!containerRef.current) return false;

        const containerScrollPosY = containerScroll.y;

        return containerScrollPosY === 0;
    }, [containerScroll, containerRef]);

    const isAtBottom = useMemo(() => {
        if (!containerRef.current) return false;

        const scrollHeight = containerRef.current.scrollHeight;
        const containerHeight = containerRef.current.clientHeight;
        const containerScrollPosY = containerScroll.y;

        return (
            Math.ceil(containerScrollPosY) + containerHeight === scrollHeight ||
            Math.floor(containerScrollPosY) + containerHeight === scrollHeight
        );
    }, [containerScroll, containerRef]);

    const getItemFromAxis = useCallback(
        (rowIndex: number, colIndex: number) => {
            const value = data.pivotConfig.metricsAsRows
                ? last(data.indexValues[rowIndex])
                : last(data.headerValues)?.[colIndex];

            if (!value || !value.fieldId) throw new Error('Invalid pivot data');

            return getField(value.fieldId);
        },
        [
            data.pivotConfig.metricsAsRows,
            data.headerValues,
            data.indexValues,
            getField,
        ],
    );

    const getRowTotalValueFromAxis = useCallback(
        (total: unknown, colIndex: number): ResultValue => {
            const value = last(data.rowTotalFields)?.[colIndex];

            if (!value || !value.fieldId) throw new Error('Invalid pivot data');
            const item = getField(value.fieldId);

            const formattedValue = formatItemValue(item, total);

            return {
                raw: total,
                formatted: formattedValue,
            };
        },
        [data.rowTotalFields, getField],
    );

    const getMetricAsRowTotalValueFromAxis = useCallback(
        (total: unknown, rowIndex: number): ResultValue | null => {
            const value = last(data.indexValues[rowIndex]);
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
        [data.indexValues, getField],
    );

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
            const item = getItemFromAxis(rowIndex, colIndex);
            const itemValue = data.dataValues[rowIndex][colIndex];

            const initialData =
                isField(item) && itemValue
                    ? { [fieldId(item)]: itemValue }
                    : {};

            return [
                // get the index values for this row
                ...(data.indexValues[rowIndex] ?? []),
                // get the header values for this column
                ...(data.headerValues.map((hv) => hv[colIndex]) ?? []),
            ].reduce<Record<string, ResultValue>>((acc, iv) => {
                if (iv.type !== 'value') return acc;
                return { ...acc, [iv.fieldId]: iv.value };
            }, initialData);
        },
        [data.indexValues, data.headerValues, data.dataValues, getItemFromAxis],
    );

    const hasColumnTotals = data.pivotConfig.columnTotals;

    const hasRowTotals = data.pivotConfig.rowTotals;

    const rowVirtualizer = useVirtualizer({
        getScrollElement: () => containerRef.current,
        count: data.dataValues.length,
        estimateSize: () => ROW_HEIGHT_PX,
        overscan: 25,
    });
    const virtualRows = rowVirtualizer.getVirtualItems();
    const paddingTop =
        virtualRows.length > 0 ? virtualRows?.[0]?.start || 0 : 0;
    const paddingBottom =
        virtualRows.length > 0
            ? rowVirtualizer.getTotalSize() -
              (virtualRows?.[virtualRows.length - 1]?.end || 0)
            : 0;
    const cellsCountWithRowNumber = (hideRowNumbers ? 0 : 1) + data.cellsCount;

    return (
        <Table
            miw="100%"
            cellSpacing={1}
            unstyled
            withBorder
            withColumnBorders
            className={cx(
                classes.root,
                classes.withStickyHeader,
                classes.withStickyFooter,
                className,
            )}
            {...tableProps}
        >
            <thead>
                {data.headerValues.map((headerValues, headerRowIndex) => (
                    <tr key={`header-row-${headerRowIndex}`}>
                        {/* shows empty cell if row numbers are visible */}
                        {hideRowNumbers ? null : <Cell />}

                        {/* renders the title labels */}
                        {data.titleFields[headerRowIndex].map(
                            (titleField, titleFieldIndex) => {
                                const field = titleField?.fieldId
                                    ? getField(titleField?.fieldId)
                                    : undefined;

                                const isEmpty = !titleField?.fieldId;

                                const isHeaderTitle =
                                    titleField?.direction === 'header';

                                return (
                                    <Cell
                                        key={`title-${headerRowIndex}-${titleFieldIndex}`}
                                        component="th"
                                        withBolderFont
                                        withGrayBackground={!isEmpty}
                                        withAlignRight={isHeaderTitle}
                                        tooltipContent={
                                            isField(field)
                                                ? field.description
                                                : undefined
                                        }
                                    >
                                        {titleField?.fieldId
                                            ? getFieldLabel(titleField?.fieldId)
                                            : undefined}
                                    </Cell>
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
                                <Cell
                                    key={`header-${headerRowIndex}-${headerColIndex}`}
                                    component="th"
                                    withBolderFont={isLabel}
                                    withLighterBoldFont={!isLabel}
                                    withGrayBackground
                                    tooltipContent={description}
                                    colSpan={
                                        isLabel
                                            ? undefined
                                            : headerValue.colSpan
                                    }
                                >
                                    {isLabel
                                        ? getFieldLabel(headerValue.fieldId)
                                        : headerValue.value.formatted}
                                </Cell>
                            ) : null;
                        })}

                        {/* render the total label */}
                        {hasRowTotals
                            ? data.rowTotalFields?.[headerRowIndex].map(
                                  (totalLabel, headerColIndex) =>
                                      totalLabel ? (
                                          <Cell
                                              key={`header-total-${headerRowIndex}-${headerColIndex}`}
                                              withBolderFont
                                              withMinimalWidth
                                              withGrayBackground
                                          >
                                              {totalLabel.fieldId
                                                  ? `Total ${getFieldLabel(
                                                        totalLabel.fieldId,
                                                    )}`
                                                  : `Total`}
                                          </Cell>
                                      ) : (
                                          <Cell
                                              key={`header-total-${headerRowIndex}-${headerColIndex}`}
                                              withMinimalWidth
                                              withAlignRight
                                          />
                                      ),
                              )
                            : null}
                    </tr>
                ))}

                <div className={classes.floatingHeader}>
                    <div
                        className={classes.floatingHeaderShadow}
                        data-floating-header-shadow={!isAtTop}
                    />
                </div>
            </thead>

            <tbody>
                {paddingTop > 0 && (
                    <VirtualizedArea
                        cellCount={cellsCountWithRowNumber}
                        height={paddingTop}
                    />
                )}
                {virtualRows.map(({ index: rowIndex }) => {
                    const row = data.dataValues[rowIndex];
                    return (
                        <tr key={`row-${rowIndex}`}>
                            {!hideRowNumbers && (
                                <Cell withAlignRight withMinimalWidth>
                                    {rowIndex + 1}
                                </Cell>
                            )}

                            {/* renders empty rows if there are no index values but titles */}
                            {data.indexValueTypes.length === 0 &&
                                data.titleFields[0].map(
                                    (_titleField, titleFieldIndex) => (
                                        <Cell
                                            key={`empty-title-${rowIndex}-${titleFieldIndex}`}
                                        />
                                    ),
                                )}

                            {/* renders the index values or labels */}
                            {data.indexValueTypes.map(
                                (_indexValueType, indexColIndex) => {
                                    const indexValue =
                                        data.indexValues[rowIndex][
                                            indexColIndex
                                        ];
                                    const field = getField(indexValue.fieldId);
                                    const isLabel = indexValue.type === 'label';

                                    const description =
                                        isLabel && isField(field)
                                            ? field.description
                                            : undefined;

                                    return (
                                        <Cell
                                            key={`index-${rowIndex}-${indexColIndex}`}
                                            withBolderFont={isLabel}
                                            withLighterBoldFont={!isLabel}
                                            withGrayBackground
                                            tooltipContent={description}
                                        >
                                            {isLabel
                                                ? getFieldLabel(
                                                      indexValue.fieldId,
                                                  )
                                                : indexValue.value.formatted}
                                        </Cell>
                                    );
                                },
                            )}

                            {/* renders the pivot values */}
                            {row.map((value, colIndex) => {
                                return (
                                    <ValueCell
                                        key={`value-${rowIndex}-${colIndex}`}
                                        item={getItemFromAxis(
                                            rowIndex,
                                            colIndex,
                                        )}
                                        value={value}
                                        colIndex={colIndex}
                                        rowIndex={rowIndex}
                                        getUnderlyingFieldValues={
                                            getUnderlyingFieldValues
                                        }
                                        conditionalFormattings={
                                            conditionalFormattings
                                        }
                                    />
                                );
                            })}

                            {/* render the total values */}
                            {hasRowTotals
                                ? data.rowTotals?.[rowIndex].map(
                                      (total, colIndex) => {
                                          const value = data.pivotConfig
                                              .metricsAsRows
                                              ? getMetricAsRowTotalValueFromAxis(
                                                    total,
                                                    rowIndex,
                                                )
                                              : getRowTotalValueFromAxis(
                                                    total,
                                                    colIndex,
                                                );

                                          return value ? (
                                              <ValueCell
                                                  key={`index-total-${rowIndex}-${colIndex}`}
                                                  value={value}
                                                  withValue={!!value.formatted}
                                                  withBolderFont
                                                  withGrayBackground
                                              >
                                                  {value.formatted}
                                              </ValueCell>
                                          ) : (
                                              <Cell withGrayBackground />
                                          );
                                      },
                                  )
                                : null}
                        </tr>
                    );
                })}
                {paddingBottom > 0 && (
                    <VirtualizedArea
                        cellCount={cellsCountWithRowNumber}
                        height={paddingBottom}
                    />
                )}
            </tbody>

            {hasColumnTotals ? (
                <tfoot>
                    <div className={classes.floatingFooter}>
                        <div
                            className={classes.floatingFooterShadow}
                            data-floating-footer-shadow={!isAtBottom}
                        />
                    </div>

                    {data.columnTotals?.map((row, totalRowIndex) => (
                        <tr key={`column-total-${totalRowIndex}`}>
                            {/* shows empty cell if row numbers are visible */}
                            {hideRowNumbers ? null : <Cell withMinimalWidth />}

                            {/* render the total label */}
                            {data.columnTotalFields?.[totalRowIndex].map(
                                (totalLabel, totalColIndex) =>
                                    totalLabel ? (
                                        <Cell
                                            key={`footer-total-${totalRowIndex}-${totalColIndex}`}
                                            withAlignRight
                                            withBolderFont
                                            withGrayBackground
                                        >
                                            {totalLabel.fieldId
                                                ? `Total ${getFieldLabel(
                                                      totalLabel.fieldId,
                                                  )}`
                                                : `Total`}
                                        </Cell>
                                    ) : (
                                        <Cell
                                            key={`footer-total-${totalRowIndex}-${totalColIndex}`}
                                            component="th"
                                            withAlignRight
                                            withMinimalWidth
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
                                    <ValueCell
                                        key={`column-total-${totalRowIndex}-${totalColIndex}`}
                                        value={value}
                                        component="th"
                                        withValue={!!value.formatted}
                                        withBolderFont
                                        withGrayBackground
                                    >
                                        {value.formatted}
                                    </ValueCell>
                                ) : (
                                    <Cell
                                        key={`footer-total-${totalRowIndex}-${totalColIndex}`}
                                        component="th"
                                        withGrayBackground
                                    />
                                );
                            })}

                            {hasRowTotals
                                ? data.rowTotalFields?.[0].map((_, index) => (
                                      <Cell
                                          key={`footer-empty-${totalRowIndex}-${index}`}
                                          component="th"
                                      />
                                  ))
                                : null}
                        </tr>
                    ))}
                </tfoot>
            ) : null}
        </Table>
    );
};

export default PivotTable;
