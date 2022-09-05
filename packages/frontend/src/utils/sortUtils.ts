import { Field, isField, TableCalculation } from '@lightdash/common';

export enum SortDirection {
    ASC = 'ASC',
    DESC = 'DESC',
}

export const getSortLabel = (
    item: Field | TableCalculation | undefined,
    direction: SortDirection,
) => {
    if (isField(item)) {
        switch (item.type) {
            case 'number':
                return direction === SortDirection.ASC ? '1-9' : '9-1';
            case 'string':
                return direction === SortDirection.ASC ? 'A-Z' : 'Z-A';
            default:
                return direction === SortDirection.ASC
                    ? 'First-Last'
                    : 'Last-First';
        }
    } else {
        return direction === SortDirection.ASC ? 'Low-High' : 'Last-First';
    }
};
