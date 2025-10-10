import type { WarehouseSqlBuilder } from '@lightdash/common';
import { CompileError } from '@lightdash/common';

export const compileSpreadsheetFormula = (
    formula: string,
    warehouseSqlBuilder: WarehouseSqlBuilder,
): string => {
    // Stage 1: ONLY accept "1 + 1"
    // Normalize: remove all spaces, then check if it's "1+1"
    const withoutSpaces = formula.replace(/\s+/g, '');

    if (withoutSpaces !== '1+1') {
        throw new CompileError(
            `Spreadsheet formula not supported yet. Only "1 + 1" is currently supported, got: ${formula}`,
            {},
        );
    }

    return '1 + 1'; // Return as SQL
};
