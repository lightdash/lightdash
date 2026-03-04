import type { WarehouseSqlBuilder } from '../types/warehouse';
import {
    AGGREGATE_FUNCTIONS,
    buildTotalFieldRegex,
    extractTotalReferences,
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
                    expect(result[0].rowOffset).toBe('-1');
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

            it('should parse offset with dynamic expression', () => {
                const sql = 'offset(revenue, ${y_oy_calculation_offset})';
                const result = parseTableCalculationFunctions(sql);

                expect(result).toHaveLength(1);
                expect(result[0].type).toBe(
                    TableCalculationFunctionType.OFFSET,
                );
                if (result[0].type === TableCalculationFunctionType.OFFSET) {
                    expect(result[0].column).toBe('revenue');
                    expect(result[0].rowOffset).toBe(
                        '${y_oy_calculation_offset}',
                    );
                    expect(result[0].rawSql).toBe(
                        'offset(revenue, ${y_oy_calculation_offset})',
                    );
                }
            });

            it('should parse offset with CASE expression', () => {
                const sql = `offset(customers, CASE WHEN date_part='Month' THEN 12 ELSE 1 END)`;
                const result = parseTableCalculationFunctions(sql);

                expect(result).toHaveLength(1);
                expect(result[0].type).toBe(
                    TableCalculationFunctionType.OFFSET,
                );
                if (result[0].type === TableCalculationFunctionType.OFFSET) {
                    expect(result[0].column).toBe('customers');
                    expect(result[0].rowOffset).toBe(
                        `CASE WHEN date_part='Month' THEN 12 ELSE 1 END`,
                    );
                }
            });

            it('should parse offset with nested parentheses in expression', () => {
                const sql = 'offset(revenue, COALESCE(offset_var, ABS(-1)))';
                const result = parseTableCalculationFunctions(sql);

                expect(result).toHaveLength(1);
                expect(result[0].type).toBe(
                    TableCalculationFunctionType.OFFSET,
                );
                if (result[0].type === TableCalculationFunctionType.OFFSET) {
                    expect(result[0].column).toBe('revenue');
                    expect(result[0].rowOffset).toBe(
                        'COALESCE(offset_var, ABS(-1))',
                    );
                    expect(result[0].rawSql).toBe(
                        'offset(revenue, COALESCE(offset_var, ABS(-1)))',
                    );
                }
            });

            it('should parse multiple offsets with complex expressions', () => {
                const sql =
                    'offset(a, ROUND(b * 2)) + offset(c, IF(d > 0, 1, -1))';
                const result = parseTableCalculationFunctions(sql);

                expect(result).toHaveLength(2);
                // Functions are parsed last to first
                if (result[0].type === TableCalculationFunctionType.OFFSET) {
                    expect(result[0].column).toBe('c');
                    expect(result[0].rowOffset).toBe('IF(d > 0, 1, -1)');
                }
                if (result[1].type === TableCalculationFunctionType.OFFSET) {
                    expect(result[1].column).toBe('a');
                    expect(result[1].rowOffset).toBe('ROUND(b * 2)');
                }
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

        describe('offset_list parsing (row function)', () => {
            it('should parse offset_list function', () => {
                const sql = 'offset_list(revenue, -2, 3)';
                const result = parseTableCalculationFunctions(sql);

                expect(result).toHaveLength(1);
                expect(result[0].type).toBe(
                    TableCalculationFunctionType.OFFSET_LIST,
                );
                if (
                    result[0].type === TableCalculationFunctionType.OFFSET_LIST
                ) {
                    expect(result[0].column).toBe('revenue');
                    expect(result[0].rowOffset).toBe(-2);
                    expect(result[0].numValues).toBe(3);
                    expect(result[0].rawSql).toBe(
                        'offset_list(revenue, -2, 3)',
                    );
                }
            });

            it('should distinguish between offset_list and pivot_offset_list', () => {
                const sql =
                    'offset_list(revenue, -1, 3) + pivot_offset_list(revenue, -1, 3)';
                const result = parseTableCalculationFunctions(sql);

                expect(result).toHaveLength(2);
                const types = result.map((f) => f.type);
                expect(types).toContain(
                    TableCalculationFunctionType.OFFSET_LIST,
                );
                expect(types).toContain(
                    TableCalculationFunctionType.PIVOT_OFFSET_LIST,
                );
            });

            it('should parse offset_list with positive offset', () => {
                const sql = 'offset_list(orders, 0, 5)';
                const result = parseTableCalculationFunctions(sql);

                expect(result).toHaveLength(1);
                if (
                    result[0].type === TableCalculationFunctionType.OFFSET_LIST
                ) {
                    expect(result[0].column).toBe('orders');
                    expect(result[0].rowOffset).toBe(0);
                    expect(result[0].numValues).toBe(5);
                }
            });
        });

        describe('list parsing (row function)', () => {
            it('should parse list function with multiple values', () => {
                const sql = 'list(a, b, c)';
                const result = parseTableCalculationFunctions(sql);

                expect(result).toHaveLength(1);
                expect(result[0].type).toBe(TableCalculationFunctionType.LIST);
                if (result[0].type === TableCalculationFunctionType.LIST) {
                    expect(result[0].values).toEqual(['a', 'b', 'c']);
                    expect(result[0].rawSql).toBe('list(a, b, c)');
                }
            });

            it('should distinguish between list and offset_list', () => {
                const sql = 'list(a, b) + offset_list(revenue, -1, 3)';
                const result = parseTableCalculationFunctions(sql);

                expect(result).toHaveLength(2);
                const types = result.map((f) => f.type);
                expect(types).toContain(TableCalculationFunctionType.LIST);
                expect(types).toContain(
                    TableCalculationFunctionType.OFFSET_LIST,
                );
            });

            it('should parse list with nested function calls', () => {
                const sql = 'list(SUM(a), COUNT(b))';
                const result = parseTableCalculationFunctions(sql);

                expect(result).toHaveLength(1);
                if (result[0].type === TableCalculationFunctionType.LIST) {
                    expect(result[0].values).toEqual(['SUM(a)', 'COUNT(b)']);
                }
            });

            it('should parse list with two values', () => {
                const sql = 'list(revenue, costs)';
                const result = parseTableCalculationFunctions(sql);

                expect(result).toHaveLength(1);
                if (result[0].type === TableCalculationFunctionType.LIST) {
                    expect(result[0].values).toEqual(['revenue', 'costs']);
                }
            });
        });

        describe('lookup parsing', () => {
            it('should parse lookup function', () => {
                const sql = 'lookup(target_val, search_col, result_col)';
                const result = parseTableCalculationFunctions(sql);

                expect(result).toHaveLength(1);
                expect(result[0].type).toBe(
                    TableCalculationFunctionType.LOOKUP,
                );
                if (result[0].type === TableCalculationFunctionType.LOOKUP) {
                    expect(result[0].value).toBe('target_val');
                    expect(result[0].lookupColumn).toBe('search_col');
                    expect(result[0].resultColumn).toBe('result_col');
                    expect(result[0].rawSql).toBe(
                        'lookup(target_val, search_col, result_col)',
                    );
                }
            });

            it('should parse lookup with expressions', () => {
                const sql = 'lookup("active", status_col, revenue_col)';
                const result = parseTableCalculationFunctions(sql);

                expect(result).toHaveLength(1);
                if (result[0].type === TableCalculationFunctionType.LOOKUP) {
                    expect(result[0].value).toBe('"active"');
                    expect(result[0].lookupColumn).toBe('status_col');
                    expect(result[0].resultColumn).toBe('revenue_col');
                }
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
                    buildArray: jest.fn(
                        (elements: string[]) => `ARRAY[${elements.join(', ')}]`,
                    ),
                    buildArrayAgg: jest.fn(
                        (expression: string, orderBy?: string) =>
                            orderBy
                                ? `ARRAY_AGG(${expression} ORDER BY ${orderBy})`
                                : `ARRAY_AGG(${expression})`,
                    ),
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
                it('should compile pivot_offset_list to PostgreSQL array with adjacency guards', () => {
                    const sql = 'pivot_offset_list(revenue, -2, 3)';
                    const functions = parseTableCalculationFunctions(sql);
                    const compiled = compiler.compileFunctions(sql, functions);
                    // Returns PostgreSQL array with LAG and current values, with adjacency guards
                    const expectedSql =
                        'ARRAY[CASE WHEN LAG("column_index", 2) OVER (PARTITION BY "row_index" ORDER BY "column_index") = "column_index" + (-2) THEN LAG(revenue, 2) OVER (PARTITION BY "row_index" ORDER BY "column_index") ELSE NULL END, CASE WHEN LAG("column_index", 1) OVER (PARTITION BY "row_index" ORDER BY "column_index") = "column_index" + (-1) THEN LAG(revenue, 1) OVER (PARTITION BY "row_index" ORDER BY "column_index") ELSE NULL END, revenue]';
                    expect(compiled).toBe(expectedSql);
                });

                it('should compile pivot_offset_list with positive offset', () => {
                    const sql = 'pivot_offset_list(orders, 0, 3)';
                    const functions = parseTableCalculationFunctions(sql);
                    const compiled = compiler.compileFunctions(sql, functions);

                    // Returns array starting from current column and going forward, with adjacency guards
                    const expectedSql =
                        'ARRAY[orders, CASE WHEN LEAD("column_index", 1) OVER (PARTITION BY "row_index" ORDER BY "column_index") = "column_index" + (1) THEN LEAD(orders, 1) OVER (PARTITION BY "row_index" ORDER BY "column_index") ELSE NULL END, CASE WHEN LEAD("column_index", 2) OVER (PARTITION BY "row_index" ORDER BY "column_index") = "column_index" + (2) THEN LEAD(orders, 2) OVER (PARTITION BY "row_index" ORDER BY "column_index") ELSE NULL END]';
                    expect(compiled).toBe(expectedSql);
                });

                it('should compile pivot_offset_list spanning both directions', () => {
                    const sql = 'pivot_offset_list(revenue, -1, 3)';
                    const functions = parseTableCalculationFunctions(sql);
                    const compiled = compiler.compileFunctions(sql, functions);

                    // Returns array from previous to next column, with adjacency guards
                    const expectedSql =
                        'ARRAY[CASE WHEN LAG("column_index", 1) OVER (PARTITION BY "row_index" ORDER BY "column_index") = "column_index" + (-1) THEN LAG(revenue, 1) OVER (PARTITION BY "row_index" ORDER BY "column_index") ELSE NULL END, revenue, CASE WHEN LEAD("column_index", 1) OVER (PARTITION BY "row_index" ORDER BY "column_index") = "column_index" + (1) THEN LEAD(revenue, 1) OVER (PARTITION BY "row_index" ORDER BY "column_index") ELSE NULL END]';
                    expect(compiled).toBe(expectedSql);
                });

                it('should compile single-value forward offset with adjacency guard', () => {
                    // pivot_offset_list(metric, 1, 1) should return NULL when the next
                    // column_index is not consecutive (e.g., column 2 -> column 5 with gap)
                    const sql = 'pivot_offset_list(metric, 1, 1)';
                    const functions = parseTableCalculationFunctions(sql);
                    const compiled = compiler.compileFunctions(sql, functions);

                    const expectedSql =
                        'ARRAY[CASE WHEN LEAD("column_index", 1) OVER (PARTITION BY "row_index" ORDER BY "column_index") = "column_index" + (1) THEN LEAD(metric, 1) OVER (PARTITION BY "row_index" ORDER BY "column_index") ELSE NULL END]';
                    expect(compiled).toBe(expectedSql);

                    // The CASE WHEN guard ensures that if column_index jumps
                    // (e.g., from 2 to 5), the result is NULL instead of the
                    // value from column 5
                    expect(compiled).toContain('CASE WHEN');
                    expect(compiled).toContain('= "column_index" + (1)');
                    expect(compiled).toContain('ELSE NULL END');
                });

                it('should compile single-value backward offset with adjacency guard', () => {
                    const sql = 'pivot_offset_list(metric, -1, 1)';
                    const functions = parseTableCalculationFunctions(sql);
                    const compiled = compiler.compileFunctions(sql, functions);

                    const expectedSql =
                        'ARRAY[CASE WHEN LAG("column_index", 1) OVER (PARTITION BY "row_index" ORDER BY "column_index") = "column_index" + (-1) THEN LAG(metric, 1) OVER (PARTITION BY "row_index" ORDER BY "column_index") ELSE NULL END]';
                    expect(compiled).toBe(expectedSql);
                });

                it('should not add adjacency guard for zero offset element', () => {
                    // offset 0 refers to the current column, no guard needed
                    const sql = 'pivot_offset_list(metric, 0, 1)';
                    const functions = parseTableCalculationFunctions(sql);
                    const compiled = compiler.compileFunctions(sql, functions);

                    const expectedSql = 'ARRAY[metric]';
                    expect(compiled).toBe(expectedSql);
                    expect(compiled).not.toContain('CASE WHEN');
                });
            });

            describe('pivot_row compilation', () => {
                it('should compile pivot_row to PostgreSQL array aggregation', () => {
                    const sql = 'pivot_row(revenue)';
                    const functions = parseTableCalculationFunctions(sql);
                    const compiled = compiler.compileFunctions(sql, functions);
                    const expectedSql =
                        'ARRAY_AGG(revenue) OVER (PARTITION BY "row_index" ORDER BY "column_index" ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)';
                    expect(compiled).toBe(expectedSql);
                });

                it('should compile pivot_row with expression', () => {
                    const sql = 'pivot_row(revenue * 100)';
                    const functions = parseTableCalculationFunctions(sql);
                    const compiled = compiler.compileFunctions(sql, functions);

                    const expectedSql =
                        'ARRAY_AGG(revenue * 100) OVER (PARTITION BY "row_index" ORDER BY "column_index" ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)';
                    expect(compiled).toBe(expectedSql);
                });

                it('should compile pivot_row in complex expression', () => {
                    const sql = 'ARRAY_LENGTH(pivot_row(status), 1)';
                    const functions = parseTableCalculationFunctions(sql);
                    const compiled = compiler.compileFunctions(sql, functions);

                    const expectedSql =
                        'ARRAY_LENGTH(ARRAY_AGG(status) OVER (PARTITION BY "row_index" ORDER BY "column_index" ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING), 1)';
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

            describe('row() compilation', () => {
                it('should compile row() with ORDER BY', () => {
                    const sql = 'row()';
                    const functions = parseTableCalculationFunctions(sql);
                    const compiled = compiler.compileFunctions(
                        sql,
                        functions,
                        '"order_date" ASC',
                    );
                    expect(compiled).toBe(
                        'ROW_NUMBER() OVER (ORDER BY "order_date" ASC)',
                    );
                });

                it('should compile row() without sorts', () => {
                    const sql = 'row()';
                    const functions = parseTableCalculationFunctions(sql);
                    const compiled = compiler.compileFunctions(sql, functions);
                    expect(compiled).toBe('ROW_NUMBER() OVER ()');
                });

                it('should compile row() in expression', () => {
                    const sql = 'row() * 10';
                    const functions = parseTableCalculationFunctions(sql);
                    const compiled = compiler.compileFunctions(
                        sql,
                        functions,
                        '"date"',
                    );
                    expect(compiled).toBe(
                        'ROW_NUMBER() OVER (ORDER BY "date") * 10',
                    );
                });
            });

            describe('offset() compilation', () => {
                it('should compile offset with negative offset to LAG', () => {
                    const sql = 'offset(revenue, -1)';
                    const functions = parseTableCalculationFunctions(sql);
                    const compiled = compiler.compileFunctions(
                        sql,
                        functions,
                        '"order_date"',
                    );
                    expect(compiled).toBe(
                        'LAG(revenue, 1) OVER (ORDER BY "order_date")',
                    );
                });

                it('should compile offset with positive offset to LEAD', () => {
                    const sql = 'offset(revenue, 2)';
                    const functions = parseTableCalculationFunctions(sql);
                    const compiled = compiler.compileFunctions(
                        sql,
                        functions,
                        '"order_date"',
                    );
                    expect(compiled).toBe(
                        'LEAD(revenue, 2) OVER (ORDER BY "order_date")',
                    );
                });

                it('should compile offset with zero to passthrough', () => {
                    const sql = 'offset(revenue, 0)';
                    const functions = parseTableCalculationFunctions(sql);
                    const compiled = compiler.compileFunctions(
                        sql,
                        functions,
                        '"order_date"',
                    );
                    expect(compiled).toBe('revenue');
                });

                it('should compile offset without sorts', () => {
                    const sql = 'offset(revenue, -1)';
                    const functions = parseTableCalculationFunctions(sql);
                    const compiled = compiler.compileFunctions(sql, functions);
                    expect(compiled).toBe('LAG(revenue, 1) OVER ()');
                });

                it('should compile offset in complex expression', () => {
                    const sql = 'revenue - offset(revenue, -1)';
                    const functions = parseTableCalculationFunctions(sql);
                    const compiled = compiler.compileFunctions(
                        sql,
                        functions,
                        '"date" ASC',
                    );
                    expect(compiled).toBe(
                        'revenue - LAG(revenue, 1) OVER (ORDER BY "date" ASC)',
                    );
                });

                it('should compile offset with dynamic expression', () => {
                    const sql = 'offset(revenue, ${y_oy_calculation_offset})';
                    const functions = parseTableCalculationFunctions(sql);
                    const compiled = compiler.compileFunctions(
                        sql,
                        functions,
                        '"date"',
                    );
                    // Dynamic offsets compile to LAG (assume looking backwards for period comparisons)
                    expect(compiled).toBe(
                        'LAG(revenue, ${y_oy_calculation_offset}) OVER (ORDER BY "date")',
                    );
                });

                it('should compile offset with CASE expression', () => {
                    const sql = `offset(customers, CASE WHEN period='Month' THEN 12 ELSE 1 END)`;
                    const functions = parseTableCalculationFunctions(sql);
                    const compiled = compiler.compileFunctions(
                        sql,
                        functions,
                        '"date"',
                    );
                    // CASE expressions compile to LAG (assume looking backwards for period comparisons)
                    expect(compiled).toBe(
                        `LAG(customers, CASE WHEN period='Month' THEN 12 ELSE 1 END) OVER (ORDER BY "date")`,
                    );
                });
            });

            describe('index() compilation', () => {
                it('should compile index to NTH_VALUE with sorts', () => {
                    const sql = 'index(revenue, 1)';
                    const functions = parseTableCalculationFunctions(sql);
                    const compiled = compiler.compileFunctions(
                        sql,
                        functions,
                        '"order_date"',
                    );
                    expect(compiled).toBe(
                        'NTH_VALUE(revenue, 1) OVER (ORDER BY "order_date" ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)',
                    );
                });

                it('should compile index without sorts', () => {
                    const sql = 'index(revenue, 3)';
                    const functions = parseTableCalculationFunctions(sql);
                    const compiled = compiler.compileFunctions(sql, functions);
                    expect(compiled).toBe(
                        'NTH_VALUE(revenue, 3) OVER (ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)',
                    );
                });

                it('should compile index in expression', () => {
                    const sql = 'revenue / NULLIF(index(revenue, 1), 0)';
                    const functions = parseTableCalculationFunctions(sql);
                    const compiled = compiler.compileFunctions(
                        sql,
                        functions,
                        '"date"',
                    );
                    expect(compiled).toBe(
                        'revenue / NULLIF(NTH_VALUE(revenue, 1) OVER (ORDER BY "date" ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING), 0)',
                    );
                });
            });

            describe('offset_list() compilation', () => {
                it('should compile offset_list to array of LAG/LEAD', () => {
                    const sql = 'offset_list(revenue, -2, 3)';
                    const functions = parseTableCalculationFunctions(sql);
                    const compiled = compiler.compileFunctions(
                        sql,
                        functions,
                        '"date"',
                    );
                    expect(compiled).toBe(
                        'ARRAY[LAG(revenue, 2) OVER (ORDER BY "date"), LAG(revenue, 1) OVER (ORDER BY "date"), revenue]',
                    );
                });

                it('should compile offset_list with positive offset', () => {
                    const sql = 'offset_list(orders, 0, 3)';
                    const functions = parseTableCalculationFunctions(sql);
                    const compiled = compiler.compileFunctions(
                        sql,
                        functions,
                        '"date"',
                    );
                    expect(compiled).toBe(
                        'ARRAY[orders, LEAD(orders, 1) OVER (ORDER BY "date"), LEAD(orders, 2) OVER (ORDER BY "date")]',
                    );
                });

                it('should compile offset_list without sorts', () => {
                    const sql = 'offset_list(revenue, -1, 2)';
                    const functions = parseTableCalculationFunctions(sql);
                    const compiled = compiler.compileFunctions(sql, functions);
                    expect(compiled).toBe(
                        'ARRAY[LAG(revenue, 1) OVER (), revenue]',
                    );
                });
            });

            describe('list() compilation', () => {
                it('should compile list to array construction', () => {
                    const sql = 'list(a, b, c)';
                    const functions = parseTableCalculationFunctions(sql);
                    const compiled = compiler.compileFunctions(sql, functions);
                    expect(compiled).toBe('ARRAY[a, b, c]');
                });

                it('should compile list with two values', () => {
                    const sql = 'list(revenue, costs)';
                    const functions = parseTableCalculationFunctions(sql);
                    const compiled = compiler.compileFunctions(sql, functions);
                    expect(compiled).toBe('ARRAY[revenue, costs]');
                });

                it('should compile list in complex expression', () => {
                    const sql = 'ARRAY_LENGTH(list(a, b, c), 1)';
                    const functions = parseTableCalculationFunctions(sql);
                    const compiled = compiler.compileFunctions(sql, functions);
                    expect(compiled).toBe('ARRAY_LENGTH(ARRAY[a, b, c], 1)');
                });
            });

            describe('lookup() compilation', () => {
                it('should compile lookup to MAX CASE WHEN', () => {
                    const sql = 'lookup("active", status_col, revenue_col)';
                    const functions = parseTableCalculationFunctions(sql);
                    const compiled = compiler.compileFunctions(sql, functions);
                    expect(compiled).toBe(
                        'MAX(CASE WHEN status_col = "active" THEN revenue_col ELSE NULL END) OVER ()',
                    );
                });

                it('should compile lookup in expression', () => {
                    const sql = 'COALESCE(lookup(target, lcol, rcol), 0)';
                    const functions = parseTableCalculationFunctions(sql);
                    const compiled = compiler.compileFunctions(sql, functions);
                    expect(compiled).toBe(
                        'COALESCE(MAX(CASE WHEN lcol = target THEN rcol ELSE NULL END) OVER (), 0)',
                    );
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

        it('should include aggregate functions', () => {
            expect(AGGREGATE_FUNCTIONS).toContain(
                TableCalculationFunctionType.TOTAL,
            );
            expect(AGGREGATE_FUNCTIONS).toContain(
                TableCalculationFunctionType.ROW_TOTAL,
            );
        });
    });

    describe('total parsing', () => {
        it('should parse simple total call', () => {
            const sql = 'total("revenue")';
            const result = parseTableCalculationFunctions(sql);

            expect(result).toHaveLength(1);
            expect(result[0].type).toBe(TableCalculationFunctionType.TOTAL);
            if (result[0].type === TableCalculationFunctionType.TOTAL) {
                expect(result[0].expression).toBe('"revenue"');
                expect(result[0].rawSql).toBe('total("revenue")');
            }
        });

        it('should parse total with whitespace', () => {
            const sql = 'total ( "orders_revenue" )';
            const result = parseTableCalculationFunctions(sql);

            expect(result).toHaveLength(1);
            expect(result[0].type).toBe(TableCalculationFunctionType.TOTAL);
            if (result[0].type === TableCalculationFunctionType.TOTAL) {
                expect(result[0].expression).toBe('"orders_revenue"');
            }
        });

        it('should parse multiple total calls', () => {
            const sql =
                '"revenue" / total("revenue") + "users" / total("users")';
            const result = parseTableCalculationFunctions(sql);

            const totalCalls = result.filter(
                (f) => f.type === TableCalculationFunctionType.TOTAL,
            );
            expect(totalCalls).toHaveLength(2);
        });

        it('should not match row_total as total', () => {
            const sql = 'row_total("revenue")';
            const result = parseTableCalculationFunctions(sql);

            const totalCalls = result.filter(
                (f) => f.type === TableCalculationFunctionType.TOTAL,
            );
            expect(totalCalls).toHaveLength(0);

            const rowTotalCalls = result.filter(
                (f) => f.type === TableCalculationFunctionType.ROW_TOTAL,
            );
            expect(rowTotalCalls).toHaveLength(1);
        });

        it('should parse total with backtick-quoted field', () => {
            const sql = 'total(`revenue`)';
            const result = parseTableCalculationFunctions(sql);

            expect(result).toHaveLength(1);
            expect(result[0].type).toBe(TableCalculationFunctionType.TOTAL);
            if (result[0].type === TableCalculationFunctionType.TOTAL) {
                expect(result[0].expression).toBe('`revenue`');
            }
        });
    });

    describe('row_total parsing', () => {
        it('should parse simple row_total call', () => {
            const sql = 'row_total("count")';
            const result = parseTableCalculationFunctions(sql);

            expect(result).toHaveLength(1);
            expect(result[0].type).toBe(TableCalculationFunctionType.ROW_TOTAL);
            if (result[0].type === TableCalculationFunctionType.ROW_TOTAL) {
                expect(result[0].expression).toBe('"count"');
                expect(result[0].rawSql).toBe('row_total("count")');
            }
        });

        it('should parse row_total with whitespace', () => {
            const sql = 'row_total ( "unique_users" )';
            const result = parseTableCalculationFunctions(sql);

            expect(result).toHaveLength(1);
            expect(result[0].type).toBe(TableCalculationFunctionType.ROW_TOTAL);
            if (result[0].type === TableCalculationFunctionType.ROW_TOTAL) {
                expect(result[0].expression).toBe('"unique_users"');
            }
        });

        it('should parse both total and row_total in same expression', () => {
            const sql = '"revenue" / total("revenue") + row_total("revenue")';
            const result = parseTableCalculationFunctions(sql);

            const totalCalls = result.filter(
                (f) => f.type === TableCalculationFunctionType.TOTAL,
            );
            const rowTotalCalls = result.filter(
                (f) => f.type === TableCalculationFunctionType.ROW_TOTAL,
            );
            expect(totalCalls).toHaveLength(1);
            expect(rowTotalCalls).toHaveLength(1);
        });

        it('should parse total combined with offset', () => {
            const sql = 'total("revenue") + offset("revenue", -1)';
            const result = parseTableCalculationFunctions(sql);

            const totalCalls = result.filter(
                (f) => f.type === TableCalculationFunctionType.TOTAL,
            );
            const offsetCalls = result.filter(
                (f) => f.type === TableCalculationFunctionType.OFFSET,
            );
            expect(totalCalls).toHaveLength(1);
            expect(offsetCalls).toHaveLength(1);
        });
    });

    describe('buildTotalFieldRegex', () => {
        it('should match any quote char when no quoteChar specified', () => {
            const { totalRegex, rowTotalRegex } = buildTotalFieldRegex();
            expect('total("revenue")'.match(totalRegex)).toBeTruthy();
            expect('total(`revenue`)'.match(totalRegex)).toBeTruthy();
            expect("total('revenue')".match(totalRegex)).toBeTruthy();
            expect('row_total("cost")'.match(rowTotalRegex)).toBeTruthy();
            expect('row_total(`cost`)'.match(rowTotalRegex)).toBeTruthy();
        });

        it('should match only the specified quote char', () => {
            const { totalRegex } = buildTotalFieldRegex('"');
            expect('total("revenue")'.match(totalRegex)).toBeTruthy();
            expect('total(`revenue`)'.match(totalRegex)).toBeNull();
            expect("total('revenue')".match(totalRegex)).toBeNull();
        });

        it('should capture the field ID', () => {
            const { totalRegex } = buildTotalFieldRegex('"');
            totalRegex.lastIndex = 0;
            const match = totalRegex.exec('total("my_field_id")');
            expect(match?.[1]).toBe('my_field_id');
        });

        it('should handle backtick as quote char', () => {
            const { totalRegex, rowTotalRegex } = buildTotalFieldRegex('`');
            expect('total(`revenue`)'.match(totalRegex)).toBeTruthy();
            expect('total("revenue")'.match(totalRegex)).toBeNull();
            expect('row_total(`cost`)'.match(rowTotalRegex)).toBeTruthy();
        });
    });

    describe('extractTotalReferences', () => {
        it('should extract total field references', () => {
            const result = extractTotalReferences([
                {
                    compiledSql: '"revenue" / total("revenue")',
                },
            ]);
            expect(result.totalFields).toEqual(['revenue']);
            expect(result.rowTotalFields).toEqual([]);
        });

        it('should extract row_total field references', () => {
            const result = extractTotalReferences([
                {
                    compiledSql: 'row_total("unique_users")',
                },
            ]);
            expect(result.totalFields).toEqual([]);
            expect(result.rowTotalFields).toEqual(['unique_users']);
        });

        it('should extract both total and row_total references', () => {
            const result = extractTotalReferences([
                {
                    compiledSql:
                        '"revenue" / total("revenue") + row_total("count")',
                },
            ]);
            expect(result.totalFields).toEqual(['revenue']);
            expect(result.rowTotalFields).toEqual(['count']);
        });

        it('should deduplicate field references across table calcs', () => {
            const result = extractTotalReferences([
                { compiledSql: 'total("revenue")' },
                { compiledSql: '"cost" / total("revenue")' },
            ]);
            expect(result.totalFields).toEqual(['revenue']);
        });

        it('should handle multiple distinct field references', () => {
            const result = extractTotalReferences([
                {
                    compiledSql: 'total("revenue") + total("cost")',
                },
            ]);
            expect(result.totalFields).toEqual(
                expect.arrayContaining(['revenue', 'cost']),
            );
            expect(result.totalFields).toHaveLength(2);
        });

        it('should handle backtick-quoted fields', () => {
            const result = extractTotalReferences([
                { compiledSql: 'total(`revenue`)' },
            ]);
            expect(result.totalFields).toEqual(['revenue']);
        });

        it('should not match row_total as total', () => {
            const result = extractTotalReferences([
                { compiledSql: 'row_total("revenue")' },
            ]);
            expect(result.totalFields).toEqual([]);
            expect(result.rowTotalFields).toEqual(['revenue']);
        });

        it('should return empty arrays when no totals present', () => {
            const result = extractTotalReferences([
                { compiledSql: '"revenue" * 2' },
            ]);
            expect(result.totalFields).toEqual([]);
            expect(result.rowTotalFields).toEqual([]);
        });
    });
});
