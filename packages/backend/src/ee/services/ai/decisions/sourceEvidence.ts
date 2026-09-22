import { getFields, getItemId, type Explore } from '@lightdash/common';

export const joinedMeasureGuidance = (
    metrics: string[],
    explore: Explore,
    rows: Record<string, unknown>[],
    availableExplores: Explore[],
): string => {
    const hasOnlyZeroOrNull = (values: unknown[]): boolean => {
        const observed = values.filter((value) => value !== undefined);
        return (
            observed.length > 0 &&
            observed.every(
                (value) => value === 0 || value === '0' || value === null,
            )
        );
    };
    const uncertain = getFields(explore).filter(
        (field) =>
            metrics.includes(getItemId(field)) &&
            field.table !== explore.baseTable &&
            hasOnlyZeroOrNull(rows.map((row) => row[getItemId(field)])),
    );
    if (!uncertain.length) return '';
    const directSources = new Map<
        string,
        { name: string; fields: Set<string> }[]
    >();
    availableExplores.forEach((candidate) => {
        const sources = directSources.get(candidate.baseTable) ?? [];
        sources.push({
            name: candidate.name,
            fields: new Set(getFields(candidate).map(getItemId)),
        });
        directSources.set(candidate.baseTable, sources);
    });
    const sources = uncertain.slice(0, 4).map((field) => {
        const native = (directSources.get(field.table) ?? [])
            .filter((candidate) => candidate.fields.has(getItemId(field)))
            .map((candidate) => candidate.name);
        return `${getItemId(field)} belongs to ${field.table}, joined through ${explore.baseTable}${native.length ? `; direct-source explores: ${native.slice(0, 3).join(', ')}` : ''}`;
    });
    return ` Source coverage: ${sources.join('. ')}. An all-zero/null joined measure describes the matched rows; it does not establish source-wide absence without verified join, entity, and time coverage.`;
};
