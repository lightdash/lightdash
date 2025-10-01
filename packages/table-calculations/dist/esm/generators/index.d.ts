import { Effect } from 'effect';
import type { ASTNode } from '../ast/types';
import type { SQLGenerationError, UnsupportedFunctionError, UnknownFieldError } from '../errors';
import type { SqlDialect, GeneratorContext, QueryParameter, SQLGenerationResult } from './base';
import { PostgreSQLGenerator } from './postgres';
import { DuckDBGenerator } from './duckdb';
export { PostgreSQLGenerator } from './postgres';
export { DuckDBGenerator } from './duckdb';
export { FieldResolver, SQLDialect, type GeneratorContext, type SqlDialect, type QueryParameter, type SQLGenerationResult } from './base';
export declare function createGenerator(dialect: SqlDialect): PostgreSQLGenerator | DuckDBGenerator;
export declare function generateSQL(ast: ASTNode, options: {
    dialect: SqlDialect;
    fieldResolver?: (fieldName: string) => Effect.Effect<string, UnknownFieldError>;
    context?: GeneratorContext;
}): Effect.Effect<string, SQLGenerationError | UnsupportedFunctionError | UnknownFieldError>;
export declare function generateParameterizedSQL(ast: ASTNode, options: {
    dialect: SqlDialect;
    fieldResolver?: (fieldName: string) => Effect.Effect<string, UnknownFieldError>;
    parameterizedFieldResolver?: (fieldName: string) => Effect.Effect<QueryParameter, UnknownFieldError>;
    context?: GeneratorContext;
}): Effect.Effect<SQLGenerationResult, SQLGenerationError | UnsupportedFunctionError | UnknownFieldError>;
//# sourceMappingURL=index.d.ts.map