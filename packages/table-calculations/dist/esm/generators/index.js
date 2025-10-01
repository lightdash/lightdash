import { Effect, Layer } from 'effect';
import { FieldResolver, SQLDialect, } from './base';
import { PostgreSQLGenerator } from './postgres';
import { DuckDBGenerator } from './duckdb';
// Export all generators
export { PostgreSQLGenerator } from './postgres';
export { DuckDBGenerator } from './duckdb';
export { FieldResolver, SQLDialect } from './base';
// Factory for creating generators
export function createGenerator(dialect) {
    switch (dialect) {
        case 'postgres':
            return new PostgreSQLGenerator();
        case 'duckdb':
            return new DuckDBGenerator();
        case 'bigquery':
        case 'snowflake':
        case 'databricks':
            // For now, fall back to PostgreSQL generator
            // TODO: Implement specific generators for each dialect
            return new PostgreSQLGenerator();
        default:
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            throw new Error(`Unsupported dialect: ${dialect}`);
    }
}
// Convenience function to generate SQL with services
export function generateSQL(ast, options) {
    const generator = createGenerator(options.dialect);
    // Create service layers
    const dialectLayer = Layer.succeed(SQLDialect, {
        dialect: options.dialect,
        quoteIdentifier: (name) => {
            switch (options.dialect) {
                case 'postgres':
                case 'snowflake':
                case 'duckdb':
                    return `"${name}"`;
                case 'bigquery':
                    return `\`${name}\``;
                case 'databricks':
                    return `\`${name}\``;
                default:
                    return `"${name}"`;
            }
        },
    });
    const fieldResolverLayer = Layer.succeed(FieldResolver, {
        resolve: options.fieldResolver || ((field) => Effect.succeed(field)),
    });
    return Effect.provide(generator.generate(ast, options.context), Layer.merge(dialectLayer, fieldResolverLayer));
}
// Convenience function to generate parameterized SQL with services
export function generateParameterizedSQL(ast, options) {
    const generator = createGenerator(options.dialect);
    // Create service layers
    const dialectLayer = Layer.succeed(SQLDialect, {
        dialect: options.dialect,
        quoteIdentifier: (name) => {
            switch (options.dialect) {
                case 'postgres':
                case 'snowflake':
                case 'duckdb':
                    return `"${name}"`;
                case 'bigquery':
                    return `\`${name}\``;
                case 'databricks':
                    return `\`${name}\``;
                default:
                    return `"${name}"`;
            }
        },
    });
    const fieldResolverLayer = Layer.succeed(FieldResolver, {
        resolve: options.fieldResolver || ((field) => Effect.succeed(field)),
        resolveParameterized: options.parameterizedFieldResolver,
    });
    return Effect.provide(generator.generateParameterized(ast, options.context), Layer.merge(dialectLayer, fieldResolverLayer));
}
//# sourceMappingURL=index.js.map