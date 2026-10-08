import {
    getItemId,
    isDimension,
    matchFieldByType,
    type DashboardFilterableField,
} from '@lightdash/common';
import { foldFieldGrains, getFieldDisplayLabel } from './fieldGrains';

export type FieldOption = { value: string; label: string };

// Every grain of a time dimension shares one key
export const getGrainKey = (field: DashboardFilterableField): string | null =>
    isDimension(field)
        ? `${field.table}.${field.timeIntervalBaseDimensionName ?? field.name}`
        : null;

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

// One entry per field, grains folded, sorted by table then by name
const toSortedFieldIds = (fields: DashboardFilterableField[]): string[] =>
    foldFieldGrains(fields)
        .sort(
            (a, b) =>
                a.tableLabel.localeCompare(b.tableLabel) ||
                a.label.localeCompare(b.label),
        )
        .map((row) => getItemId(row.field));

// What one tile can add to the filter. Its dropdown folds the grains of a
// date into one entry, so it offers no second grain of a date the filter has.
// Taken ids are resolved in knownFields
export const getTileFieldCandidateIds = (
    tileFields: DashboardFilterableField[],
    takenFieldIds: string[],
    target: DashboardFilterableField,
    knownFields: DashboardFilterableField[],
): string[] => {
    const taken = new Set(takenFieldIds);
    const takenGrainKeys = new Set(
        knownFields
            .filter((field) => taken.has(getItemId(field)))
            .map(getGrainKey)
            .filter((key): key is string => key !== null),
    );
    return toSortedFieldIds(
        getFieldCandidates(tileFields, takenFieldIds, target).filter(
            (field) => {
                const grainKey = getGrainKey(field);
                return grainKey === null || !takenGrainKeys.has(grainKey);
            },
        ),
    );
};

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
    const knownFields = Object.values(fieldsMap);
    const names = candidateIds.map((fieldId) => {
        const field = fieldsMap[fieldId];
        return field ? getFieldDisplayLabel(field, knownFields) : fieldId;
    });
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
