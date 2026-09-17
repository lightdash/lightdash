import { type MergeFieldOrigins, type ResultRow } from '@lightdash/common';

const isBlank = (row: ResultRow, fieldId: string): boolean => {
    const raw = row[fieldId]?.value.raw;
    return raw === null || raw === undefined;
};

/**
 * Sources whose every value column is blank on every merged row: the query
 * returned no rows, or none that matched the other side on the join key.
 * Answered only over a complete result, because a partial page can hide the
 * rows that carry a value.
 */
export const getMergeSourcesWithoutValues = ({
    rows,
    fieldOrigins,
    complete,
}: {
    rows: ResultRow[];
    fieldOrigins: MergeFieldOrigins;
    complete: boolean;
}): string[] => {
    if (!complete || rows.length === 0) return [];
    const fieldIdsBySourceId = Object.entries(fieldOrigins).reduce<
        Record<string, string[]>
    >((acc, [fieldId, origin]) => {
        if (origin.kind === 'source') {
            acc[origin.sourceId] = [...(acc[origin.sourceId] ?? []), fieldId];
        }
        return acc;
    }, {});
    return Object.entries(fieldIdsBySourceId)
        .filter(([, fieldIds]) =>
            rows.every((row) => fieldIds.every((id) => isBlank(row, id))),
        )
        .map(([sourceId]) => sourceId);
};
