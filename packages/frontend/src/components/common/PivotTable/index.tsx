import { FieldType, PivotData } from '@lightdash/common';
import { Menu, Table, TableProps } from '@mantine/core';
import { IconArrowBarToDown, IconCopy, IconStack } from '@tabler/icons-react';
import React, { FC } from 'react';
import MantineIcon from '../MantineIcon';
import HeaderCell from './HeaderCell';
import IndexCell from './IndexCell';
import { useStyles } from './UseStyles';

type PivotTableProps = TableProps &
    React.RefAttributes<HTMLTableElement> & {
        data: PivotData;
        getMetricLabel?: (fieldId: string | null | undefined) => string;
    };

const PivotTable: FC<PivotTableProps> = ({
    data,
    getMetricLabel,
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
                                        (_indexValueType, indexValueIndex) => (
                                            // empty
                                            <th key={indexValueIndex} />
                                        ),
                                    )}

                                    {headerValues.map(
                                        (headerValue, headerValueIndex) => {
                                            const label =
                                                headerValueType.type ===
                                                    FieldType.METRIC &&
                                                getMetricLabel
                                                    ? getMetricLabel(
                                                          headerValue?.formatted,
                                                      )
                                                    : headerValue?.formatted;
                                            return (
                                                <HeaderCell
                                                    label={label}
                                                    key={headerValueIndex}
                                                />
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
                            {data.indexValueTypes.map(
                                (indexValueType, indexValueTypeIndex) => {
                                    const d =
                                        data.indexValues[i][indexValueTypeIndex]
                                            ?.formatted;
                                    const label =
                                        indexValueType.type ===
                                            FieldType.METRIC && getMetricLabel
                                            ? getMetricLabel(d)
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
                                <Menu
                                    key={rowIndex}
                                    withinPortal
                                    shadow="md"
                                    offset={-1}
                                    position="bottom-end"
                                    radius="xs"
                                >
                                    <Menu.Target>
                                        <td>{value?.formatted}</td>
                                    </Menu.Target>

                                    <Menu.Dropdown>
                                        <Menu.Item
                                            icon={
                                                <MantineIcon
                                                    icon={IconCopy}
                                                    size="md"
                                                    fillOpacity={0}
                                                />
                                            }
                                        >
                                            Copy
                                        </Menu.Item>

                                        <Menu.Item
                                            icon={
                                                <MantineIcon
                                                    icon={IconStack}
                                                    size="md"
                                                    fillOpacity={0}
                                                />
                                            }
                                        >
                                            View underlying data
                                        </Menu.Item>

                                        <Menu.Item
                                            icon={
                                                <MantineIcon
                                                    icon={IconArrowBarToDown}
                                                    size="md"
                                                    fillOpacity={0}
                                                />
                                            }
                                        >
                                            Drill into "{value?.formatted}"
                                        </Menu.Item>
                                    </Menu.Dropdown>
                                </Menu>
                            ))}
                        </>
                    </tr>
                ))}
            </tbody>
        </Table>
    );
};

export default PivotTable;
