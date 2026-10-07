import {
    FilterType,
    getFilterTypeFromItemType,
    type DashboardFilterableField,
} from '@lightdash/common';
import { type ParameterKind } from './parameterControls';

export type FieldKind = FilterType;

export const FIELD_KINDS: FieldKind[] = [
    FilterType.DATE,
    FilterType.STRING,
    FilterType.NUMBER,
    FilterType.BOOLEAN,
];

export const getFieldKind = (field: DashboardFilterableField): FieldKind =>
    getFilterTypeFromItemType(field.type);

export const filterFieldsByKind = (
    fields: DashboardFilterableField[],
    kind: FieldKind | null,
): DashboardFilterableField[] =>
    kind === null
        ? fields
        : fields.filter((field) => getFieldKind(field) === kind);

export const countFieldsByKind = (
    fields: DashboardFilterableField[],
): Record<FieldKind, number> =>
    fields.reduce(
        (counts, field) => ({
            ...counts,
            [getFieldKind(field)]: counts[getFieldKind(field)] + 1,
        }),
        { date: 0, string: 0, number: 0, boolean: 0 } as Record<
            FieldKind,
            number
        >,
    );

export type PickableParameter = {
    key: string;
    label: string;
    kind: ParameterKind;
    chartCount: number;
};

export const filterParametersByKind = (
    parameters: PickableParameter[],
    kind: FieldKind | null,
): PickableParameter[] =>
    kind === null
        ? parameters
        : parameters.filter((parameter) => parameter.kind === kind);

/** Kind tile counts: fields plus parameters of that kind. */
export const countPickableByKind = (
    fields: DashboardFilterableField[],
    parameters: PickableParameter[],
): Record<FieldKind, number> =>
    parameters.reduce(
        (counts, parameter) => ({
            ...counts,
            [parameter.kind]: counts[parameter.kind] + 1,
        }),
        countFieldsByKind(fields),
    );

export const matchesParameterSearch = (
    parameter: PickableParameter,
    search: string,
): boolean => {
    const needle = search.trim().toLowerCase();
    return (
        needle !== '' &&
        (parameter.label.toLowerCase().includes(needle) ||
            parameter.key.toLowerCase().includes(needle))
    );
};

export type ExploreGroup = {
    table: string;
    label: string;
    /** Max chart count of its fields, a proxy for charts on that explore. */
    chartCount: number;
    fields: DashboardFilterableField[];
};

export const groupFieldsByExplore = (
    fields: DashboardFilterableField[],
    getChartCount: (field: DashboardFilterableField) => number,
): ExploreGroup[] => {
    const groups = new Map<string, ExploreGroup>();
    fields.forEach((field) => {
        const existing = groups.get(field.table);
        const chartCount = getChartCount(field);
        if (existing) {
            existing.fields.push(field);
            existing.chartCount = Math.max(existing.chartCount, chartCount);
        } else {
            groups.set(field.table, {
                table: field.table,
                label: field.tableLabel || field.table,
                chartCount,
                fields: [field],
            });
        }
    });
    return [...groups.values()].sort(
        (a, b) => b.chartCount - a.chartCount || a.label.localeCompare(b.label),
    );
};
