import type { PivotConfiguration } from '../types/pivot';
import type { PivotIndexColum } from '../visualizations/types';

export const normalizeIndexColumns = (
    indexColumn: PivotConfiguration['indexColumn'],
): PivotIndexColum[] => {
    if (!indexColumn) {
        return [];
    }
    if (Array.isArray(indexColumn)) {
        return indexColumn;
    }
    return [indexColumn];
};

export const getFirstIndexColumns = (
    indexColumn: PivotConfiguration['indexColumn'],
): PivotIndexColum | undefined => {
    const normalizedIndexColumns = normalizeIndexColumns(indexColumn);
    return normalizedIndexColumns[0];
};
