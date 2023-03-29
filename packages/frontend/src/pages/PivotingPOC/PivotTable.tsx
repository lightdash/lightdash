import { assertUnreachable, FieldType, PivotData } from '@lightdash/common';
import { createStyles, Table, TableProps } from '@mantine/core';
import { FC } from 'react';

const getFieldColor = (fieldType: FieldType) => {
    switch (fieldType) {
        // TODO: update colours and constantize somewhere else.
        case FieldType.DIMENSION:
            return '#d2dbe9';
        case FieldType.METRIC:
            return '#e4dad0';
        default:
            return assertUnreachable(
                fieldType,
                "Can't get color for field type",
            );
    }
};

const useStyles = createStyles((_theme) => ({
    table: {
        '& td, & th': {
            whiteSpace: 'nowrap',
        },
    },
}));

type PivotTableProps = TableProps &
    React.RefAttributes<HTMLTableElement> & {
        data: PivotData;
    };

const PivotTable: FC<PivotTableProps> = ({
    data,
    className,
    ...tableProps
}) => {
    const { cx, classes } = useStyles();

    return (
        <Table
            withBorder
            withColumnBorders
            highlightOnHover
            className={cx(classes.table, className)}
            w="xs"
            {...tableProps}
        >
            <thead>
                {data.headerValueTypes.map(
                    (headerValueType, headerValueTypeIndex) => {
                        const headerValues =
                            data.headerValues[headerValueTypeIndex];

                        return (
                            <tr key={headerValueTypeIndex}>
                                <>
                                    {data.indexValueTypes.map(
                                        (_indexValueType, indexValueIndex) => {
                                            return (
                                                <th key={indexValueIndex}></th>
                                            );
                                        },
                                    )}

                                    {headerValues.map(
                                        (headerValue, headerValueIndex) => {
                                            return (
                                                <th
                                                    key={headerValueIndex}
                                                    style={{
                                                        backgroundColor:
                                                            getFieldColor(
                                                                headerValueType.type,
                                                            ),
                                                    }}
                                                >
                                                    {headerValue?.formatted}
                                                </th>
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
                {data.dataValues.map((row, i) => {
                    return (
                        <tr key={i}>
                            <>
                                {data.indexValueTypes.map(
                                    (indexValueType, indexValueTypeIndex) => {
                                        return (
                                            <td
                                                key={indexValueTypeIndex}
                                                style={{
                                                    backgroundColor:
                                                        getFieldColor(
                                                            indexValueType.type,
                                                        ),
                                                }}
                                            >
                                                {
                                                    data.indexValues[i][
                                                        indexValueTypeIndex
                                                    ]?.formatted
                                                }
                                            </td>
                                        );
                                    },
                                )}

                                {row.map((value, rowIndex) => {
                                    return (
                                        <td key={rowIndex}>
                                            {value?.formatted}
                                        </td>
                                    );
                                })}
                            </>
                        </tr>
                    );
                })}
            </tbody>
        </Table>
    );
};

export default PivotTable;
