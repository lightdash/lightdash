import { type ResultRow } from '@lightdash/common';
import { type PivotValueMap, type RowKeyMap } from './getPlottedData';

export const RESULTS_FOR_SIMPLE_PIVOT: ResultRow[] = [
    {
        dim1: { value: { raw: 1, formatted: '1' } },
        dim2: { value: { raw: true, formatted: 'yes' } },
        dim3: { value: { raw: 'value1', formatted: 'value1' } },
        metric1: { value: { raw: 10, formatted: '10' } },
    },
    {
        dim1: { value: { raw: 1, formatted: '1' } },
        dim2: { value: { raw: false, formatted: 'false' } },
        dim3: { value: { raw: 'value2', formatted: 'value2' } },
        metric1: { value: { raw: 20, formatted: '20' } },
    },
    {
        dim1: { value: { raw: 3, formatted: '1' } },
        dim2: { value: { raw: true, formatted: 'yes' } },
        dim3: { value: { raw: 'value1', formatted: 'value1' } },
        metric1: { value: { raw: 30, formatted: '30' } },
    },
];

export const EXPECTED_SIMPLE_PIVOT_RESULTS: ResultRow[] = [
    {
        dim1: { value: { raw: 1, formatted: '1' } },
        'metric1.dim2.true': { value: { raw: 10, formatted: '10' } },
        'metric1.dim2.false': { value: { raw: 20, formatted: '20' } },
    },
    {
        dim1: { value: { raw: 3, formatted: '1' } },
        'metric1.dim2.true': { value: { raw: 30, formatted: '30' } },
    },
];

export const EXPECTED_SIMPLE_PIVOT_ROW_KEY_MAP: RowKeyMap = {
    dim1: 'dim1',
    'metric1.dim2.true': {
        field: 'metric1',
        pivotValues: [
            {
                field: 'dim2',
                value: true,
            },
        ],
    },
    'metric1.dim2.false': {
        field: 'metric1',
        pivotValues: [
            {
                field: 'dim2',
                value: false,
            },
        ],
    },
};

export const EXPECTED_SIMPLE_PIVOT_VALUE_MAP: PivotValueMap = {
    dim2: {
        true: {
            raw: true,
            formatted: 'yes',
        },
        false: {
            raw: false,
            formatted: 'false',
        },
    },
};

export const RESULTS_FOR_PIVOT_WITH_MULTIPLE_DIMENSIONS: ResultRow[] = [
    {
        dim1: { value: { raw: 1, formatted: '1' } },
        dim2: { value: { raw: true, formatted: 'yes' } },
        dim3: { value: { raw: 'sales', formatted: 'Sales' } },
        metric1: { value: { raw: 10, formatted: '10' } },
    },
    {
        dim1: { value: { raw: 1, formatted: '1' } },
        dim2: { value: { raw: false, formatted: 'false' } },
        dim3: { value: { raw: 'sales', formatted: 'Sales' } },
        metric1: { value: { raw: 20, formatted: '20' } },
    },
    {
        dim1: { value: { raw: 1, formatted: '1' } },
        dim2: { value: { raw: false, formatted: 'false' } },
        dim3: { value: { raw: 'marketing', formatted: 'Marketing' } },
        metric1: { value: { raw: 30, formatted: '30' } },
    },
    {
        dim1: { value: { raw: 3, formatted: '3' } },
        dim2: { value: { raw: true, formatted: 'yes' } },
        dim3: { value: { raw: 'sales', formatted: 'Sales' } },
        metric1: { value: { raw: 40, formatted: '40' } },
    },
];

export const EXPECTED_PIVOT_RESULTS_WITH_ALL_DIMENSIONS: ResultRow[] = [
    {
        dim1: { value: { raw: 1, formatted: '1' } },
        dim2: { value: { raw: true, formatted: 'yes' } },
        'metric1.dim3.sales': { value: { raw: 10, formatted: '10' } },
    },
    {
        dim1: { value: { raw: 1, formatted: '1' } },
        dim2: { value: { raw: false, formatted: 'false' } },
        'metric1.dim3.sales': { value: { raw: 20, formatted: '20' } },
        'metric1.dim3.marketing': { value: { raw: 30, formatted: '30' } },
    },
    {
        dim1: { value: { raw: 3, formatted: '3' } },
        dim2: { value: { raw: true, formatted: 'yes' } },
        'metric1.dim3.sales': { value: { raw: 40, formatted: '40' } },
    },
];

export const EXPECTED_PIVOT_RESULTS_WITH_SOME_DIMENSIONS: ResultRow[] = [
    {
        dim1: { value: { raw: 1, formatted: '1' } },
        'metric1.dim3.sales': { value: { raw: 20, formatted: '20' } },
        'metric1.dim3.marketing': { value: { raw: 30, formatted: '30' } },
    },
    {
        dim1: { value: { raw: 3, formatted: '3' } },
        'metric1.dim3.sales': { value: { raw: 40, formatted: '40' } },
    },
];

export const RESULTS_FOR_PIVOT_ON_ITSELF: ResultRow[] = [
    {
        dim1: { value: { raw: 1, formatted: '1' } },
        metric1: { value: { raw: 10, formatted: '10' } },
        metric2: { value: { raw: 10, formatted: '10' } },
    },
    {
        dim1: { value: { raw: 2, formatted: '2' } },
        metric1: { value: { raw: 20, formatted: '20' } },
        metric2: { value: { raw: 20, formatted: '20' } },
    },
    {
        dim1: { value: { raw: 3, formatted: '3' } },
        metric1: { value: { raw: 30, formatted: '30' } },
        metric2: { value: { raw: 30, formatted: '30' } },
    },
];

export const EXPECTED_PIVOT_ON_ITSELF_RESULTS: ResultRow[] = [
    {
        dim1: { value: { raw: 1, formatted: '1' } },
        'metric1.dim1.1': { value: { raw: 10, formatted: '10' } },
        'metric2.dim1.1': { value: { raw: 10, formatted: '10' } },
    },
    {
        dim1: { value: { raw: 2, formatted: '2' } },
        'metric1.dim1.2': { value: { raw: 20, formatted: '20' } },
        'metric2.dim1.2': { value: { raw: 20, formatted: '20' } },
    },
    {
        dim1: { value: { raw: 3, formatted: '3' } },
        'metric1.dim1.3': { value: { raw: 30, formatted: '30' } },
        'metric2.dim1.3': { value: { raw: 30, formatted: '30' } },
    },
];

export const EXPECTED_PIVOT_RESULTS_WITH_SAME_FIELD_PIVOTED_AND_NON_PIVOTED: ResultRow[] =
    [
        {
            metric1: {
                value: {
                    formatted: '10',
                    raw: 10,
                },
            },
            'metric1.dim1.1': { value: { raw: 10, formatted: '10' } },
        },
        {
            metric1: {
                value: {
                    formatted: '20',
                    raw: 20,
                },
            },
            'metric1.dim1.1': { value: { raw: 20, formatted: '20' } },
        },
        {
            metric1: {
                value: {
                    formatted: '30',
                    raw: 30,
                },
            },
            'metric1.dim1.3': { value: { raw: 30, formatted: '30' } },
        },
    ];

export const RESULTS_FOR_MULTIPLE_PIVOT: ResultRow[] = [
    ...RESULTS_FOR_SIMPLE_PIVOT,
    {
        dim1: { value: { raw: 1, formatted: '1' } },
        dim2: { value: { raw: true, formatted: 'yes' } },
        dim3: { value: { raw: 'value2', formatted: 'value2' } },
        metric1: { value: { raw: 50, formatted: '50' } },
    },
];

export const EXPECTED_MULTIPLE_PIVOT_RESULTS: ResultRow[] = [
    {
        dim1: { value: { raw: 1, formatted: '1' } },
        'metric1.dim2.true.dim3.value1': {
            value: { raw: 10, formatted: '10' },
        },
        'metric1.dim2.true.dim3.value2': {
            value: { raw: 50, formatted: '50' },
        },
        'metric1.dim2.false.dim3.value2': {
            value: { raw: 20, formatted: '20' },
        },
    },
    {
        dim1: { value: { raw: 3, formatted: '1' } },
        'metric1.dim2.true.dim3.value1': {
            value: { raw: 30, formatted: '30' },
        },
    },
];

export const EXPECTED_MULTIPLE_PIVOT_ROW_KEY_MAP: RowKeyMap = {
    dim1: 'dim1',
    'metric1.dim2.true.dim3.value1': {
        field: 'metric1',
        pivotValues: [
            {
                field: 'dim2',
                value: true,
            },
            {
                field: 'dim3',
                value: 'value1',
            },
        ],
    },
    'metric1.dim2.true.dim3.value2': {
        field: 'metric1',
        pivotValues: [
            {
                field: 'dim2',
                value: true,
            },
            {
                field: 'dim3',
                value: 'value2',
            },
        ],
    },
    'metric1.dim2.false.dim3.value2': {
        field: 'metric1',
        pivotValues: [
            {
                field: 'dim2',
                value: false,
            },
            {
                field: 'dim3',
                value: 'value2',
            },
        ],
    },
};

export const EXPECTED_MULTIPLE_PIVOT_VALUE_MAP: PivotValueMap = {
    dim2: {
        true: {
            raw: true,
            formatted: 'yes',
        },
        false: {
            raw: false,
            formatted: 'false',
        },
    },
    dim3: {
        value1: {
            raw: 'value1',
            formatted: 'value1',
        },
        value2: {
            raw: 'value2',
            formatted: 'value2',
        },
    },
};
