import { FieldType, PivotData } from '@lightdash/common';
import { createStyles, Divider, Stack, Table, Title } from '@mantine/core';
import { lastIndexOf } from 'lodash-es';
import { FC, useMemo } from 'react';
import { DIMENSIONS_DUMMY_DATA } from './dummy_data/dimensions';
import { METRICS_DUMMY_DATA } from './dummy_data/metrics';

const range = (end: number) => {
    return Array.from({ length: end }, (_, i) => i);
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

    columnTypes: [
        {
            type: FieldType.DIMENSION,
            fieldId: 'payments_payment_method',
        },
        { type: 'value' },
        { type: 'value' },
        { type: 'value' },
        { type: 'value' },
        { type: 'value' },
        { type: 'value' },
        { type: 'value' },
        { type: 'value' },
        { type: 'value' },
        { type: 'value' },
    ],

    rows: [
        ['bank_transfer', 14.86, 7, 9.25, 8, 27.25, 4, 13.71, 7, 19, 7],
        ['coupon', 20, 4, 24.5, 2, 25.67, 3, 9, 2, 12, 2],
        ['credit_card', 14.3, 9, 23.73, 10, 20.62, 12, 19, 10, 18.91, 10],
        ['gift_card', 13.5, 2, 29, 4, 12, 2, 15.5, 2, 25.5, 2],
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

    columnTypes: [
        {
            type: FieldType.DIMENSION,
            fieldId: 'orders_status',
        },
        {
            type: FieldType.DIMENSION,
            fieldId: 'payments_payment_method',
        },
        { type: 'value' },
        { type: 'value' },
    ],

    rows: [
        ['completed', 'bank_transfer', 14.86, 7],
        ['completed', 'coupon', 20, 4],
        ['completed', 'credit_card', 14.3, 9],
        ['completed', 'gift_card', 13.5, 2],
        ['placed', 'bank_transfer', 9.25, 8],
        ['placed', 'coupon', 24.5, 2],
        ['placed', 'credit_card', 23.73, 10],
        ['placed', 'gift_card', 29, 4],
        ['return_pending', 'bank_transfer', 27.25, 4],
        ['return_pending', 'coupon', 25.67, 3],
        ['return_pending', 'credit_card', 20.62, 12],
        ['return_pending', 'gift_card', 12, 2],
        ['returned', 'bank_transfer', 13.71, 7],
        ['returned', 'coupon', 9, 2],
        ['returned', 'credit_card', 19, 10],
        ['returned', 'gift_card', 15.5, 2],
        ['shipped', 'bank_transfer', 19, 7],
        ['shipped', 'coupon', 12, 2],
        ['shipped', 'credit_card', 18.91, 10],
        ['shipped', 'gift_card', 25.5, 2],
    ],

    rowTotals: [],
    columnTotals: [],
};

const RenderTable: FC<{ data: PivotData }> = ({ data }) => {
    const indexSize =
        data.columnTypes?.filter((c) => c.type !== 'value').length ?? 0;

    return (
        <Table withBorder withColumnBorders highlightOnHover>
            <thead>
                {data.headerValueTypes.map((headerValueType, i) => {
                    const headerValues = data.headerValues[i];

                    return (
                        <tr key={i}>
                            <>
                                {indexSize
                                    ? range(indexSize).map((_, j) => {
                                          return <th key={j}></th>;
                                      })
                                    : null}

                                {headerValues.map((headerValue, j) => {
                                    return (
                                        <th
                                            key={j}
                                            style={
                                                headerValueType.type ===
                                                FieldType.DIMENSION
                                                    ? {
                                                          backgroundColor:
                                                              'rgba(255,255,0,0.1)',
                                                      }
                                                    : {
                                                          backgroundColor:
                                                              'rgba(0,122,255,0.1)',
                                                      }
                                            }
                                        >
                                            {headerValue}
                                        </th>
                                    );
                                })}
                            </>
                        </tr>
                    );
                })}
            </thead>

            <tbody>
                {data.rows.map((row, i) => {
                    return (
                        <tr key={i}>
                            {row.map((value, j) => {
                                return (
                                    <td
                                        key={j}
                                        style={
                                            data.columnTypes[j].type ===
                                            FieldType.DIMENSION
                                                ? {
                                                      backgroundColor:
                                                          'rgba(255,255,0,0.1)',
                                                  }
                                                : data.columnTypes[j].type ===
                                                  FieldType.METRIC
                                                ? {
                                                      backgroundColor:
                                                          'rgba(0,122,255,0.1)',
                                                  }
                                                : {}
                                        }
                                    >
                                        {value}
                                    </td>
                                );
                            })}
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
