import { FieldType, PivotData } from '@lightdash/common';
import { dummyRawToFormattedAndRawRows } from './dummyUtils';

const pivot1: PivotData = {
    headerValueTypes: [
        {
            type: FieldType.DIMENSION,
            fieldId: 'orders_status',
        },
        {
            type: FieldType.METRIC,
        },
    ],
    headerValues: dummyRawToFormattedAndRawRows([
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
    ]),

    indexValueTypes: [
        {
            type: FieldType.DIMENSION,
            fieldId: 'payments_payment_method',
        },
    ],

    indexValues: dummyRawToFormattedAndRawRows([
        ['bank_transfer'],
        ['coupon'],
        ['credit_card'],
        ['gift_card'],
    ]),

    dataColumnCount: 10,

    dataValues: dummyRawToFormattedAndRawRows([
        [14.86, 7, 9.25, 8, 27.25, 4, 13.71, 7, 19, 7],
        [20, 4, 24.5, 2, 25.67, 3, 9, 2, 12, 2],
        [14.3, 9, 23.73, 10, 20.62, 12, 19, 10, 18.91, 10],
        [13.5, 2, 29, 4, 12, 2, 15.5, 2, 25.5, 2],
    ]),

    rowTotals: [],
    columnTotals: [],
};

export { pivot1 };
