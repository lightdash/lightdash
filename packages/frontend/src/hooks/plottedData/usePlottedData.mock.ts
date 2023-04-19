import { ResultValue } from '@lightdash/common';
import { PivotValueMap, RowKeyMap } from './usePlottedData';

export const RESULTS_FOR_SIMPLE_PIVOT: Record<string, ResultValue>[] = [
    {
        dim1: { raw: 1, formatted: '1' },
        dim2: { raw: true, formatted: 'yes' },
        dim3: { raw: 'value1', formatted: 'value1' },
        metric1: { raw: 10, formatted: '10' },
    },
    {
        dim1: { raw: 1, formatted: '1' },
        dim2: { raw: false, formatted: 'false' },
        dim3: { raw: 'value2', formatted: 'value2' },
        metric1: { raw: 20, formatted: '20' },
    },
    {
        dim1: { raw: 3, formatted: '1' },
        dim2: { raw: true, formatted: 'yes' },
        dim3: { raw: 'value1', formatted: 'value1' },
        metric1: { raw: 30, formatted: '30' },
    },
];

export const EXPECTED_SIMPLE_PIVOT_RESULTS: Record<string, ResultValue>[] = [
    {
        dim1: { raw: 1, formatted: '1' },
        'metric1.dim2.true': { raw: 10, formatted: '10' },
        'metric1.dim2.false': { raw: 20, formatted: '20' },
    },
    {
        dim1: { raw: 3, formatted: '1' },
        'metric1.dim2.true': { raw: 30, formatted: '30' },
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

export const RESULTS_FOR_PIVOT_WITH_MULTIPLE_DIMENSIONS: Record<
    string,
    ResultValue
>[] = [
    {
        dim1: { raw: 1, formatted: '1' },
        dim2: { raw: true, formatted: 'yes' },
        dim3: { raw: 'sales', formatted: 'Sales' },
        metric1: { raw: 10, formatted: '10' },
    },
    {
        dim1: { raw: 1, formatted: '1' },
        dim2: { raw: false, formatted: 'false' },
        dim3: { raw: 'sales', formatted: 'Sales' },
        metric1: { raw: 20, formatted: '20' },
    },
    {
        dim1: { raw: 1, formatted: '1' },
        dim2: { raw: false, formatted: 'false' },
        dim3: { raw: 'marketing', formatted: 'Marketing' },
        metric1: { raw: 30, formatted: '30' },
    },
    {
        dim1: { raw: 3, formatted: '3' },
        dim2: { raw: true, formatted: 'yes' },
        dim3: { raw: 'sales', formatted: 'Sales' },
        metric1: { raw: 40, formatted: '40' },
    },
];

export const EXPECTED_PIVOT_RESULTS_WITH_ALL_DIMENSIONS: Record<
    string,
    ResultValue
>[] = [
    {
        dim1: { raw: 1, formatted: '1' },
        dim2: { raw: true, formatted: 'yes' },
        'metric1.dim3.sales': { raw: 10, formatted: '10' },
    },
    {
        dim1: { raw: 1, formatted: '1' },
        dim2: { raw: false, formatted: 'false' },
        'metric1.dim3.sales': { raw: 20, formatted: '20' },
        'metric1.dim3.marketing': { raw: 30, formatted: '30' },
    },
    {
        dim1: { raw: 3, formatted: '3' },
        dim2: { raw: true, formatted: 'yes' },
        'metric1.dim3.sales': { raw: 40, formatted: '40' },
    },
];

export const EXPECTED_PIVOT_RESULTS_WITH_SOME_DIMENSIONS: Record<
    string,
    ResultValue
>[] = [
    {
        dim1: { raw: 1, formatted: '1' },
        'metric1.dim3.sales': { raw: 20, formatted: '20' },
        'metric1.dim3.marketing': { raw: 30, formatted: '30' },
    },
    {
        dim1: { raw: 3, formatted: '3' },
        'metric1.dim3.sales': { raw: 40, formatted: '40' },
    },
];

export const RESULTS_FOR_PIVOT_ON_ITSELF: Record<string, ResultValue>[] = [
    {
        dim1: { raw: 1, formatted: '1' },
        metric1: { raw: 10, formatted: '10' },
        metric2: { raw: 10, formatted: '10' },
    },
    {
        dim1: { raw: 2, formatted: '2' },
        metric1: { raw: 20, formatted: '20' },
        metric2: { raw: 20, formatted: '20' },
    },
    {
        dim1: { raw: 3, formatted: '3' },
        metric1: { raw: 30, formatted: '30' },
        metric2: { raw: 30, formatted: '30' },
    },
];

export const EXPECTED_PIVOT_ON_ITSELF_RESULTS: Record<string, ResultValue>[] = [
    {
        dim1: { raw: 1, formatted: '1' },
        'metric1.dim1.1': { raw: 10, formatted: '10' },
        'metric2.dim1.1': { raw: 10, formatted: '10' },
    },
    {
        dim1: { raw: 2, formatted: '2' },
        'metric1.dim1.2': { raw: 20, formatted: '20' },
        'metric2.dim1.2': { raw: 20, formatted: '20' },
    },
    {
        dim1: { raw: 3, formatted: '3' },
        'metric1.dim1.3': { raw: 30, formatted: '30' },
        'metric2.dim1.3': { raw: 30, formatted: '30' },
    },
];

export const EXPECTED_PIVOT_RESULTS_WITH_SAME_FIELD_PIVOTED_AND_NON_PIVOTED: Record<
    string,
    ResultValue
>[] = [
    {
        metric1: { formatted: '10', raw: 10 },
        'metric1.dim1.1': { raw: 10, formatted: '10' },
    },
    {
        metric1: { formatted: '20', raw: 20 },
        'metric1.dim1.1': { raw: 20, formatted: '20' },
    },
    {
        metric1: { formatted: '30', raw: 30 },
        'metric1.dim1.3': { raw: 30, formatted: '30' },
    },
];

export const RESULTS_FOR_MULTIPLE_PIVOT: Record<string, ResultValue>[] = [
    ...RESULTS_FOR_SIMPLE_PIVOT,
    {
        dim1: { raw: 1, formatted: '1' },
        dim2: { raw: true, formatted: 'yes' },
        dim3: { raw: 'value2', formatted: 'value2' },
        metric1: { raw: 50, formatted: '50' },
    },
];

export const EXPECTED_MULTIPLE_PIVOT_RESULTS: Record<string, ResultValue>[] = [
    {
        dim1: { raw: 1, formatted: '1' },
        'metric1.dim2.true.dim3.value1': { raw: 10, formatted: '10' },
        'metric1.dim2.true.dim3.value2': { raw: 50, formatted: '50' },
        'metric1.dim2.false.dim3.value2': { raw: 20, formatted: '20' },
    },
    {
        dim1: { raw: 3, formatted: '1' },
        'metric1.dim2.true.dim3.value1': { raw: 30, formatted: '30' },
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
