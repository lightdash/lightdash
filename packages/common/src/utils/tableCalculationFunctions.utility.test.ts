import {
    hasPivotFunctions,
    hasRowFunctions,
    isPivotFunction,
    isRowFunction,
    parseTableCalculationFunctions,
    TableCalculationFunctionType,
} from './tableCalculationFunctions';

describe('tableCalculationFunctions utility functions', () => {
    describe('isPivotFunction', () => {
        it('should return true for pivot functions', () => {
            expect(
                isPivotFunction(TableCalculationFunctionType.PIVOT_OFFSET),
            ).toBe(true);
            expect(
                isPivotFunction(TableCalculationFunctionType.PIVOT_COLUMN),
            ).toBe(true);
            expect(
                isPivotFunction(TableCalculationFunctionType.PIVOT_INDEX),
            ).toBe(true);
            expect(
                isPivotFunction(TableCalculationFunctionType.PIVOT_ROW),
            ).toBe(true);
            expect(
                isPivotFunction(TableCalculationFunctionType.PIVOT_WHERE),
            ).toBe(true);
            expect(
                isPivotFunction(TableCalculationFunctionType.PIVOT_OFFSET_LIST),
            ).toBe(true);
        });

        it('should return false for row functions', () => {
            expect(isPivotFunction(TableCalculationFunctionType.ROW)).toBe(
                false,
            );
            expect(isPivotFunction(TableCalculationFunctionType.INDEX)).toBe(
                false,
            );
            expect(isPivotFunction(TableCalculationFunctionType.OFFSET)).toBe(
                false,
            );
            expect(
                isPivotFunction(TableCalculationFunctionType.OFFSET_LIST),
            ).toBe(false);
            expect(isPivotFunction(TableCalculationFunctionType.LOOKUP)).toBe(
                false,
            );
            expect(isPivotFunction(TableCalculationFunctionType.LIST)).toBe(
                false,
            );
        });
    });

    describe('isRowFunction', () => {
        it('should return true for row functions', () => {
            expect(isRowFunction(TableCalculationFunctionType.ROW)).toBe(true);
            expect(isRowFunction(TableCalculationFunctionType.INDEX)).toBe(
                true,
            );
            expect(isRowFunction(TableCalculationFunctionType.OFFSET)).toBe(
                true,
            );
            expect(
                isRowFunction(TableCalculationFunctionType.OFFSET_LIST),
            ).toBe(true);
            expect(isRowFunction(TableCalculationFunctionType.LOOKUP)).toBe(
                true,
            );
            expect(isRowFunction(TableCalculationFunctionType.LIST)).toBe(true);
        });

        it('should return false for pivot functions', () => {
            expect(
                isRowFunction(TableCalculationFunctionType.PIVOT_OFFSET),
            ).toBe(false);
            expect(
                isRowFunction(TableCalculationFunctionType.PIVOT_COLUMN),
            ).toBe(false);
            expect(
                isRowFunction(TableCalculationFunctionType.PIVOT_INDEX),
            ).toBe(false);
            expect(isRowFunction(TableCalculationFunctionType.PIVOT_ROW)).toBe(
                false,
            );
            expect(
                isRowFunction(TableCalculationFunctionType.PIVOT_WHERE),
            ).toBe(false);
            expect(
                isRowFunction(TableCalculationFunctionType.PIVOT_OFFSET_LIST),
            ).toBe(false);
        });
    });

    describe('hasPivotFunctions', () => {
        it('should return true when array contains pivot functions', () => {
            const sql1 = 'pivot_offset(revenue, 1)';
            const functions1 = parseTableCalculationFunctions(sql1);
            expect(hasPivotFunctions(functions1)).toBe(true);

            const sql2 = 'pivot_column() + pivot_index(sales, 1)';
            const functions2 = parseTableCalculationFunctions(sql2);
            expect(hasPivotFunctions(functions2)).toBe(true);
        });

        it('should return false when array contains only row functions', () => {
            const sql = 'offset(revenue, 1) + row()';
            const functions = parseTableCalculationFunctions(sql);
            expect(hasPivotFunctions(functions)).toBe(false);
        });

        it('should return false for empty array', () => {
            expect(hasPivotFunctions([])).toBe(false);
        });
    });

    describe('hasRowFunctions', () => {
        it('should return true when array contains row functions', () => {
            const sql1 = 'offset(revenue, 1)';
            const functions1 = parseTableCalculationFunctions(sql1);
            expect(hasRowFunctions(functions1)).toBe(true);

            const sql2 = 'row() + index(sales, 1)';
            const functions2 = parseTableCalculationFunctions(sql2);
            expect(hasRowFunctions(functions2)).toBe(true);
        });

        it('should return false when array contains only pivot functions', () => {
            const sql = 'pivot_offset(revenue, 1) + pivot_column()';
            const functions = parseTableCalculationFunctions(sql);
            expect(hasRowFunctions(functions)).toBe(false);
        });

        it('should return false for empty array', () => {
            expect(hasRowFunctions([])).toBe(false);
        });
    });

    describe('mixed functions', () => {
        it('should correctly identify mixed function usage', () => {
            const sql = 'pivot_offset(revenue, 1) + offset(cost, -1)';
            const functions = parseTableCalculationFunctions(sql);

            expect(hasPivotFunctions(functions)).toBe(true);
            expect(hasRowFunctions(functions)).toBe(true);
        });
    });
});
