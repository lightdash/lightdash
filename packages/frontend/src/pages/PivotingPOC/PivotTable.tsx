import { PivotData } from '@lightdash/common';
import { createStyles, Table, TableProps } from '@mantine/core';
import { FC } from 'react';

const useStyles = createStyles((theme) => ({
    table: {
        '& td, & th': {
            whiteSpace: 'nowrap',
        },
    },
    header: {
        fontWeight: 'bold',
        backgroundColor: theme.colors.gray[0],
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
                    (_headerValueType, headerValueTypeIndex) => {
                        const headerValues =
                            data.headerValues[headerValueTypeIndex];

                        return (
                            <tr key={headerValueTypeIndex}>
                                <>
                                    {data.indexValueTypes.map(
                                        (_indexValueType, indexValueIndex) => (
                                            // empty
                                            <th key={indexValueIndex} />
                                        ),
                                    )}

                                    {headerValues.map(
                                        (headerValue, headerValueIndex) => (
                                            <th
                                                key={headerValueIndex}
                                                className={classes.header}
                                            >
                                                {headerValue?.formatted}
                                            </th>
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
                            {data.indexValueTypes.map(
                                (_indexValueType, indexValueTypeIndex) => {
                                    return (
                                        <td
                                            key={indexValueTypeIndex}
                                            className={classes.header}
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
                                    <td key={rowIndex}>{value?.formatted}</td>
                                );
                            })}
                        </>
                    </tr>
                ))}
            </tbody>
        </Table>
    );
};

export default PivotTable;
