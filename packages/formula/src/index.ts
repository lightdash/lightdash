import { parse } from './compiler';
import { createGenerator } from './codegen';
import type { ASTNode, CompileOptions, Dialect, FunctionDefinition } from './types';

export type { ASTNode, CompileOptions, Dialect, FunctionDefinition };
export { parse } from './compiler';

export function compile(formula: string, options: CompileOptions): string {
    const ast = parse(formula);
    const generator = createGenerator(options);
    return generator.generate(ast);
}

export function listFunctions(): FunctionDefinition[] {
    return [
        // Arithmetic operators are handled via grammar, not listed here
        // Logical
        { name: 'IF', description: 'Conditional expression', minArgs: 2, maxArgs: 3, category: 'logical' },
        { name: 'AND', description: 'Logical AND', minArgs: 2, maxArgs: 2, category: 'logical' },
        { name: 'OR', description: 'Logical OR', minArgs: 2, maxArgs: 2, category: 'logical' },
        { name: 'NOT', description: 'Logical NOT', minArgs: 1, maxArgs: 1, category: 'logical' },
        // Math
        { name: 'ABS', description: 'Absolute value', minArgs: 1, maxArgs: 1, category: 'math' },
        { name: 'ROUND', description: 'Round to decimal places', minArgs: 1, maxArgs: 2, category: 'math' },
        { name: 'CEIL', description: 'Round up to integer', minArgs: 1, maxArgs: 1, category: 'math' },
        { name: 'FLOOR', description: 'Round down to integer', minArgs: 1, maxArgs: 1, category: 'math' },
        { name: 'MIN', description: 'Minimum (scalar or aggregate)', minArgs: 1, maxArgs: 2, category: 'math' },
        { name: 'MAX', description: 'Maximum (scalar or aggregate)', minArgs: 1, maxArgs: 2, category: 'math' },
        // String
        { name: 'CONCAT', description: 'Concatenate strings', minArgs: 1, maxArgs: Infinity, category: 'string' },
        { name: 'LEN', description: 'String length', minArgs: 1, maxArgs: 1, category: 'string' },
        { name: 'TRIM', description: 'Remove whitespace', minArgs: 1, maxArgs: 1, category: 'string' },
        { name: 'LOWER', description: 'To lowercase', minArgs: 1, maxArgs: 1, category: 'string' },
        { name: 'UPPER', description: 'To uppercase', minArgs: 1, maxArgs: 1, category: 'string' },
        // Date
        { name: 'TODAY', description: 'Current date', minArgs: 0, maxArgs: 0, category: 'date' },
        { name: 'NOW', description: 'Current timestamp', minArgs: 0, maxArgs: 0, category: 'date' },
        { name: 'YEAR', description: 'Extract year', minArgs: 1, maxArgs: 1, category: 'date' },
        { name: 'MONTH', description: 'Extract month', minArgs: 1, maxArgs: 1, category: 'date' },
        { name: 'DAY', description: 'Extract day', minArgs: 1, maxArgs: 1, category: 'date' },
        // Null
        { name: 'COALESCE', description: 'First non-null value', minArgs: 1, maxArgs: Infinity, category: 'null' },
        { name: 'ISNULL', description: 'Check if null', minArgs: 1, maxArgs: 1, category: 'null' },
        // Aggregates
        { name: 'SUM', description: 'Sum values', minArgs: 1, maxArgs: 1, category: 'aggregate' },
        { name: 'AVERAGE', description: 'Average values', minArgs: 1, maxArgs: 1, category: 'aggregate' },
        { name: 'COUNT', description: 'Count values', minArgs: 0, maxArgs: 1, category: 'aggregate' },
        // Window functions
        { name: 'RUNNING_TOTAL', description: 'Running total (cumulative sum)', minArgs: 1, maxArgs: 1, category: 'window' },
        { name: 'ROW_NUMBER', description: 'Row number', minArgs: 0, maxArgs: 0, category: 'window' },
        { name: 'LAG', description: 'Previous row value', minArgs: 1, maxArgs: 3, category: 'window' },
        { name: 'LEAD', description: 'Next row value', minArgs: 1, maxArgs: 3, category: 'window' },
        { name: 'RANK', description: 'Rank with gaps', minArgs: 0, maxArgs: 0, category: 'window' },
        { name: 'DENSE_RANK', description: 'Rank without gaps', minArgs: 0, maxArgs: 0, category: 'window' },
        { name: 'NTILE', description: 'Distribute rows into buckets', minArgs: 1, maxArgs: 1, category: 'window' },
        { name: 'FIRST', description: 'First value in window', minArgs: 1, maxArgs: 1, category: 'window' },
        { name: 'LAST', description: 'Last value in window', minArgs: 1, maxArgs: 1, category: 'window' },
        { name: 'MOVING_SUM', description: 'Moving sum over preceding rows', minArgs: 2, maxArgs: 2, category: 'window' },
        { name: 'MOVING_AVG', description: 'Moving average over preceding rows', minArgs: 2, maxArgs: 2, category: 'window' },
    ];
}
