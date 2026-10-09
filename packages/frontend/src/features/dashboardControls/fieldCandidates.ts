import {
    getItemId,
    isDimension,
    matchFieldByType,
    sortTimeFrames,
    type DashboardFilterableField,
} from '@lightdash/common';

export type FieldOption = { value: string; label: string };

// Fields a filter can still take: not one of its own and of exactly the
// target's type, which is the shipped tile targeting rule (`matchFieldByType`).
// A date and a timestamp do not match: one filter value cannot mean the same
// on both. Every grain of a date is a field of its own
export const getFieldCandidates = (
    fields: DashboardFilterableField[],
    takenFieldIds: string[],
    target: DashboardFilterableField,
): DashboardFilterableField[] => {
    const taken = new Set(takenFieldIds);
    const matchesTarget = matchFieldByType(target);
    return fields.filter(
        (field) => !taken.has(getItemId(field)) && matchesTarget(field),
    );
};

const getTableLabel = (field: DashboardFilterableField) =>
    field.tableLabel || field.table;

const getBaseName = (field: DashboardFilterableField) =>
    (isDimension(field) && field.timeIntervalBaseDimensionName) || field.name;

const getTimeInterval = (field: DashboardFilterableField) =>
    isDimension(field) ? field.timeInterval : undefined;

// Base field first, then its grains in the shipped order
const compareGrains = (
    a: DashboardFilterableField,
    b: DashboardFilterableField,
) => {
    const intervalA = getTimeInterval(a);
    const intervalB = getTimeInterval(b);
    if (intervalA && intervalB) return sortTimeFrames(intervalA, intervalB);
    if (intervalA) return 1;
    if (intervalB) return -1;
    return 0;
};

// Every field is an entry, sorted by table, then by base date or field name,
// the grains of one date together
const toSortedFieldIds = (fields: DashboardFilterableField[]): string[] =>
    [...fields]
        .sort(
            (a, b) =>
                getTableLabel(a).localeCompare(getTableLabel(b)) ||
                getBaseName(a).localeCompare(getBaseName(b)) ||
                compareGrains(a, b) ||
                a.label.localeCompare(b.label),
        )
        .map(getItemId);

// What one tile can add to the filter: every field of the target's type that
// is not a row yet, another grain of a date the filter is on included
export const getTileFieldCandidateIds = (
    tileFields: DashboardFilterableField[],
    takenFieldIds: string[],
    target: DashboardFilterableField,
): string[] =>
    toSortedFieldIds(getFieldCandidates(tileFields, takenFieldIds, target));

// What a new control can start from on one tile: its fields of every kind.
// Metrics only where creating metric filters is enabled, as in "Add filter"
export const getTileStarterFieldIds = (
    tileFields: DashboardFilterableField[],
    includeMetrics: boolean,
): string[] =>
    toSortedFieldIds(
        includeMetrics ? tileFields : tileFields.filter(isDimension),
    );

// A candidate that would read like another entry of the dropdown carries its
// table label
export const getCandidateOptions = (
    candidateIds: string[],
    ownLabels: string[],
    fieldsMap: Record<string, DashboardFilterableField>,
): FieldOption[] => {
    const names = candidateIds.map(
        (fieldId) => fieldsMap[fieldId]?.label ?? fieldId,
    );
    const allNames = [...ownLabels, ...names];
    return candidateIds.map((fieldId, index) => {
        const name = names[index];
        const field = fieldsMap[fieldId];
        const isAmbiguous =
            allNames.filter((candidate) => candidate === name).length > 1;
        return {
            value: fieldId,
            label:
                isAmbiguous && field
                    ? `${field.tableLabel || field.table} ${name}`
                    : name,
        };
    });
};
