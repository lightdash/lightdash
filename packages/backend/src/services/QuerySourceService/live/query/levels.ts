/**
 * Levels of an API's object hierarchy, coarsest first, like account, campaign
 * and ad. A report runs at the finest level it selects.
 */
export const getFinestLevel = <Level>(
    order: readonly Level[],
    levels: readonly (Level | null | undefined)[],
): Level | null =>
    [...order].reverse().find((level) => levels.includes(level)) ?? null;

export const isFinerLevel = <Level>(
    order: readonly Level[],
    level: Level,
    than: Level,
) => order.indexOf(level) > order.indexOf(than);
