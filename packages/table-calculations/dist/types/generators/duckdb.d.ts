import { Effect } from 'effect';
import type { ASTNode } from '../ast/types';
import { SQLGenerationError, UnsupportedFunctionError } from '../errors';
import type { UnknownFieldError } from '../errors';
import { BaseSQLGenerator, type GeneratorContext, type SQLGenerationResult, FieldResolver, SQLDialect, type SqlDialect } from './base';
export declare class DuckDBGenerator extends BaseSQLGenerator {
    readonly dialect: SqlDialect;
    generate(ast: ASTNode, context?: GeneratorContext): Effect.Effect<string, SQLGenerationError | UnsupportedFunctionError | UnknownFieldError, FieldResolver | SQLDialect>;
    generateParameterized(ast: ASTNode, context?: GeneratorContext): Effect.Effect<SQLGenerationResult, SQLGenerationError | UnsupportedFunctionError | UnknownFieldError, FieldResolver | SQLDialect>;
    private generateNode;
    private generateBinaryOperator;
    private generateUnaryOperator;
    private generateFunctionCall;
    private generateWindowFunction;
    private generateFieldReference;
    private generateLiteral;
    private generateConditional;
    supportsFunction(functionName: string): boolean;
    private isWindowFunction;
}
//# sourceMappingURL=duckdb.d.ts.map