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
import last from 'lodash-es/last';
import React, { FC, useCallback } from 'react';

import { useVirtual } from '@tanstack/react-virtual';
import { isSummable } from '../../../hooks/useColumnTotals';
import HeaderCell from './HeaderCell';
import IndexCell from './IndexCell';
import { usePivotTableCellStyles, usePivotTableStyles } from './tableStyles';
import TitleCell from './TitleCell';
import TotalCell from './TotalCell';
import ValueCell from './ValueCell';

const VirtualizedArea: FC<{
    cellCount: number;
    padding: number;
    cellClassName: string;
}> = ({ cellCount, padding, cellClassName }) => {
    return (
        <tr>
            {[...Array(cellCount)].map((_, index) => (
                <td
                    key={index}
                    style={{
                        height: `${padding}px`,
                    }}
                    className={cellClassName}
                />
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
    const { cx: tableCx, classes: tableStyles } = usePivotTableStyles();
    const { cx: cellCx, classes: cellStyles } = usePivotTableCellStyles({});

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

    const rowVirtualizer = useVirtual({
        parentRef: containerRef,
        size: data.dataValues.length,
        overscan: 10,
    });
    const { virtualItems: virtualRows, totalSize } = rowVirtualizer;
    const paddingTop =
        virtualRows.length > 0 ? virtualRows?.[0]?.start || 0 : 0;
    const paddingBottom =
        virtualRows.length > 0
            ? totalSize - (virtualRows?.[virtualRows.length - 1]?.end || 0)
            : 0;
    const cellsCountWithRowNumber = (hideRowNumbers ? 0 : 1) + data.cellsCount;

    return (
        <Table
            m="xs"
            cellSpacing={1}
            unstyled
            withBorder
            withColumnBorders
            className={tableCx(tableStyles.root, className)}
            {...tableProps}
        >
            <thead>
                {data.headerValues.map((headerValues, headerRowIndex) => {
                    const headerLevel =
                        data.headerValues.length - headerRowIndex;

                    return (
                        <tr key={`header-row-${headerRowIndex}`}>
                            <>
                                {/* shows empty cell if row numbers are visible */}
                                {hideRowNumbers ? null : (
                                    <th
                                        className={cellCx(
                                            cellStyles.root,
                                            cellStyles.rowNumber,
                                        )}
                                    />
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

                                        return (
                                            <TitleCell
                                                key={`title-${headerRowIndex}-${titleFieldIndex}`}
                                                className={cellCx(
                                                    cellStyles.root,
                                                    cellStyles.header,
                                                )}
                                                isEmpty={isEmpty}
                                                isHeaderTitle={isHeaderTitle}
                                                description={
                                                    isField(field)
                                                        ? field.description
                                                        : undefined
                                                }
                                                level={headerLevel}
                                            >
                                                {titleField?.fieldId
                                                    ? getFieldLabel(
                                                          titleField?.fieldId,
                                                      )
                                                    : undefined}
                                            </TitleCell>
                                        );
                                    },
                                )}

                                {/* renders the header values or labels */}
                                {headerValues.map(
                                    (headerValue, headerColIndex) => {
                                        const isLabel =
                                            headerValue.type === 'label';
                                        const field = getField(
                                            headerValue.fieldId,
                                        );

                                        const description =
                                            isLabel && isField(field)
                                                ? field.description
                                                : undefined;

                                        if (
                                            !isLabel &&
                                            headerValue.colSpan <= 0
                                        )
                                            return null;
                                        return (
                                            <HeaderCell
                                                key={`header-${headerRowIndex}-${headerColIndex}`}
                                                className={cellCx(
                                                    cellStyles.root,
                                                    cellStyles.header,
                                                )}
                                                level={headerLevel}
                                                description={description}
                                                colSpan={
                                                    !isLabel
                                                        ? headerValue.colSpan
                                                        : undefined
                                                }
                                            >
                                                {isLabel
                                                    ? getFieldLabel(
                                                          headerValue.fieldId,
                                                      )
                                                    : headerValue.value
                                                          .formatted}
                                            </HeaderCell>
                                        );
                                    },
                                )}

                                {/* render the total label */}
                                {hasRowTotals
                                    ? data.rowTotalFields?.[headerRowIndex].map(
                                          (totalLabel, headerColIndex) =>
                                              totalLabel ? (
                                                  <HeaderCell
                                                      key={`header-total-${headerRowIndex}-${headerColIndex}`}
                                                      className={cellCx(
                                                          cellStyles.root,
                                                          cellStyles.header,
                                                      )}
                                                  >
                                                      {totalLabel.fieldId
                                                          ? `Total ${getFieldLabel(
                                                                totalLabel.fieldId,
                                                            )}`
                                                          : `Total`}
                                                  </HeaderCell>
                                              ) : (
                                                  <th
                                                      key={`header-total-${headerRowIndex}-${headerColIndex}`}
                                                      className={cellCx(
                                                          cellStyles.root,
                                                          cellStyles.rowNumber,
                                                      )}
                                                  />
                                              ),
                                      )
                                    : null}
                            </>
                        </tr>
                    );
                })}
            </thead>

            <tbody>
                {paddingTop > 0 && (
                    <VirtualizedArea
                        cellCount={cellsCountWithRowNumber}
                        padding={paddingTop}
                        cellClassName={cellCx(
                            cellStyles.root,
                            cellStyles.rowNumber,
                        )}
                    />
                )}
                {virtualRows.map(({ index: rowIndex }) => {
                    const row = data.dataValues[rowIndex];
                    return (
                        <tr key={`row-${rowIndex}`}>
                            <>
                                {!hideRowNumbers && (
                                    <td
                                        className={cellCx(
                                            cellStyles.root,
                                            cellStyles.rowNumber,
                                        )}
                                    >
                                        {rowIndex + 1}
                                    </td>
                                )}

                                {/* renders empty rows if there are no index values but titles */}
                                {data.indexValueTypes.length === 0 &&
                                    data.titleFields[0].map(
                                        (_titleField, titleFieldIndex) => (
                                            <td
                                                key={`empty-title-${rowIndex}-${titleFieldIndex}`}
                                                className={cellCx(
                                                    cellStyles.root,
                                                )}
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
                                        const field = getField(
                                            indexValue.fieldId,
                                        );
                                        const isLabel =
                                            indexValue.type === 'label';

                                        const description =
                                            isLabel && isField(field)
                                                ? field.description
                                                : undefined;

                                        return (
                                            <IndexCell
                                                key={`index-${rowIndex}-${indexColIndex}`}
                                                className={cellCx(
                                                    cellStyles.root,
                                                    cellStyles.header,
                                                )}
                                                description={description}
                                            >
                                                {isLabel
                                                    ? getFieldLabel(
                                                          indexValue.fieldId,
                                                      )
                                                    : indexValue.value
                                                          .formatted}
                                            </IndexCell>
                                        );
                                    },
                                )}

                                {/* renders the pivot values */}
                                {row.map((value, colIndex) => {
                                    const item = getItemFromAxis(
                                        rowIndex,
                                        colIndex,
                                    );

                                    return (
                                        <ValueCell
                                            key={`value-${rowIndex}-${colIndex}`}
                                            item={item}
                                            value={value}
                                            colIndex={colIndex}
                                            rowIndex={rowIndex}
                                            getField={getField}
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
                                                  <TotalCell
                                                      value={value}
                                                      key={`index-total-${rowIndex}-${colIndex}`}
                                                  >
                                                      {value.formatted}
                                                  </TotalCell>
                                              ) : (
                                                  <td
                                                      className={cellCx(
                                                          cellStyles.root,
                                                      )}
                                                  />
                                              );
                                          },
                                      )
                                    : null}
                            </>
                        </tr>
                    );
                })}
                {paddingBottom > 0 && (
                    <VirtualizedArea
                        cellCount={cellsCountWithRowNumber}
                        padding={paddingBottom}
                        cellClassName={cellCx(
                            cellStyles.root,
                            cellStyles.rowNumber,
                        )}
                    />
                )}
            </tbody>

            {hasColumnTotals ? (
                <tfoot>
                    {data.columnTotals?.map((row, totalRowIndex) => (
                        <tr key={`column-total-${totalRowIndex}`}>
                            {/* shows empty cell if row numbers are visible */}
                            {hideRowNumbers ? null : (
                                <th
                                    className={cellCx(
                                        cellStyles.root,
                                        cellStyles.rowNumber,
                                    )}
                                />
                            )}

                            {/* render the total label */}
                            {data.columnTotalFields?.[totalRowIndex].map(
                                (totalLabel, totalColIndex) =>
                                    totalLabel ? (
                                        <HeaderCell
                                            key={`footer-total-${totalRowIndex}-${totalColIndex}`}
                                            textAlign="right"
                                            className={cellCx(
                                                cellStyles.root,
                                                cellStyles.header,
                                            )}
                                        >
                                            {totalLabel.fieldId
                                                ? `Total ${getFieldLabel(
                                                      totalLabel.fieldId,
                                                  )}`
                                                : `Total`}
                                        </HeaderCell>
                                    ) : (
                                        <th
                                            key={`footer-total-${totalRowIndex}-${totalColIndex}`}
                                            className={cellCx(
                                                cellStyles.root,
                                                cellStyles.rowNumber,
                                            )}
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
                                    <TotalCell
                                        key={`column-total-${totalRowIndex}-${totalColIndex}`}
                                        value={value}
                                    >
                                        {value.formatted}
                                    </TotalCell>
                                ) : (
                                    <td
                                        key={`footer-total-${totalRowIndex}-${totalColIndex}`}
                                        className={cellCx(
                                            cellStyles.root,
                                            cellStyles.rowNumber,
                                        )}
                                    />
                                );
                            })}

                            {hasRowTotals
                                ? data.rowTotalFields?.[0].map((_, index) => (
                                      <td
                                          key={`footer-empty-${totalRowIndex}-${index}`}
                                          className={cellCx(
                                              cellStyles.root,
                                              cellStyles.rowNumber,
                                          )}
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
