import {
    ConditionalFormattingConfig,
    Field,
    FieldType,
    PivotData,
    TableCalculation,
} from '@lightdash/common';
import { Table, TableProps } from '@mantine/core';
import React, { FC } from 'react';
import HeaderCell from './HeaderCell';
import IndexCell from './IndexCell';
import { useStyles } from './tableStyles';
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
    const { cx, classes } = useStyles();

    return (
        <Table
            withBorder
            withColumnBorders
            className={cx(classes.table, className)}
            w="xs"
            {...tableProps}
        >
            <thead>
                {data.headerValueTypes.map(
                    (headerValueType, headerValueTypeIndex) => {
                        const headerValues =
                            data.headerValues[headerValueTypeIndex];

                        const headerLevel =
                            data.headerValueTypes.length - headerValueTypeIndex;

                        return (
                            <tr key={headerValueTypeIndex}>
                                <>
                                    {!hideRowNumbers && (
                                        <th
                                            className={classes.rowNumberColumn}
                                        />
                                    )}

                                    {data.indexValueTypes.map(
                                        (_indexValueType, indexValueIndex) => {
                                            const titleField =
                                                data.titleFields[
                                                    headerValueTypeIndex
                                                ][indexValueIndex];

                                            return (
                                                <TitleCell
                                                    key={indexValueIndex}
                                                    title={titleField}
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
                                        (headerValue, headerValueIndex) => (
                                            <HeaderCell
                                                key={headerValueIndex}
                                                level={headerLevel}
                                            >
                                                {headerValueType.type ===
                                                    FieldType.METRIC &&
                                                headerValue?.formatted
                                                    ? getFieldLabel(
                                                          headerValue?.formatted,
                                                      )
                                                    : headerValue?.formatted}
                                            </HeaderCell>
                                        ),
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
                                <td className={classes.rowNumberColumn}>
                                    {i + 1}
                                </td>
                            )}

                            {data.indexValueTypes.map(
                                (indexValueType, indexValueTypeIndex) => {
                                    const d =
                                        data.indexValues[i][indexValueTypeIndex]
                                            ?.formatted;
                                    const label =
                                        indexValueType.type ===
                                            FieldType.METRIC && d
                                            ? getFieldLabel(d)
                                            : d;

                                    return (
                                        <IndexCell
                                            key={indexValueTypeIndex}
                                            label={label}
                                        />
                                    );
                                },
                            )}

                            {row.map((value, rowIndex) => (
                                <ValueCell
                                    key={rowIndex}
                                    value={value}
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
