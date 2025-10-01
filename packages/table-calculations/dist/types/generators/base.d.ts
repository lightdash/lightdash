import type { Effect } from 'effect';
import { Context } from 'effect';
import type { ASTNode } from '../ast/types';
import type { SQLGenerationError, UnsupportedFunctionError, UnknownFieldError } from '../errors';
export type SqlDialect = 'postgres' | 'bigquery' | 'snowflake' | 'databricks' | 'duckdb';
export interface QueryParameter {
    readonly placeholder: string;
    readonly value: unknown;
    readonly type?: 'identifier' | 'literal';
}
declare const FieldResolver_base: Context.TagClass<FieldResolver, "FieldResolver", {
    readonly resolve: (fieldName: string) => Effect.Effect<string, UnknownFieldError>;
    readonly resolveParameterized?: (fieldName: string) => Effect.Effect<QueryParameter, UnknownFieldError>;
}>;
export declare class FieldResolver extends FieldResolver_base {
}
declare const SQLDialect_base: Context.TagClass<SQLDialect, "SQLDialect", {
    readonly dialect: SqlDialect;
    readonly quoteIdentifier: (name: string) => string;
}>;
export declare class SQLDialect extends SQLDialect_base {
}
export interface SQLGenerationResult {
    readonly sql: string;
    readonly parameters: readonly QueryParameter[];
}
export interface GeneratorContext {
    readonly windowPartition?: readonly string[];
    readonly windowOrder?: readonly string[];
    readonly useParameterizedQueries?: boolean;
    readonly parameters?: QueryParameter[];
}
export declare abstract class BaseSQLGenerator {
    abstract readonly dialect: SqlDialect;
    abstract generate(ast: ASTNode, context?: GeneratorContext): Effect.Effect<string, SQLGenerationError | UnsupportedFunctionError | UnknownFieldError, FieldResolver | SQLDialect>;
    abstract generateParameterized(ast: ASTNode, context?: GeneratorContext): Effect.Effect<SQLGenerationResult, SQLGenerationError | UnsupportedFunctionError | UnknownFieldError, FieldResolver | SQLDialect>;
    abstract supportsFunction(functionName: string): boolean;
    protected quoteIdentifier(name: string): string;
}
export {};
//# sourceMappingURL=base.d.ts.map