import { snakeCaseName, type TableCalculation } from '@lightdash/common';

export const getUniqueTableCalculationName = (
    name: string,
    tableCalculations: TableCalculation[],
    excludeTableCalc?: TableCalculation,
): string => {
    const snakeName = snakeCaseName(name);
    const suffixes = Array.from(Array(100).keys());
    const getCalcName = (suffix: number) =>
        suffix === 0 ? snakeName : `${snakeName}_${suffix}`;

    // Filter out the table calculation we're currently editing
    const otherTableCalculations = excludeTableCalc
        ? tableCalculations.filter((tc) => tc.name !== excludeTableCalc.name)
        : tableCalculations;

    const validSuffix = suffixes.find(
        (suffix) =>
            otherTableCalculations.findIndex(
                ({ name: tableCalcName }) =>
                    tableCalcName === getCalcName(suffix),
            ) === -1,
    );
    if (validSuffix === undefined) {
        throw new Error(`Table calculation ID "${name}" already exists.`);
    }
    return getCalcName(validSuffix);
};
