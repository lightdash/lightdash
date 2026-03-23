/** Format a row value for display. Numbers get rounded, nulls become '-'. */
export function fmt(value: unknown, decimals = 0): string {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'number') return value.toFixed(decimals);
    return String(value);
}
