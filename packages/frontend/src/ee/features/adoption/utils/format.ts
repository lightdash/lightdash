// Whole numbers grouped by thousands, the same way in every adoption view
export const formatCount = (count: number): string =>
    count.toLocaleString('en-US');
