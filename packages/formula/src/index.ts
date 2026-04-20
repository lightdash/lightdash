import { createGenerator } from './codegen';
import { parse } from './compiler';
import { FUNCTION_DEFINITIONS } from './functions';
import type { FunctionDefinitionEntry } from './functions';
import type {
    AggregateContext,
    ASTNode,
    CompileOptions,
    Dialect,
    FunctionCategory,
    FunctionDefinition,
} from './types';

export type {
    AggregateContext,
    ASTNode,
    CompileOptions,
    Dialect,
    FunctionCategory,
    FunctionDefinition,
};
export type {
    FunctionName,
    FunctionDefinitionEntry,
    FunctionDefinitionFor,
} from './functions';
export { parse } from './compiler';
export { extractColumnRefs } from './ast';
export { FUNCTION_CATALOG, FUNCTION_DEFINITIONS } from './functions';

export function compile(formula: string, options: CompileOptions): string {
    const ast = parse(formula);
    const generator = createGenerator(options);
    return generator.generate(ast);
}

export function listFunctions(): readonly FunctionDefinitionEntry[] {
    return FUNCTION_DEFINITIONS;
}
