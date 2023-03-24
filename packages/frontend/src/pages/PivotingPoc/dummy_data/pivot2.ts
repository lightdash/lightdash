import { FieldType, PivotData } from '@lightdash/common';

const pivot2: PivotData = {
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

export { pivot2 };
