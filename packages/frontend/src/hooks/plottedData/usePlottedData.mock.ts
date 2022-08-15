import { ResultRow } from '@lightdash/common';

export const RESULTS_FOR_SIMPLE_PIVOT: ResultRow[] = [
    {
        dim1: { value: { raw: 1, formatted: 1 } },
        dim2: { value: { raw: true, formatted: 'yes' } },
        metric1: { value: { raw: 10, formatted: 10 } },
    },
    {
        dim1: { value: { raw: 1, formatted: 1 } },
        dim2: { value: { raw: false, formatted: 'false' } },
        metric1: { value: { raw: 20, formatted: 20 } },
    },
    {
        dim1: { value: { raw: 3, formatted: 1 } },
        dim2: { value: { raw: true, formatted: 'yes' } },
        metric1: { value: { raw: 30, formatted: 30 } },
    },
];

export const EXPECTED_SIMPLE_PIVOT_RESULTS: ResultRow[] = [
    {
        dim1: { value: { raw: 1, formatted: 1 } },
        'metric1.dim2.true': { value: { raw: 10, formatted: 10 } },
        'metric1.dim2.false': { value: { raw: 20, formatted: 20 } },
    },
    {
        dim1: { value: { raw: 3, formatted: 1 } },
        'metric1.dim2.true': { value: { raw: 30, formatted: 30 } },
    },
];

export const RESULTS_FOR_PIVOT_WITH_MULTIPLE_DIMENSIONS: ResultRow[] = [
    {
        dim1: { value: { raw: 1, formatted: 1 } },
        dim2: { value: { raw: true, formatted: 'yes' } },
        dim3: { value: { raw: 'sales', formatted: 'Sales' } },
        metric1: { value: { raw: 10, formatted: 10 } },
    },
    {
        dim1: { value: { raw: 1, formatted: 1 } },
        dim2: { value: { raw: false, formatted: 'false' } },
        dim3: { value: { raw: 'sales', formatted: 'Sales' } },
        metric1: { value: { raw: 20, formatted: 20 } },
    },
    {
        dim1: { value: { raw: 1, formatted: 1 } },
        dim2: { value: { raw: false, formatted: 'false' } },
        dim3: { value: { raw: 'marketing', formatted: 'Marketing' } },
        metric1: { value: { raw: 30, formatted: 30 } },
    },
    {
        dim1: { value: { raw: 3, formatted: 3 } },
        dim2: { value: { raw: true, formatted: 'yes' } },
        dim3: { value: { raw: 'sales', formatted: 'Sales' } },
        metric1: { value: { raw: 40, formatted: 40 } },
    },
];

export const EXPECTED_PIVOT_RESULTS_WITH_ALL_DIMENSIONS: ResultRow[] = [
    {
        dim1: { value: { raw: 1, formatted: 1 } },
        dim2: { value: { raw: true, formatted: 'yes' } },
        'metric1.dim3.sales': { value: { raw: 10, formatted: 10 } },
    },
    {
        dim1: { value: { raw: 1, formatted: 1 } },
        dim2: { value: { raw: false, formatted: 'false' } },
        'metric1.dim3.sales': { value: { raw: 20, formatted: 20 } },
        'metric1.dim3.marketing': { value: { raw: 30, formatted: 30 } },
    },
    {
        dim1: { value: { raw: 3, formatted: 3 } },
        dim2: { value: { raw: true, formatted: 'yes' } },
        'metric1.dim3.sales': { value: { raw: 40, formatted: 40 } },
    },
];

export const EXPECTED_PIVOT_RESULTS_WITH_SOME_DIMENSIONS: ResultRow[] = [
    {
        dim1: { value: { raw: 1, formatted: 1 } },
        'metric1.dim3.sales': { value: { raw: 20, formatted: 20 } },
        'metric1.dim3.marketing': { value: { raw: 30, formatted: 30 } },
    },
    {
        dim1: { value: { raw: 3, formatted: 3 } },
        'metric1.dim3.sales': { value: { raw: 40, formatted: 40 } },
    },
];

export const RESULTS_FOR_PIVOT_ON_ITSELF: ResultRow[] = [
    {
        dim1: { value: { raw: 1, formatted: 1 } },
        metric1: { value: { raw: 10, formatted: 10 } },
        metric2: { value: { raw: 10, formatted: 10 } },
    },
    {
        dim1: { value: { raw: 2, formatted: 2 } },
        metric1: { value: { raw: 20, formatted: 20 } },
        metric2: { value: { raw: 20, formatted: 20 } },
    },
    {
        dim1: { value: { raw: 3, formatted: 3 } },
        metric1: { value: { raw: 30, formatted: 30 } },
        metric2: { value: { raw: 30, formatted: 30 } },
    },
];

export const EXPECTED_PIVOT_ON_ITSELF_RESULTS: ResultRow[] = [
    {
        dim1: { value: { raw: 1, formatted: 1 } },
        'metric1.dim1.1': { value: { raw: 10, formatted: 10 } },
        'metric2.dim1.1': { value: { raw: 10, formatted: 10 } },
    },
    {
        dim1: { value: { raw: 2, formatted: 2 } },
        'metric1.dim1.2': { value: { raw: 20, formatted: 20 } },
        'metric2.dim1.2': { value: { raw: 20, formatted: 20 } },
    },
    {
        dim1: { value: { raw: 3, formatted: 3 } },
        'metric1.dim1.3': { value: { raw: 30, formatted: 30 } },
        'metric2.dim1.3': { value: { raw: 30, formatted: 30 } },
    },
];
