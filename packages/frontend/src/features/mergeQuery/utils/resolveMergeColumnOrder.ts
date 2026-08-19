/**
 * Keeps saved user order for fields still present, drops removed fields, and
 * appends newly selected fields in query order.
 */
export const resolveMergeColumnOrder = (
    queryOrder: string[],
    savedOrder: string[],
): string[] => {
    const available = new Set(queryOrder);
    const seen = new Set<string>();
    const resolved: string[] = [];

    [...savedOrder, ...queryOrder].forEach((fieldId) => {
        if (available.has(fieldId) && !seen.has(fieldId)) {
            seen.add(fieldId);
            resolved.push(fieldId);
        }
    });

    return resolved;
};
