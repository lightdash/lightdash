import { ConditionalOperator } from '../types/conditionalRule';
import { AndFilterGroup, FilterRule, OrFilterGroup } from '../types/filter';

export const chartAndFilterGroup: AndFilterGroup = {
    id: 'fillter-group-1',
    and: [
        {
            id: '1',
            target: { fieldId: 'field-1' },
            values: ['1'],
            disabled: false,
            operator: ConditionalOperator.EQUALS,
        },
        {
            id: '2',
            target: { fieldId: 'field-2' },
            values: ['2'],
            disabled: false,
            operator: ConditionalOperator.EQUALS,
        },
    ],
};

export const chartOrFilterGroup: OrFilterGroup = {
    id: 'fillter-group-1',
    or: [
        {
            id: '3',
            target: { fieldId: 'field-1' },
            values: ['1'],
            disabled: false,
            operator: ConditionalOperator.EQUALS,
        },
        {
            id: '4',
            target: { fieldId: 'field-2' },
            values: ['2'],
            disabled: false,
            operator: ConditionalOperator.EQUALS,
        },
    ],
};

export const dashboardFilterWithSameTargetAndOperator: FilterRule[] = [
    {
        id: '5',
        target: { fieldId: 'field-1' },
        values: ['1', '2', '3'],
        disabled: false,
        operator: ConditionalOperator.EQUALS,
    },
];

export const dashboardFilterWithSameTargetButDifferentOperator: FilterRule[] = [
    {
        id: '5',
        target: { fieldId: 'field-1' },
        values: ['1', '2', '3'],
        disabled: false,
        operator: ConditionalOperator.NOT_EQUALS,
    },
];
