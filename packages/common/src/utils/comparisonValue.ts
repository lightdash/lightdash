import { ComparisonFormatTypes } from '../types/savedCharts';

/** A big number's change against its comparison: the raw difference, or that difference as a share of the comparison. */
export const calculateComparisonValue = (
    value: number,
    comparisonValue: number,
    format: ComparisonFormatTypes | undefined,
): number => {
    const rawValue = value - comparisonValue;
    return format === ComparisonFormatTypes.PERCENTAGE
        ? rawValue / Math.abs(comparisonValue)
        : rawValue;
};
