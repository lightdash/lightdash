import {
    getFilterTypeFromItemType,
    type DashboardFilterableField,
    type FilterType,
} from '@lightdash/common';

export const getFieldKind = (field: DashboardFilterableField): FilterType =>
    getFilterTypeFromItemType(field.type);

export const filterFieldsByKind = (
    fields: DashboardFilterableField[],
    kind: FilterType | null,
): DashboardFilterableField[] =>
    kind === null
        ? fields
        : fields.filter((field) => getFieldKind(field) === kind);
