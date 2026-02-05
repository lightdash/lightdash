import type { WarehouseSqlBuilder } from '../types/warehouse';
import {
    parseTableCalculationFunctions,
    PIVOT_FUNCTIONS,
    ROW_FUNCTIONS,
    TableCalculationFunctionCompiler,
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

        describe('pivot_where parsing', () => {
            it('should parse simple pivot_where', () => {
                const sql = 'pivot_where(status = "completed", revenue)';
                const result = parseTableCalculationFunctions(sql);

                expect(result).toHaveLength(1);
                expect(result[0].type).toBe(
                    TableCalculationFunctionType.PIVOT_WHERE,
                );
                if (
                    result[0].type === TableCalculationFunctionType.PIVOT_WHERE
                ) {
                    expect(result[0].selectExpression).toBe(
                        'status = "completed"',
                    );
                    expect(result[0].valueExpression).toBe('revenue');
                    expect(result[0].rawSql).toBe(
                        'pivot_where(status = "completed", revenue)',
                    );
                }
            });

            it('should parse pivot_where with complex condition', () => {
                const sql =
                    'pivot_where(revenue > 1000 AND orders > 10, status)';
                const result = parseTableCalculationFunctions(sql);

                expect(result).toHaveLength(1);
                expect(result[0].type).toBe(
                    TableCalculationFunctionType.PIVOT_WHERE,
                );
                if (
                    result[0].type === TableCalculationFunctionType.PIVOT_WHERE
                ) {
                    expect(result[0].selectExpression).toBe(
                        'revenue > 1000 AND orders > 10',
                    );
                    expect(result[0].valueExpression).toBe('status');
                }
            });

            it('should parse pivot_where with nested function calls', () => {
                const sql =
                    'pivot_where(LOWER(status) = "active", ROUND(revenue, 2))';
                const result = parseTableCalculationFunctions(sql);

                expect(result).toHaveLength(1);
                expect(result[0].type).toBe(
                    TableCalculationFunctionType.PIVOT_WHERE,
                );
                if (
                    result[0].type === TableCalculationFunctionType.PIVOT_WHERE
                ) {
                    expect(result[0].selectExpression).toBe(
                        'LOWER(status) = "active"',
                    );
                    expect(result[0].valueExpression).toBe('ROUND(revenue, 2)');
                }
            });

            it('should parse multiple pivot_where calls', () => {
                const sql =
                    'pivot_where(status = "active", revenue) + pivot_where(status = "pending", revenue)';
                const result = parseTableCalculationFunctions(sql);

                expect(result).toHaveLength(2);
                expect(result[0].type).toBe(
                    TableCalculationFunctionType.PIVOT_WHERE,
                );
                expect(result[1].type).toBe(
                    TableCalculationFunctionType.PIVOT_WHERE,
                );
            });

            it('should handle whitespace in pivot_where', () => {
                const sql = 'pivot_where(  status = "active"  ,  revenue  )';
                const result = parseTableCalculationFunctions(sql);

                expect(result).toHaveLength(1);
                expect(result[0].type).toBe(
                    TableCalculationFunctionType.PIVOT_WHERE,
                );
                if (
                    result[0].type === TableCalculationFunctionType.PIVOT_WHERE
                ) {
                    expect(result[0].selectExpression).toBe(
                        'status = "active"',
                    );
                    expect(result[0].valueExpression).toBe('revenue');
                }
            });
        });
    });

    describe('TableCalculationFunctionCompiler', () => {
        describe('compileFunctions', () => {
            let compiler: TableCalculationFunctionCompiler;
            let mockWarehouseSqlBuilder: WarehouseSqlBuilder;

            beforeEach(() => {
                mockWarehouseSqlBuilder = {
                    getFieldQuoteChar: jest.fn().mockReturnValue('"'),
                } as unknown as WarehouseSqlBuilder;
                compiler = new TableCalculationFunctionCompiler(
                    mockWarehouseSqlBuilder,
                );
            });

            describe('pivot_offset compilation', () => {
                it('should compile pivot_offset with positive offset', () => {
                    const sql = 'pivot_offset(revenue, 1)';
                    const functions = parseTableCalculationFunctions(sql);
                    const compiled = compiler.compileFunctions(sql, functions);

                    const expectedSql =
                        'CASE WHEN LEAD("row_index", 1) OVER (PARTITION BY "column_index" ORDER BY "row_index") = "row_index" + (1) THEN LEAD(revenue, 1) OVER (PARTITION BY "column_index" ORDER BY "row_index") ELSE NULL END';
                    expect(compiled).toBe(expectedSql);
                });

                it('should compile pivot_offset with negative offset', () => {
                    const sql = 'pivot_offset(revenue, -1)';
                    const functions = parseTableCalculationFunctions(sql);
                    const compiled = compiler.compileFunctions(sql, functions);

                    const expectedSql =
                        'CASE WHEN LAG("row_index", 1) OVER (PARTITION BY "column_index" ORDER BY "row_index") = "row_index" + (-1) THEN LAG(revenue, 1) OVER (PARTITION BY "column_index" ORDER BY "row_index") ELSE NULL END';
                    expect(compiled).toBe(expectedSql);
                });

                it('should compile pivot_offset with zero offset', () => {
                    const sql = 'pivot_offset(revenue, 0)';
                    const functions = parseTableCalculationFunctions(sql);
                    const compiled = compiler.compileFunctions(sql, functions);

                    const expectedSql = 'revenue';
                    expect(compiled).toBe(expectedSql);
                });

                it('should compile expression with pivot_offset', () => {
                    const sql = 'revenue - pivot_offset(revenue, -1)';
                    const functions = parseTableCalculationFunctions(sql);
                    const compiled = compiler.compileFunctions(sql, functions);

                    const expectedSql =
                        'revenue - CASE WHEN LAG("row_index", 1) OVER (PARTITION BY "column_index" ORDER BY "row_index") = "row_index" + (-1) THEN LAG(revenue, 1) OVER (PARTITION BY "column_index" ORDER BY "row_index") ELSE NULL END';
                    expect(compiled).toBe(expectedSql);
                });
            });

            describe('pivot_column compilation', () => {
                it('should compile pivot_column to column_index', () => {
                    const sql = 'pivot_column()';
                    const functions = parseTableCalculationFunctions(sql);
                    const compiled = compiler.compileFunctions(sql, functions);

                    const expectedSql = '"column_index"';
                    expect(compiled).toBe(expectedSql);
                });

                it('should compile expression with pivot_column', () => {
                    const sql = 'pivot_column() + 1';
                    const functions = parseTableCalculationFunctions(sql);
                    const compiled = compiler.compileFunctions(sql, functions);

                    const expectedSql = '"column_index" + 1';
                    expect(compiled).toBe(expectedSql);
                });
            });

            describe('pivot_index compilation', () => {
                it('should compile pivot_index to get value from specific column', () => {
                    const sql = 'pivot_index(revenue, 0)';
                    const functions = parseTableCalculationFunctions(sql);
                    const compiled = compiler.compileFunctions(sql, functions);

                    const expectedSql =
                        'MAX(CASE WHEN "column_index" = 0 THEN revenue ELSE NULL END) OVER (PARTITION BY "row_index")';
                    expect(compiled).toBe(expectedSql);
                });

                it('should compile expression with pivot_index', () => {
                    const sql = 'revenue / pivot_index(revenue, 0)';
                    const functions = parseTableCalculationFunctions(sql);
                    const compiled = compiler.compileFunctions(sql, functions);

                    const expectedSql =
                        'revenue / MAX(CASE WHEN "column_index" = 0 THEN revenue ELSE NULL END) OVER (PARTITION BY "row_index")';
                    expect(compiled).toBe(expectedSql);
                });
            });

            describe('pivot_offset_list compilation', () => {
                it('should compile pivot_offset_list to NULL placeholder', () => {
                    const sql = 'pivot_offset_list(revenue, -2, 3)';
                    const functions = parseTableCalculationFunctions(sql);
                    const compiled = compiler.compileFunctions(sql, functions);

                    // Currently returns NULL as array construction varies by warehouse
                    const expectedSql = 'NULL';
                    expect(compiled).toBe(expectedSql);
                });
            });

            describe('pivot_row compilation', () => {
                it('should compile pivot_row to NULL placeholder', () => {
                    const sql = 'pivot_row(revenue)';
                    const functions = parseTableCalculationFunctions(sql);
                    const compiled = compiler.compileFunctions(sql, functions);

                    // Currently returns NULL as array construction varies by warehouse
                    const expectedSql = 'NULL';
                    expect(compiled).toBe(expectedSql);
                });
            });

            describe('pivot_where compilation', () => {
                it('should compile simple pivot_where to SQL', () => {
                    const sql = 'pivot_where(status = "active", revenue)';
                    const functions = parseTableCalculationFunctions(sql);
                    const compiled = compiler.compileFunctions(sql, functions);

                    const expectedSql =
                        'MAX(CASE WHEN "column_index" = (SELECT MIN("column_index") FROM (SELECT "column_index", status = "active" AS condition FROM DUAL) WHERE condition = TRUE) THEN revenue ELSE NULL END) OVER (PARTITION BY "row_index")';
                    expect(compiled).toBe(expectedSql);
                });

                it('should replace pivot_where with compiled SQL', () => {
                    const sql =
                        'pivot_where(status = "completed", revenue) + 100';
                    const functions = parseTableCalculationFunctions(sql);
                    const compiled = compiler.compileFunctions(sql, functions);

                    const expectedSql =
                        'MAX(CASE WHEN "column_index" = (SELECT MIN("column_index") FROM (SELECT "column_index", status = "completed" AS condition FROM DUAL) WHERE condition = TRUE) THEN revenue ELSE NULL END) OVER (PARTITION BY "row_index") + 100';
                    expect(compiled).toBe(expectedSql);
                });

                it('should compile multiple pivot_where calls', () => {
                    const sql =
                        'pivot_where(status = "active", revenue) + pivot_where(status = "pending", orders)';
                    const functions = parseTableCalculationFunctions(sql);
                    const compiled = compiler.compileFunctions(sql, functions);

                    const expectedSql =
                        'MAX(CASE WHEN "column_index" = (SELECT MIN("column_index") FROM (SELECT "column_index", status = "active" AS condition FROM DUAL) WHERE condition = TRUE) THEN revenue ELSE NULL END) OVER (PARTITION BY "row_index") + MAX(CASE WHEN "column_index" = (SELECT MIN("column_index") FROM (SELECT "column_index", status = "pending" AS condition FROM DUAL) WHERE condition = TRUE) THEN orders ELSE NULL END) OVER (PARTITION BY "row_index")';
                    expect(compiled).toBe(expectedSql);
                });

                it('should handle pivot_where with complex expressions', () => {
                    const sql =
                        'COALESCE(pivot_where(revenue > 1000, status), "none")';
                    const functions = parseTableCalculationFunctions(sql);
                    const compiled = compiler.compileFunctions(sql, functions);

                    const expectedSql =
                        'COALESCE(MAX(CASE WHEN "column_index" = (SELECT MIN("column_index") FROM (SELECT "column_index", revenue > 1000 AS condition FROM DUAL) WHERE condition = TRUE) THEN status ELSE NULL END) OVER (PARTITION BY "row_index"), "none")';
                    expect(compiled).toBe(expectedSql);
                });
            });

            describe('mixed function compilation', () => {
                it('should compile multiple different pivot functions together', () => {
                    const sql =
                        'pivot_column() * pivot_offset(revenue, -1) + pivot_index(revenue, 0)';
                    const functions = parseTableCalculationFunctions(sql);
                    const compiled = compiler.compileFunctions(sql, functions);

                    const expectedSql =
                        '"column_index" * CASE WHEN LAG("row_index", 1) OVER (PARTITION BY "column_index" ORDER BY "row_index") = "row_index" + (-1) THEN LAG(revenue, 1) OVER (PARTITION BY "column_index" ORDER BY "row_index") ELSE NULL END + MAX(CASE WHEN "column_index" = 0 THEN revenue ELSE NULL END) OVER (PARTITION BY "row_index")';
                    expect(compiled).toBe(expectedSql);
                });

                it('should handle complex nested expressions', () => {
                    const sql =
                        'CASE WHEN pivot_column() = 0 THEN pivot_where(status = "active", revenue) ELSE pivot_offset(revenue, -1) END';
                    const functions = parseTableCalculationFunctions(sql);
                    const compiled = compiler.compileFunctions(sql, functions);

                    const expectedSql =
                        'CASE WHEN "column_index" = 0 THEN MAX(CASE WHEN "column_index" = (SELECT MIN("column_index") FROM (SELECT "column_index", status = "active" AS condition FROM DUAL) WHERE condition = TRUE) THEN revenue ELSE NULL END) OVER (PARTITION BY "row_index") ELSE CASE WHEN LAG("row_index", 1) OVER (PARTITION BY "column_index" ORDER BY "row_index") = "row_index" + (-1) THEN LAG(revenue, 1) OVER (PARTITION BY "column_index" ORDER BY "row_index") ELSE NULL END END';
                    expect(compiled).toBe(expectedSql);
                });
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
