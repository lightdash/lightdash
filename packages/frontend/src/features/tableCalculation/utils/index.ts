import { snakeCaseName, type TableCalculation } from '@lightdash/common';

export const getUniqueTableCalculationName = (
    name: string,
    tableCalculations: TableCalculation[],
): string => {
    const snakeName = snakeCaseName(name);
    const suffixes = Array.from(Array(100).keys());
    const getCalcName = (suffix: number) =>
        suffix === 0 ? snakeName : `${snakeName}_${suffix}`;

    const validSuffix = suffixes.find(
        (suffix) =>
            tableCalculations.findIndex(
                ({ name: tableCalcName }) =>
                    tableCalcName === getCalcName(suffix),
            ) === -1,
    );
    if (validSuffix === undefined) {
        throw new Error(`Table calculation ID "${name}" already exists.`);
    }
    return getCalcName(validSuffix);
};
