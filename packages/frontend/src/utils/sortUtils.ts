import { FilterableField } from '@lightdash/common';

export enum SortDirection {
    ASC = 'ASC',
    DESC = 'DESC',
}

export const getSortLabel = (
    item: FilterableField,
    direction: SortDirection,
) => {
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
};
