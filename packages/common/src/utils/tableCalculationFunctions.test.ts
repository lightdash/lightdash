import {
    parseTableCalculationFunctions,
    PIVOT_FUNCTIONS,
    ROW_FUNCTIONS,
    TableCalculationFunctionType,
} from './tableCalculationFunctions';

describe('tableCalculationFunctions', () => {
    describe('parseTableCalculationFunctions', () => {
        describe('pivot_offset parsing', () => {
            it('should parse simple pivot_offset with positive offset', () => {
                const sql = 'pivot_offset(revenue, 1)';
                const result = parseTableCalculationFunctions(sql);

                expect(result).toHaveLength(1);
                expect(result[0].type).toBe(
                    TableCalculationFunctionType.PIVOT_OFFSET,
                );
                if (
                    result[0].type === TableCalculationFunctionType.PIVOT_OFFSET
                ) {
                    expect(result[0].expression).toBe('revenue');
                    expect(result[0].columnOffset).toBe(1);
                    expect(result[0].rawSql).toBe('pivot_offset(revenue, 1)');
                }
            });

            it('should parse pivot_offset with negative offset', () => {
                const sql = 'pivot_offset(orders_total_revenue, -1)';
                const result = parseTableCalculationFunctions(sql);

                expect(result).toHaveLength(1);
                expect(result[0].type).toBe(
                    TableCalculationFunctionType.PIVOT_OFFSET,
                );
                if (
                    result[0].type === TableCalculationFunctionType.PIVOT_OFFSET
                ) {
                    expect(result[0].expression).toBe('orders_total_revenue');
                    expect(result[0].columnOffset).toBe(-1);
                    expect(result[0].rawSql).toBe(
                        'pivot_offset(orders_total_revenue, -1)',
                    );
                }
            });

            it('should parse multiple pivot_offset calls', () => {
                const sql =
                    'revenue - pivot_offset(revenue, -1) + pivot_offset(revenue, -2)';
                const result = parseTableCalculationFunctions(sql);

                expect(result).toHaveLength(2);
                // Functions are now sorted from last to first
                expect(result[0].type).toBe(
                    TableCalculationFunctionType.PIVOT_OFFSET,
                );
                if (
                    result[0].type === TableCalculationFunctionType.PIVOT_OFFSET
                ) {
                    expect(result[0].columnOffset).toBe(-2); // Second one comes first now
                }
                expect(result[1].type).toBe(
                    TableCalculationFunctionType.PIVOT_OFFSET,
                );
                if (
                    result[1].type === TableCalculationFunctionType.PIVOT_OFFSET
                ) {
                    expect(result[1].columnOffset).toBe(-1); // First one comes second now
                }
            });

            it('should parse pivot_offset in complex expressions', () => {
                const sql =
                    '(revenue - pivot_offset(revenue, -1)) / NULLIF(pivot_offset(revenue, -1), 0)';
                const result = parseTableCalculationFunctions(sql);

                expect(result).toHaveLength(2);
                expect(result[0].type).toBe(
                    TableCalculationFunctionType.PIVOT_OFFSET,
                );
                expect(result[1].type).toBe(
                    TableCalculationFunctionType.PIVOT_OFFSET,
                );
                if (
                    result[0].type ===
                        TableCalculationFunctionType.PIVOT_OFFSET &&
                    result[1].type === TableCalculationFunctionType.PIVOT_OFFSET
                ) {
                    expect(result[0].expression).toBe('revenue');
                    expect(result[0].columnOffset).toBe(-1);
                    expect(result[1].expression).toBe('revenue');
                    expect(result[1].columnOffset).toBe(-1);
                }
            });

            it('should handle whitespace in pivot_offset', () => {
                const sql = 'pivot_offset(  revenue  ,  -1  )';
                const result = parseTableCalculationFunctions(sql);

                expect(result).toHaveLength(1);
                expect(result[0].type).toBe(
                    TableCalculationFunctionType.PIVOT_OFFSET,
                );
                if (
                    result[0].type === TableCalculationFunctionType.PIVOT_OFFSET
                ) {
                    expect(result[0].expression).toBe('revenue');
                    expect(result[0].columnOffset).toBe(-1);
                }
            });

            it('should parse pivot_offset with expression containing parentheses', () => {
                const sql = 'pivot_offset(SUM(revenue), -1)';
                const result = parseTableCalculationFunctions(sql);

                expect(result).toHaveLength(1);
                expect(result[0].type).toBe(
                    TableCalculationFunctionType.PIVOT_OFFSET,
                );
                if (
                    result[0].type === TableCalculationFunctionType.PIVOT_OFFSET
                ) {
                    expect(result[0].expression).toBe('SUM(revenue)');
                    expect(result[0].columnOffset).toBe(-1);
                }
            });
        });

        describe('pivot_column parsing', () => {
            it('should parse pivot_column()', () => {
                const sql = 'pivot_column()';
                const result = parseTableCalculationFunctions(sql);

                expect(result).toHaveLength(1);
                expect(result[0].type).toBe(
                    TableCalculationFunctionType.PIVOT_COLUMN,
                );
                expect(result[0].rawSql).toBe('pivot_column()');
            });

            it('should parse pivot_column() in expression', () => {
                const sql = 'pivot_column() + 1';
                const result = parseTableCalculationFunctions(sql);

                expect(result).toHaveLength(1);
                expect(result[0].type).toBe(
                    TableCalculationFunctionType.PIVOT_COLUMN,
                );
            });
        });

        describe('pivot_index parsing', () => {
            it('should parse pivot_index', () => {
                const sql = 'pivot_index(revenue, 0)';
                const result = parseTableCalculationFunctions(sql);

                expect(result).toHaveLength(1);
                expect(result[0].type).toBe(
                    TableCalculationFunctionType.PIVOT_INDEX,
                );
                if (
                    result[0].type === TableCalculationFunctionType.PIVOT_INDEX
                ) {
                    expect(result[0].expression).toBe('revenue');
                    expect(result[0].pivotIndex).toBe(0);
                    expect(result[0].rawSql).toBe('pivot_index(revenue, 0)');
                }
            });

            it('should parse pivot_index with higher index', () => {
                const sql = 'revenue / pivot_index(revenue, 3)';
                const result = parseTableCalculationFunctions(sql);

                expect(result).toHaveLength(1);
                expect(result[0].type).toBe(
                    TableCalculationFunctionType.PIVOT_INDEX,
                );
                if (
                    result[0].type === TableCalculationFunctionType.PIVOT_INDEX
                ) {
                    expect(result[0].pivotIndex).toBe(3);
                }
            });
        });

        describe('row function parsing', () => {
            it('should parse row()', () => {
                const sql = 'row()';
                const result = parseTableCalculationFunctions(sql);

                expect(result).toHaveLength(1);
                expect(result[0].type).toBe(TableCalculationFunctionType.ROW);
                expect(result[0].rawSql).toBe('row()');
            });

            it('should parse row() in expression', () => {
                const sql = 'row() * 10';
                const result = parseTableCalculationFunctions(sql);

                expect(result).toHaveLength(1);
                expect(result[0].type).toBe(TableCalculationFunctionType.ROW);
            });
        });

        describe('offset parsing (row function)', () => {
            it('should parse offset function', () => {
                const sql = 'offset(revenue, -1)';
                const result = parseTableCalculationFunctions(sql);

                expect(result).toHaveLength(1);
                expect(result[0].type).toBe(
                    TableCalculationFunctionType.OFFSET,
                );
                if (result[0].type === TableCalculationFunctionType.OFFSET) {
                    expect(result[0].column).toBe('revenue');
                    expect(result[0].rowOffset).toBe(-1);
                    expect(result[0].rawSql).toBe('offset(revenue, -1)');
                }
            });

            it('should distinguish between offset and pivot_offset', () => {
                const sql = 'offset(revenue, -1) + pivot_offset(revenue, 1)';
                const result = parseTableCalculationFunctions(sql);

                expect(result).toHaveLength(2);
                // Functions are now sorted from last to first
                expect(result[0].type).toBe(
                    TableCalculationFunctionType.PIVOT_OFFSET,
                );
                expect(result[1].type).toBe(
                    TableCalculationFunctionType.OFFSET,
                );
            });
        });

        describe('index parsing (row function)', () => {
            it('should parse index function', () => {
                const sql = 'index(revenue, 1)';
                const result = parseTableCalculationFunctions(sql);

                expect(result).toHaveLength(1);
                expect(result[0].type).toBe(TableCalculationFunctionType.INDEX);
                if (result[0].type === TableCalculationFunctionType.INDEX) {
                    expect(result[0].expression).toBe('revenue');
                    expect(result[0].rowIndex).toBe(1);
                    expect(result[0].rawSql).toBe('index(revenue, 1)');
                }
            });

            it('should distinguish between index and pivot_index', () => {
                const sql = 'index(revenue, 1) + pivot_index(revenue, 0)';
                const result = parseTableCalculationFunctions(sql);

                expect(result).toHaveLength(2);
                // Functions are now sorted from last to first
                expect(result[0].type).toBe(
                    TableCalculationFunctionType.PIVOT_INDEX,
                );
                expect(result[1].type).toBe(TableCalculationFunctionType.INDEX);
            });
        });

        describe('mixed function parsing', () => {
            it('should parse multiple different functions', () => {
                const sql =
                    'row() + pivot_column() + offset(revenue, -1) + pivot_offset(costs, 1)';
                const result = parseTableCalculationFunctions(sql);

                expect(result).toHaveLength(4);
                const types = result.map((f) => f.type);
                expect(types).toContain(TableCalculationFunctionType.ROW);
                expect(types).toContain(
                    TableCalculationFunctionType.PIVOT_COLUMN,
                );
                expect(types).toContain(TableCalculationFunctionType.OFFSET);
                expect(types).toContain(
                    TableCalculationFunctionType.PIVOT_OFFSET,
                );
            });
        });

        describe('complex expressions', () => {
            it('should parse percent change calculation', () => {
                const sql =
                    '(revenue - pivot_offset(revenue, -1)) / NULLIF(pivot_offset(revenue, -1), 0) * 100';
                const result = parseTableCalculationFunctions(sql);

                expect(result).toHaveLength(2);
                expect(
                    result.every(
                        (f) =>
                            f.type ===
                            TableCalculationFunctionType.PIVOT_OFFSET,
                    ),
                ).toBe(true);
            });

            it('should parse moving average with row functions', () => {
                const sql =
                    '(offset(revenue, -2) + offset(revenue, -1) + revenue) / 3';
                const result = parseTableCalculationFunctions(sql);

                expect(result).toHaveLength(2);
                expect(
                    result.every(
                        (f) => f.type === TableCalculationFunctionType.OFFSET,
                    ),
                ).toBe(true);
            });

            it('should parse ratio to first column', () => {
                const sql = 'revenue / pivot_index(revenue, 0) * 100';
                const result = parseTableCalculationFunctions(sql);

                expect(result).toHaveLength(1);
                expect(result[0].type).toBe(
                    TableCalculationFunctionType.PIVOT_INDEX,
                );
            });

            it('should parse running total simulation', () => {
                const sql = 'revenue + offset(revenue, -1)';
                const result = parseTableCalculationFunctions(sql);

                expect(result).toHaveLength(1);
                expect(result[0].type).toBe(
                    TableCalculationFunctionType.OFFSET,
                );
            });
        });
    });

    describe('ROW_FUNCTIONS constant', () => {
        it('should contain all row function types', () => {
            expect(ROW_FUNCTIONS).toContain(TableCalculationFunctionType.ROW);
            expect(ROW_FUNCTIONS).toContain(TableCalculationFunctionType.INDEX);
            expect(ROW_FUNCTIONS).toContain(
                TableCalculationFunctionType.OFFSET,
            );
            expect(ROW_FUNCTIONS).toContain(
                TableCalculationFunctionType.OFFSET_LIST,
            );
            expect(ROW_FUNCTIONS).toContain(
                TableCalculationFunctionType.LOOKUP,
            );
            expect(ROW_FUNCTIONS).toContain(TableCalculationFunctionType.LIST);
        });
    });

    describe('PIVOT_FUNCTIONS constant', () => {
        it('should contain all pivot function types', () => {
            expect(PIVOT_FUNCTIONS).toContain(
                TableCalculationFunctionType.PIVOT_COLUMN,
            );
            expect(PIVOT_FUNCTIONS).toContain(
                TableCalculationFunctionType.PIVOT_INDEX,
            );
            expect(PIVOT_FUNCTIONS).toContain(
                TableCalculationFunctionType.PIVOT_OFFSET,
            );
            expect(PIVOT_FUNCTIONS).toContain(
                TableCalculationFunctionType.PIVOT_OFFSET_LIST,
            );
            expect(PIVOT_FUNCTIONS).toContain(
                TableCalculationFunctionType.PIVOT_ROW,
            );
            expect(PIVOT_FUNCTIONS).toContain(
                TableCalculationFunctionType.PIVOT_WHERE,
            );
        });
    });
});
