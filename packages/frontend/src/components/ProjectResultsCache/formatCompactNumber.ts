const compactFormatter = new Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 1,
});

const preciseCompactFormatter = new Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 20,
});

// Prefixes "~" when compacting dropped precision, e.g. 1,953 -> "~2K".
export const formatCompactNumber = (value: number): string => {
    const compact = compactFormatter.format(value);
    return compact === preciseCompactFormatter.format(value)
        ? compact
        : `~${compact}`;
};
