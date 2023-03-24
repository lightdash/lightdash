import { assertUnreachable, FieldType, PivotData } from '@lightdash/common';
import { createStyles, Divider, Stack, Table, Title } from '@mantine/core';
import { lastIndexOf } from 'lodash-es';
import { FC, useMemo } from 'react';
import { DIMENSIONS_DUMMY_DATA } from './dummy_data/dimensions';
import { METRICS_DUMMY_DATA } from './dummy_data/metrics';

const getFieldColor = (fieldType: FieldType) => {
    switch (fieldType) {
        case FieldType.DIMENSION:
            return 'rgba(255,255,0,0.1)';
        case FieldType.METRIC:
            return 'rgba(0,122,255,0.1)';
        default:
            return assertUnreachable(
                fieldType,
                "Can't get color for field type",
            );
    }
};

const test1: PivotData = {
    headerValueTypes: [
        {
            type: FieldType.DIMENSION,
            fieldId: 'orders_status',
        },
        {
            type: FieldType.METRIC,
            // fieldId: 'orders_average_order_size',
        },
        // {
        //     type: FieldType.METRIC,
        //     fieldId: 'orders_unique_orders_count',
        // },
    ],
    headerValues: [
        [
            'completed',
            // repeats when pivoted
            'completed',
            'placed',
            'placed',
            'return_pending',
            'return_pending',
            'returned',
            'returned',
            'shipped',
            'shipped',
        ],
        [
            'Average Order Size',
            'Unique Orders Count',
            'Average Order Size',
            'Unique Orders Count',
            'Average Order Size',
            'Unique Orders Count',
            'Average Order Size',
            'Unique Orders Count',
            'Average Order Size',
            'Unique Orders Count',
        ],
    ],

    indexValueTypes: [
        {
            type: FieldType.DIMENSION,
            fieldId: 'payments_payment_method',
        },
    ],

    indexValues: [
        ['bank_transfer'],
        ['coupon'],
        ['credit_card'],
        ['gift_card'],
    ],

    rows: [
        [14.86, 7, 9.25, 8, 27.25, 4, 13.71, 7, 19, 7],
        [20, 4, 24.5, 2, 25.67, 3, 9, 2, 12, 2],
        [14.3, 9, 23.73, 10, 20.62, 12, 19, 10, 18.91, 10],
        [13.5, 2, 29, 4, 12, 2, 15.5, 2, 25.5, 2],
    ],

    rowTotals: [],
    columnTotals: [],
};

const test2: PivotData = {
    headerValueTypes: [
        {
            type: FieldType.METRIC,
        },
    ],
    headerValues: [['Average Order Size', 'Unique Orders Count']],

    indexValueTypes: [
        {
            type: FieldType.DIMENSION,
            fieldId: 'orders_status',
        },
        {
            type: FieldType.DIMENSION,
            fieldId: 'payments_payment_method',
        },
    ],

    indexValues: [
        ['completed', 'bank_transfer'],
        ['completed', 'coupon'],
        ['completed', 'credit_card'],
        ['completed', 'gift_card'],
        ['placed', 'bank_transfer'],
        ['placed', 'coupon'],
        ['placed', 'credit_card'],
        ['placed', 'gift_card'],
        ['return_pending', 'bank_transfer'],
        ['return_pending', 'coupon'],
        ['return_pending', 'credit_card'],
        ['return_pending', 'gift_card'],
        ['returned', 'bank_transfer'],
        ['returned', 'coupon'],
        ['returned', 'credit_card'],
        ['returned', 'gift_card'],
        ['shipped', 'bank_transfer'],
        ['shipped', 'coupon'],
        ['shipped', 'credit_card'],
        ['shipped', 'gift_card'],
    ],

    rows: [
        [14.86, 7],
        [20, 4],
        [14.3, 9],
        [13.5, 2],
        [9.25, 8],
        [24.5, 2],
        [23.73, 10],
        [29, 4],
        [27.25, 4],
        [25.67, 3],
        [20.62, 12],
        [12, 2],
        [13.71, 7],
        [9, 2],
        [19, 10],
        [15.5, 2],
        [19, 7],
        [12, 2],
        [18.91, 10],
        [25.5, 2],
    ],

    rowTotals: [],
    columnTotals: [],
};

const RenderTable: FC<{ data: PivotData }> = ({ data }) => {
    return (
        <Table withBorder withColumnBorders highlightOnHover>
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
                                                    {headerValue}
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
                {data.rows.map((row, i) => {
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
                                                    ]
                                                }
                                            </td>
                                        );
                                    },
                                )}

                                {row.map((value, j) => {
                                    return <td key={j}>{value}</td>;
                                })}
                            </>
                        </tr>
                    );
                })}
            </tbody>
        </Table>
    );
};

const PivotingPOC = () => {
    return (
        <Stack spacing="lg">
            <Stack spacing="sm">
                <Title order={3}>Test 1</Title>
                <RenderTable data={test1} />
            </Stack>

            <Stack spacing="sm">
                <Title order={3}>Test 2</Title>
                <RenderTable data={test2} />
            </Stack>
        </Stack>
    );
};

export default PivotingPOC;
