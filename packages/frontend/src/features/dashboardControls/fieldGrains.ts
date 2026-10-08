import {
    isDimension,
    timeFrameConfigs,
    type DashboardFilterableField,
} from '@lightdash/common';

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

/** The one name a field goes by: its base dimension's label for a time grain. */
export const getFieldDisplayLabel = (
    field: DashboardFilterableField,
    fields: DashboardFilterableField[],
): string => {
    const grainLabel = getGrainLabel(field);
    if (!grainLabel) return field.label;
    const groupKey = getGroupKey(field);
    const base = fields.find(
        (candidate) =>
            getGroupKey(candidate) === groupKey && !getGrainLabel(candidate),
    );
    return base?.label ?? stripGrainSuffix(field.label, grainLabel);
};
