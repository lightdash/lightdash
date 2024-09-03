import { ThresholdOperator, ThresholdOptions } from '@lightdash/common';

export const thresholdLessThanMock: ThresholdOptions = {
    operator: ThresholdOperator.LESS_THAN,
    fieldId: 'revenue',
    value: 1000,
};

export const thresholdIncreasedByMock: ThresholdOptions = {
    operator: ThresholdOperator.INCREASED_BY,
    fieldId: 'revenue',
    value: 0.01,
};

export const resultsWithOneRow = [
    {
        revenue: 100,
    },
];

// 10% increase
export const resultsWithTwoIncreasingRows = [
    {
        revenue: 110,
    },
    {
        revenue: 100,
    },
];
// 10% decrease
export const resultsWithTwoDecreasingRows = [
    {
        revenue: 100,
    },
    {
        revenue: 110,
    },
];
