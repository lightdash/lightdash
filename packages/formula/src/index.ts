import { parse } from './compiler';
import { createGenerator } from './codegen';
import { FUNCTION_DEFINITIONS } from './functions';
import type { ASTNode, CompileOptions, Dialect, FunctionDefinition } from './types';

export type { ASTNode, CompileOptions, Dialect, FunctionDefinition };
export { parse } from './compiler';
export { FUNCTION_DEFINITIONS } from './functions';

export function compile(formula: string, options: CompileOptions): string {
    const ast = parse(formula);
    const generator = createGenerator(options);
    return generator.generate(ast);
}

export function listFunctions(): FunctionDefinition[] {
    return FUNCTION_DEFINITIONS;
}
