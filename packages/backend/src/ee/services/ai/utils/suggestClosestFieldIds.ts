/**
 * Suggest the field ids closest to `target` from `candidateIds`, ranked by how
 * many `_`-delimited tokens they share. Deterministic (ties broken
 * alphabetically) and pure, so it can be dropped into validation error messages
 * to help the agent repair a filter that references an unknown field.
 *
 * Returns at most `limit` ids, and only ones that share at least one token.
 */
export const suggestClosestFieldIds = (
    target: string,
    candidateIds: string[],
    limit = 5,
): string[] => {
    const targetTokens = new Set(
        target.toLowerCase().split('_').filter(Boolean),
    );
    return candidateIds
        .map((id) => ({
            id,
            shared: id
                .toLowerCase()
                .split('_')
                .filter(Boolean)
                .filter((token) => targetTokens.has(token)).length,
        }))
        .filter((candidate) => candidate.shared > 0)
        .sort((a, b) => b.shared - a.shared || a.id.localeCompare(b.id))
        .slice(0, limit)
        .map((candidate) => candidate.id);
};
