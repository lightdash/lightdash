export function getSubtotalKey(dimensions: string[]) {
    return dimensions.join(':');
}

// Orders the non-pivot dimensions by columnOrder, drops the most detailed one
// and returns the nesting prefixes that each get their own subtotal level.
export const getSubtotalDimensionGroups = (
    dimensions: string[],
    columnOrder: string[],
    pivotDimensions: string[],
): string[][] => {
    const ordered = [...dimensions].sort((a, b) => {
        const aIndex = columnOrder.indexOf(a);
        const bIndex = columnOrder.indexOf(b);
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
    });
    const withoutPivot = ordered.filter((d) => !pivotDimensions.includes(d));
    const toSubtotal = withoutPivot.slice(0, -1);
    return toSubtotal.map((_, index) => toSubtotal.slice(0, index + 1));
};
