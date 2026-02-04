/**
 * Parser and type definitions for table calculation functions
 * Supporting both row-based and pivot-based functions
 */

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
