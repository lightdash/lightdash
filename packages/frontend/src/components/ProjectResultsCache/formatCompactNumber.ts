const compactFormatter = new Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 1,
});

export const formatCompactNumber = (value: number): string =>
    compactFormatter.format(value);
