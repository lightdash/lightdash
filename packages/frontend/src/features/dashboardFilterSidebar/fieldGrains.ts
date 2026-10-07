import {
    getDashboardFilterableFieldKey,
    isDimension,
    timeFrameConfigs,
    TimeFrames,
    type DashboardFilterableField,
} from '@lightdash/common';

export type FieldRowItem = {
    key: string;
    label: string;
    tableLabel: string;
    /** The field a click picks; for a folded group this is the DAY grain. */
    field: DashboardFilterableField;
    /** Every field the row stands for, including the picked one. */
    members: DashboardFilterableField[];
};

const getTableLabel = (field: DashboardFilterableField) =>
    field.tableLabel || field.table;

const getGrainLabel = (field: DashboardFilterableField) => {
    if (!isDimension(field) || !field.timeInterval) return null;
    return (
        field.timeIntervalLabel ??
        timeFrameConfigs[field.timeInterval].getLabel()
    );
};

const stripGrainSuffix = (label: string, grainLabel: string) => {
    const suffix = ` ${grainLabel}`.toLowerCase();
    return label.toLowerCase().endsWith(suffix)
        ? label.slice(0, label.length - suffix.length).trim()
        : label;
};

const getGroupKey = (field: DashboardFilterableField) => {
    const baseName =
        isDimension(field) && field.timeIntervalBaseDimensionName
            ? field.timeIntervalBaseDimensionName
            : field.name;
    return `${field.table}.${baseName}`;
};

const pickGrain = (
    base: DashboardFilterableField | undefined,
    grains: DashboardFilterableField[],
) => {
    const day = grains.find(
        (grain) => isDimension(grain) && grain.timeInterval === TimeFrames.DAY,
    );
    return day ?? base ?? grains[0];
};

/** Folds the time grains of one base dimension into a single row. */
export const foldFieldGrains = (
    fields: DashboardFilterableField[],
): FieldRowItem[] => {
    const groups = new Map<string, DashboardFilterableField[]>();
    fields.forEach((field) => {
        const key = getGroupKey(field);
        groups.set(key, [...(groups.get(key) ?? []), field]);
    });

    return [...groups.entries()].map(([key, members]) => {
        const grains = members.filter((member) => getGrainLabel(member));
        const base = members.find((member) => !getGrainLabel(member));
        if (grains.length === 0) {
            const single = members[0];
            return {
                key: getDashboardFilterableFieldKey(single),
                label: single.label,
                tableLabel: getTableLabel(single),
                field: single,
                members,
            };
        }
        const picked = pickGrain(base, grains);
        const first = grains[0];
        const label =
            base?.label ??
            stripGrainSuffix(first.label, getGrainLabel(first) ?? '');
        return {
            key,
            label,
            tableLabel: getTableLabel(picked),
            field: picked,
            members,
        };
    });
};

export const matchesSearch = (
    field: DashboardFilterableField,
    search: string,
) => {
    const needle = search.trim().toLowerCase();
    return (
        field.label.toLowerCase().includes(needle) ||
        getTableLabel(field).toLowerCase().includes(needle)
    );
};
