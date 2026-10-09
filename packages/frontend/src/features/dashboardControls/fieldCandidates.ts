import {
    getItemId,
    matchFieldByType,
    type DashboardFilterableField,
} from '@lightdash/common';

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
