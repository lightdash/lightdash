export const getJoinClauseLabel = (
    primarySourceLabel: string,
    primaryFieldLabel: string,
    additionalSourceLabel: string,
    additionalFieldLabel: string,
) =>
    `${primarySourceLabel} · ${primaryFieldLabel} = ${additionalSourceLabel} · ${additionalFieldLabel}`;
