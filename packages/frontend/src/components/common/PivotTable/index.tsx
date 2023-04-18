import {
    ConditionalFormattingConfig,
    Field,
    isField,
    PivotData,
    TableCalculation,
} from '@lightdash/common';
import { Table, TableProps } from '@mantine/core';
import React, { FC } from 'react';
import HeaderCell from './HeaderCell';
import IndexCell from './IndexCell';
import { usePivotTableCellStyles, usePivotTableStyles } from './tableStyles';
import TitleCell from './TitleCell';
import ValueCell from './ValueCell';

type PivotTableProps = TableProps &
    React.RefAttributes<HTMLTableElement> & {
        data: PivotData;
        conditionalFormattings: ConditionalFormattingConfig[];
        hideRowNumbers: boolean;
        getFieldLabel: (fieldId: string) => string | undefined;
        getField: (fieldId: string) => Field | TableCalculation;
    };

const PivotTable: FC<PivotTableProps> = ({
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

    const getUnderlyingFieldValues = useCallback(
        (rowIndex: number, colIndex: number) => {
            const field = data.dataValues[rowIndex][colIndex];

            const initialData =
                field && field.value ? { [field.fieldId]: field.value } : {};

            return [
                // get the index values for this row
                ...(data.indexValues[rowIndex] ?? []),
                // get the header values for this column
                ...(data.headerValues.map((hv) => hv[colIndex]) ?? []),
            ]
                .filter((iv) => iv.type === 'value')
                .reduce<UnderlyingValueMap>((acc, iv) => {
                    if (!iv.value) return acc;
                    return { ...acc, [iv.fieldId]: iv.value };
                }, initialData);
        },
        [data.indexValues, data.headerValues, data.dataValues],
    );

    return (
        <Table
            cellSpacing={1}
            unstyled
            withBorder
            withColumnBorders
            className={tableCx(tableStyles.root, className)}
            w="xs"
            {...tableProps}
        >
            <thead>
                {data.headerValueTypes.map(
                    (_headerValueType, headerValueTypeIndex) => {
                        const headerValues =
                            data.headerValues[headerValueTypeIndex];

                        const headerLevel =
                            data.headerValueTypes.length - headerValueTypeIndex;

                        return (
                            <tr key={headerValueTypeIndex}>
                                <>
                                    {!hideRowNumbers && (
                                        <th
                                            className={cellCx(
                                                cellStyles.root,
                                                cellStyles.rowNumber,
                                            )}
                                        />
                                    )}

                                    {data.indexValueTypes.map(
                                        (_indexValueType, indexValueIndex) => {
                                            const titleField =
                                                data.titleFields[
                                                    headerValueTypeIndex
                                                ][indexValueIndex];

                                            const field = titleField?.fieldId
                                                ? getField(titleField?.fieldId)
                                                : undefined;

                                            const isEmpty =
                                                !titleField?.fieldId;

                                            const isHeaderTitle =
                                                titleField?.titleDirection ===
                                                'header';

                                            return (
                                                <TitleCell
                                                    key={indexValueIndex}
                                                    className={cellCx(
                                                        cellStyles.root,
                                                        cellStyles.header,
                                                    )}
                                                    isEmpty={isEmpty}
                                                    isHeaderTitle={
                                                        isHeaderTitle
                                                    }
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

                                    {headerValues.map(
                                        (headerValue, headerValueIndex) => {
                                            const isLabel =
                                                headerValue.type === 'label';
                                            const field = getField(
                                                headerValue.fieldId,
                                            );

                                            const description =
                                                isLabel && isField(field)
                                                    ? field.description
                                                    : undefined;

                                            return (
                                                <HeaderCell
                                                    key={headerValueIndex}
                                                    className={cellCx(
                                                        cellStyles.root,
                                                        cellStyles.header,
                                                    )}
                                                    level={headerLevel}
                                                    description={description}
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
                                </>
                            </tr>
                        );
                    },
                )}
            </thead>

            <tbody>
                {data.dataValues.map((row, i) => (
                    <tr key={i}>
                        <>
                            {!hideRowNumbers && (
                                <td
                                    className={cellCx(
                                        cellStyles.root,
                                        cellStyles.rowNumber,
                                    )}
                                >
                                    {i + 1}
                                </td>
                            )}

                            {data.indexValueTypes.map((_indexValueType, j) => {
                                const indexValue = data.indexValues[i][j];
                                const field = getField(indexValue.fieldId);
                                const isLabel = indexValue.type === 'label';

                                const description =
                                    isLabel && isField(field)
                                        ? field.description
                                        : undefined;

                                return (
                                    <IndexCell
                                        key={`${i}-${j}`}
                                        className={cellCx(
                                            cellStyles.root,
                                            cellStyles.header,
                                        )}
                                        description={description}
                                    >
                                        {isLabel
                                            ? getFieldLabel(indexValue.fieldId)
                                            : indexValue.value.formatted}
                                    </IndexCell>
                                );
                            })}

                            {row.map((pivotValue, rowIndex) => (
                                <ValueCell
                                    key={rowIndex}
                                    row={row}
                                    value={pivotValue}
                                    getField={getField}
                                    conditionalFormattings={
                                        conditionalFormattings
                                    }
                                />
                            ))}
                        </>
                    </tr>
                ))}
            </tbody>
        </Table>
    );
};

export default PivotTable;
