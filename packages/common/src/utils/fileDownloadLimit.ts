/**
 * Constants for query limit handling
 */
export const QUERY_LIMITS = {
    // Use a high but safe number to represent "unlimited" since MetricQuery requires a limit field
    // This value is chosen to be high enough for practical unlimited use but low enough to avoid backend maxLimit issues
    UNLIMITED: 50000,
} as const;

/**
 * Represents different limit override behaviors
 * - undefined: use original limit from saved chart/query
 * - null: no limit (unlimited results)
 * - number: apply specific limit
 */
export type LimitOverride = number | null | undefined;

/**
 * Processes a limit override and returns the effective limit to use
 * @param originalLimit - The original limit from the saved chart/query
 * @param limitOverride - The limit override from the request
 * @returns The effective limit to apply
 */
export function processLimitOverride(
    originalLimit: number,
    limitOverride: LimitOverride,
): number {
    if (limitOverride === undefined) {
        // Use the original limit
        return originalLimit;
    }
    if (limitOverride === null) {
        // No limit - return unlimited constant
        return QUERY_LIMITS.UNLIMITED;
    }
    // Apply the specific limit
    return limitOverride;
}

/**
 * Applies a limit override to a MetricQuery, returning a new query with the updated limit
 * @param metricQuery - The original metric query
 * @param limitOverride - The limit override to apply
 * @returns A new MetricQuery with the updated limit
 */
export function applyLimitOverrideToQuery<T extends { limit: number }>(
    metricQuery: T,
    limitOverride: LimitOverride,
): T {
    const effectiveLimit = processLimitOverride(
        metricQuery.limit,
        limitOverride,
    );
    return { ...metricQuery, limit: effectiveLimit };
}

/**
 * Type guard to check if a limit represents unlimited results
 */
export function isUnlimitedResults(limit: number): boolean {
    return limit >= QUERY_LIMITS.UNLIMITED;
}
