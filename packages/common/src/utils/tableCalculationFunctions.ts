/**
 * Parser and type definitions for table calculation functions
 * Supporting both row-based and pivot-based functions
 */

import type { WarehouseSqlBuilder } from '../types/warehouse';

// ============================================================================
// Function Type Enums
// ============================================================================

/**
 * All supported table calculation function types
 */
export enum TableCalculationFunctionType {
    // Row functions (operate across rows, within same column)
    ROW = 'row',
    INDEX = 'index',
    OFFSET = 'offset',
    OFFSET_LIST = 'offset_list',
    LOOKUP = 'lookup',
    LIST = 'list',

    // Pivot functions (operate across pivoted columns, within same row)
    PIVOT_COLUMN = 'pivot_column',
    PIVOT_INDEX = 'pivot_index',
    PIVOT_OFFSET = 'pivot_offset',
    PIVOT_OFFSET_LIST = 'pivot_offset_list',
    PIVOT_ROW = 'pivot_row',
    PIVOT_WHERE = 'pivot_where',
}

// ============================================================================
// Function Categories
// ============================================================================

/**
 * Row functions - operate across rows in unpivoted data
 */
export const ROW_FUNCTIONS = [
    TableCalculationFunctionType.ROW,
    TableCalculationFunctionType.INDEX,
    TableCalculationFunctionType.OFFSET,
    TableCalculationFunctionType.OFFSET_LIST,
    TableCalculationFunctionType.LOOKUP,
    TableCalculationFunctionType.LIST,
] as const;

/**
 * Pivot functions - operate across columns in pivoted data
 */
export const PIVOT_FUNCTIONS = [
    TableCalculationFunctionType.PIVOT_COLUMN,
    TableCalculationFunctionType.PIVOT_INDEX,
    TableCalculationFunctionType.PIVOT_OFFSET,
    TableCalculationFunctionType.PIVOT_OFFSET_LIST,
    TableCalculationFunctionType.PIVOT_ROW,
    TableCalculationFunctionType.PIVOT_WHERE,
] as const;

// ============================================================================
// Function Call Types
// ============================================================================

/**
 * Base type for all function calls
 */
interface BaseFunctionCall {
    type: TableCalculationFunctionType;
    rawSql: string; // Original SQL string for the function call
}

/**
 * Row function call types
 */
export interface RowFunctionCall extends BaseFunctionCall {
    type: TableCalculationFunctionType.ROW;
    // row() - returns current row number, no parameters
}

export interface IndexFunctionCall extends BaseFunctionCall {
    type: TableCalculationFunctionType.INDEX;
    expression: string; // The column/expression to get value from
    rowIndex: number; // The specific row index (1-based)
}

export interface OffsetFunctionCall extends BaseFunctionCall {
    type: TableCalculationFunctionType.OFFSET;
    column: string; // The column to offset
    rowOffset: number; // Number of rows to offset (negative = previous, positive = next)
}

export interface OffsetListFunctionCall extends BaseFunctionCall {
    type: TableCalculationFunctionType.OFFSET_LIST;
    column: string; // The column to get values from
    rowOffset: number; // Starting row offset
    numValues: number; // Number of values to return
}

export interface LookupFunctionCall extends BaseFunctionCall {
    type: TableCalculationFunctionType.LOOKUP;
    value: string; // Value to search for
    lookupColumn: string; // Column to search in
    resultColumn: string; // Column to return value from
}

export interface ListFunctionCall extends BaseFunctionCall {
    type: TableCalculationFunctionType.LIST;
    values: string[]; // List of values/expressions
}

/**
 * Pivot function call types
 */
export interface PivotColumnFunctionCall extends BaseFunctionCall {
    type: TableCalculationFunctionType.PIVOT_COLUMN;
    // pivot_column() - returns current pivot column index, no parameters
}

export interface PivotIndexFunctionCall extends BaseFunctionCall {
    type: TableCalculationFunctionType.PIVOT_INDEX;
    expression: string; // The expression to get value from
    pivotIndex: number; // The specific pivot column index (0-based)
}

export interface PivotOffsetFunctionCall extends BaseFunctionCall {
    type: TableCalculationFunctionType.PIVOT_OFFSET;
    expression: string; // The expression to offset
    columnOffset: number; // Number of columns to offset (negative = previous, positive = next)
}

export interface PivotOffsetListFunctionCall extends BaseFunctionCall {
    type: TableCalculationFunctionType.PIVOT_OFFSET_LIST;
    expression: string; // The expression to get values from
    columnOffset: number; // Starting column offset
    numValues: number; // Number of values to return
}

export interface PivotRowFunctionCall extends BaseFunctionCall {
    type: TableCalculationFunctionType.PIVOT_ROW;
    expression: string; // The expression to get all pivoted values from
}

export interface PivotWhereFunctionCall extends BaseFunctionCall {
    type: TableCalculationFunctionType.PIVOT_WHERE;
    selectExpression: string; // Boolean expression to select the pivot column
    valueExpression: string; // Expression to return when condition matches
}

/**
 * Union type for all function calls
 */
export type TableCalculationFunctionCall =
    // Row functions
    | RowFunctionCall
    | IndexFunctionCall
    | OffsetFunctionCall
    | OffsetListFunctionCall
    | LookupFunctionCall
    | ListFunctionCall
    // Pivot functions
    | PivotColumnFunctionCall
    | PivotIndexFunctionCall
    | PivotOffsetFunctionCall
    | PivotOffsetListFunctionCall
    | PivotRowFunctionCall
    | PivotWhereFunctionCall;

// ============================================================================
// Parser Functions
// ============================================================================

/**
 * Parse table calculation SQL to extract function calls
 */
export function parseTableCalculationFunctions(
    sql: string,
): TableCalculationFunctionCall[] {
    const functions: TableCalculationFunctionCall[] = [];
    let match;

    // Parse pivot_offset function calls
    const pivotOffsetRegex =
        /pivot_offset\s*\(\s*([^,()]+(?:\([^)]*\))?[^,()]*)\s*,\s*(-?\d+)\s*\)/gi;
    match = pivotOffsetRegex.exec(sql);
    while (match !== null) {
        functions.push({
            type: TableCalculationFunctionType.PIVOT_OFFSET,
            expression: match[1].trim(),
            columnOffset: parseInt(match[2], 10),
            rawSql: match[0],
        });
        match = pivotOffsetRegex.exec(sql);
    }

    // Parse pivot_column function calls
    const pivotColumnRegex = /pivot_column\s*\(\s*\)/gi;
    match = pivotColumnRegex.exec(sql);
    while (match !== null) {
        functions.push({
            type: TableCalculationFunctionType.PIVOT_COLUMN,
            rawSql: match[0],
        });
        match = pivotColumnRegex.exec(sql);
    }

    // Parse pivot_index function calls
    const pivotIndexRegex =
        /pivot_index\s*\(\s*([^,()]+(?:\([^)]*\))?[^,()]*)\s*,\s*(\d+)\s*\)/gi;
    match = pivotIndexRegex.exec(sql);
    while (match !== null) {
        functions.push({
            type: TableCalculationFunctionType.PIVOT_INDEX,
            expression: match[1].trim(),
            pivotIndex: parseInt(match[2], 10),
            rawSql: match[0],
        });
        match = pivotIndexRegex.exec(sql);
    }

    // Parse pivot_where function calls using a simpler approach
    // We'll find the function start, then carefully parse the two arguments
    const pivotWhereRegex = /pivot_where\s*\(/gi;
    let pivotMatch = pivotWhereRegex.exec(sql);
    while (pivotMatch !== null) {
        const startIdx = pivotMatch.index + pivotMatch[0].length;
        let parenCount = 1;
        let commaIdx = -1;
        let endIdx = -1;

        // Find the comma separating the two arguments and the closing parenthesis
        for (let i = startIdx; i < sql.length; i += 1) {
            if (sql[i] === '(') {
                parenCount += 1;
            } else if (sql[i] === ')') {
                parenCount -= 1;
                if (parenCount === 0) {
                    endIdx = i;
                    break;
                }
            } else if (sql[i] === ',' && parenCount === 1 && commaIdx === -1) {
                commaIdx = i;
            }
        }

        if (commaIdx !== -1 && endIdx !== -1) {
            const selectExpression = sql.slice(startIdx, commaIdx).trim();
            const valueExpression = sql.slice(commaIdx + 1, endIdx).trim();
            const rawSql = sql.slice(pivotMatch.index, endIdx + 1);

            functions.push({
                type: TableCalculationFunctionType.PIVOT_WHERE,
                selectExpression,
                valueExpression,
                rawSql,
            });
        }

        pivotMatch = pivotWhereRegex.exec(sql);
    }

    // Parse pivot_offset_list function calls
    const pivotOffsetListRegex =
        /pivot_offset_list\s*\(\s*([^,()]+(?:\([^)]*\))?[^,()]*)\s*,\s*(-?\d+)\s*,\s*(\d+)\s*\)/gi;
    match = pivotOffsetListRegex.exec(sql);
    while (match !== null) {
        functions.push({
            type: TableCalculationFunctionType.PIVOT_OFFSET_LIST,
            expression: match[1].trim(),
            columnOffset: parseInt(match[2], 10),
            numValues: parseInt(match[3], 10),
            rawSql: match[0],
        });
        match = pivotOffsetListRegex.exec(sql);
    }

    // Parse pivot_row function calls
    const pivotRowRegex =
        /pivot_row\s*\(\s*([^()]+(?:\([^)]*\))?[^()]*)\s*\)/gi;
    match = pivotRowRegex.exec(sql);
    while (match !== null) {
        functions.push({
            type: TableCalculationFunctionType.PIVOT_ROW,
            expression: match[1].trim(),
            rawSql: match[0],
        });
        match = pivotRowRegex.exec(sql);
    }

    // Parse row function calls
    const rowRegex = /row\s*\(\s*\)/gi;
    match = rowRegex.exec(sql);
    while (match !== null) {
        functions.push({
            type: TableCalculationFunctionType.ROW,
            rawSql: match[0],
        });
        match = rowRegex.exec(sql);
    }

    // Parse offset function calls (but not pivot_offset)
    const offsetRegex = /\boffset\s*\(\s*([^,()]+)\s*,\s*(-?\d+)\s*\)/gi;
    match = offsetRegex.exec(sql);
    while (match !== null) {
        // Skip if this is actually a pivot_offset
        const startIdx = match.index;
        const beforeMatch = sql.slice(Math.max(0, startIdx - 6), startIdx);
        if (!beforeMatch.endsWith('pivot_')) {
            functions.push({
                type: TableCalculationFunctionType.OFFSET,
                column: match[1].trim(),
                rowOffset: parseInt(match[2], 10),
                rawSql: match[0],
            });
        }
        match = offsetRegex.exec(sql);
    }

    // Parse index function calls (but not pivot_index)
    const indexRegex =
        /\bindex\s*\(\s*([^,()]+(?:\([^)]*\))?[^,()]*)\s*,\s*(\d+)\s*\)/gi;
    match = indexRegex.exec(sql);
    while (match !== null) {
        // Skip if this is actually a pivot_index
        const startIdx = match.index;
        const beforeMatch = sql.slice(Math.max(0, startIdx - 6), startIdx);
        if (!beforeMatch.endsWith('pivot_')) {
            functions.push({
                type: TableCalculationFunctionType.INDEX,
                expression: match[1].trim(),
                rowIndex: parseInt(match[2], 10),
                rawSql: match[0],
            });
        }
        match = indexRegex.exec(sql);
    }

    // Additional function parsers will be added as they are implemented
    // For now, we're focusing on the main structure

    // Sort functions by their position in the SQL from last to first (reverse order)
    functions.sort((a, b) => {
        const posA = sql.indexOf(a.rawSql);
        const posB = sql.indexOf(b.rawSql);
        return posB - posA; // Reversed: B - A instead of A - B
    });

    return functions;
}

/**
 * Checks if the given function type is a pivot function.
 * Pivot functions operate across pivot columns (horizontal).
 * @param type - The table calculation function type
 * @returns True if the function is a pivot function
 */
export function isPivotFunction(type: TableCalculationFunctionType): boolean {
    return (
        PIVOT_FUNCTIONS as readonly TableCalculationFunctionType[]
    ).includes(type);
}

/**
 * Checks if the given function type is a row function.
 * Row functions operate across rows (vertical).
 * @param type - The table calculation function type
 * @returns True if the function is a row function
 */
export function isRowFunction(type: TableCalculationFunctionType): boolean {
    return (ROW_FUNCTIONS as readonly TableCalculationFunctionType[]).includes(
        type,
    );
}

/**
 * Checks if any of the parsed functions are pivot functions.
 * @param functions - Array of parsed table calculation functions
 * @returns True if any function is a pivot function
 */
export function hasPivotFunctions(
    functions: TableCalculationFunctionCall[],
): boolean {
    return functions.some((f) => isPivotFunction(f.type));
}

/**
 * Checks if any of the parsed functions are row functions.
 * @param functions - Array of parsed table calculation functions
 * @returns True if any function is a row function
 */
export function hasRowFunctions(
    functions: TableCalculationFunctionCall[],
): boolean {
    return functions.some((f) => isRowFunction(f.type));
}

// ============================================================================
// Function Compiler Class
// ============================================================================

/**
 * Compiler for table calculation functions to SQL
 */
export class TableCalculationFunctionCompiler {
    constructor(private warehouseSqlBuilder: WarehouseSqlBuilder) {}

    /**
     * Compiles all functions in a SQL expression.
     * @param sql - The SQL expression containing pivot functions
     * @param functions - Array of parsed table calculation functions
     * @returns SQL with functions compiled to their SQL equivalents
     */
    compileFunctions(
        sql: string,
        functions: TableCalculationFunctionCall[],
    ): string {
        let processedSql = sql;

        for (const func of functions) {
            switch (func.type) {
                case TableCalculationFunctionType.PIVOT_OFFSET: {
                    const pivotOffsetFunc = func as PivotOffsetFunctionCall;
                    const compiled = this.compilePivotOffset(
                        pivotOffsetFunc.expression,
                        pivotOffsetFunc.columnOffset,
                    );
                    processedSql = processedSql.replace(func.rawSql, compiled);
                    break;
                }
                case TableCalculationFunctionType.PIVOT_COLUMN: {
                    const compiled = this.compilePivotColumn();
                    processedSql = processedSql.replace(func.rawSql, compiled);
                    break;
                }
                case TableCalculationFunctionType.PIVOT_INDEX: {
                    const pivotIndexFunc = func as PivotIndexFunctionCall;
                    const compiled = this.compilePivotIndex(
                        pivotIndexFunc.expression,
                        pivotIndexFunc.pivotIndex,
                    );
                    processedSql = processedSql.replace(func.rawSql, compiled);
                    break;
                }
                case TableCalculationFunctionType.PIVOT_WHERE: {
                    const pivotWhereFunc = func as PivotWhereFunctionCall;
                    const compiled = this.compilePivotWhere(
                        pivotWhereFunc.selectExpression,
                        pivotWhereFunc.valueExpression,
                    );
                    processedSql = processedSql.replace(func.rawSql, compiled);
                    break;
                }
                case TableCalculationFunctionType.PIVOT_OFFSET_LIST: {
                    const pivotOffsetListFunc =
                        func as PivotOffsetListFunctionCall;
                    const compiled = this.compilePivotOffsetList(
                        pivotOffsetListFunc.expression,
                        pivotOffsetListFunc.columnOffset,
                        pivotOffsetListFunc.numValues,
                    );
                    processedSql = processedSql.replace(func.rawSql, compiled);
                    break;
                }
                case TableCalculationFunctionType.PIVOT_ROW: {
                    const pivotRowFunc = func as PivotRowFunctionCall;
                    const compiled = this.compilePivotRow(
                        pivotRowFunc.expression,
                    );
                    processedSql = processedSql.replace(func.rawSql, compiled);
                    break;
                }
                default:
                    // Not implemented yet
                    break;
            }
        }

        return processedSql;
    }

    /**
     * Compiles a pivot_offset function call to a guarded SQL window function.
     * Converts pivot_offset(expression, n) to LAG or LEAD with adjacency checks.
     * Returns NULL if the offset row is not exactly n time periods away.
     * @param expression - The SQL expression inside pivot_offset
     * @param columnOffset - The offset value (negative for LAG/previous, positive for LEAD/next)
     * @returns Compiled SQL with CASE statement checking for adjacent time periods
     */
    private compilePivotOffset(
        expression: string,
        columnOffset: number,
    ): string {
        const q = this.warehouseSqlBuilder.getFieldQuoteChar();

        if (columnOffset === 0) {
            // No offset, return expression as-is
            return expression;
        }

        const windowFunction = columnOffset < 0 ? 'LAG' : 'LEAD';
        const offsetValue = Math.abs(columnOffset);

        // The window partitions by column_index (pivot dimension like status)
        // and orders by row_index
        const windowClause = `OVER (PARTITION BY ${q}column_index${q} ORDER BY ${q}row_index${q})`;

        // For offset of 1, check if the previous/next row_index is exactly 1 away
        // For offset of n, check if the nth row_index is exactly n away
        const expectedDiff = columnOffset < 0 ? -offsetValue : offsetValue;

        // Build the guarded expression that returns NULL for non-adjacent time periods
        return `CASE WHEN ${windowFunction}(${q}row_index${q}, ${offsetValue}) ${windowClause} = ${q}row_index${q} + (${expectedDiff}) THEN ${windowFunction}(${expression}, ${offsetValue}) ${windowClause} ELSE NULL END`;
    }

    /**
     * Compiles a pivot_column function call to return the current column index.
     * The pivot_column() function returns the index of the current pivot column.
     * @returns SQL expression that retrieves the column_index value
     */
    private compilePivotColumn(): string {
        const q = this.warehouseSqlBuilder.getFieldQuoteChar();
        return `${q}column_index${q}`;
    }

    /**
     * Compiles a pivot_index function call to return a value from a specific pivot column.
     * Uses a window function to find the value from the row with the same row_index
     * but the specified column_index.
     * @param expression - The SQL expression to evaluate
     * @param pivotIndex - The specific pivot column index (0-based)
     * @returns SQL with window function to retrieve value from specified column
     */
    private compilePivotIndex(expression: string, pivotIndex: number): string {
        const q = this.warehouseSqlBuilder.getFieldQuoteChar();

        // Use MAX (or any aggregate) with a CASE to get the value from the row
        // with matching row_index and the specified column_index
        // The window partitions by row_index to group all columns of the same row
        return `MAX(CASE WHEN ${q}column_index${q} = ${pivotIndex} THEN ${expression} ELSE NULL END) OVER (PARTITION BY ${q}row_index${q})`;
    }

    /**
     * Compiles a pivot_where function call to return a value from the first pivot column matching a condition.
     * Evaluates the select expression for each pivot column and returns the value expression
     * from the first column where the condition is true.
     * @param selectExpression - Boolean expression to evaluate for each pivot column
     * @param valueExpression - Expression to return when condition matches
     * @returns SQL with conditional aggregation to find first matching pivot column
     */
    private compilePivotWhere(
        selectExpression: string,
        valueExpression: string,
    ): string {
        const q = this.warehouseSqlBuilder.getFieldQuoteChar();

        // Use MIN with column_index to get the first matching column
        // Then use that column_index to get the value
        return `MAX(CASE WHEN ${q}column_index${q} = (SELECT MIN(${q}column_index${q}) FROM (SELECT ${q}column_index${q}, ${selectExpression} AS condition FROM DUAL) WHERE condition = TRUE) THEN ${valueExpression} ELSE NULL END) OVER (PARTITION BY ${q}row_index${q})`;
    }

    /**
     * Compiles a pivot_offset_list function call to return an array of values from consecutive pivot columns.
     * Uses PostgreSQL array construction syntax with window functions.
     * @param expression - The SQL expression to evaluate
     * @param columnOffset - Starting column offset (negative = previous, positive = next)
     * @param numValues - Number of consecutive values to return
     * @returns SQL array construction with window functions
     */
    private compilePivotOffsetList(
        expression: string,
        columnOffset: number,
        numValues: number,
    ): string {
        const q = this.warehouseSqlBuilder.getFieldQuoteChar();

        // Build array of values from consecutive pivot columns
        const arrayElements: string[] = [];

        for (let i = 0; i < numValues; i += 1) {
            const offset = columnOffset + i;

            if (offset === 0) {
                // Current column
                arrayElements.push(expression);
            } else {
                // Use LAG or LEAD for other columns, with adjacency guard
                const windowFunction = offset < 0 ? 'LAG' : 'LEAD';
                const offsetValue = Math.abs(offset);
                const windowClause = `OVER (PARTITION BY ${q}row_index${q} ORDER BY ${q}column_index${q})`;

                // Guard: only return the value if the column_index at the offset position
                // is exactly the expected column_index away, otherwise return NULL.
                // This prevents skipping over missing columns (e.g., jumping from column 2 to column 5).
                arrayElements.push(
                    `CASE WHEN ${windowFunction}(${q}column_index${q}, ${offsetValue}) ${windowClause} = ${q}column_index${q} + (${offset}) THEN ${windowFunction}(${expression}, ${offsetValue}) ${windowClause} ELSE NULL END`,
                );
            }
        }

        // Use warehouse-specific array construction
        return this.warehouseSqlBuilder.buildArray(arrayElements);
    }

    /**
     * Compiles a pivot_row function call to return all values from the current row across all pivot columns.
     * Uses warehouse-specific array aggregation to collect all values for the expression across pivot columns.
     * @param expression - The SQL expression to evaluate for each pivot column
     * @returns SQL array aggregation for all pivot values in current row
     */
    private compilePivotRow(expression: string): string {
        const q = this.warehouseSqlBuilder.getFieldQuoteChar();

        // Array aggregation with window functions doesn't support ORDER BY inside the aggregate
        // We need to use the base array aggregation without ordering and put ORDER BY in the window clause
        const baseAgg = this.warehouseSqlBuilder.buildArrayAgg(expression);
        return `${baseAgg} OVER (PARTITION BY ${q}row_index${q} ORDER BY ${q}column_index${q} ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)`;
    }
}
