"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SQLDialect = exports.FieldResolver = exports.DuckDBGenerator = exports.PostgreSQLGenerator = void 0;
exports.createGenerator = createGenerator;
exports.generateSQL = generateSQL;
exports.generateParameterizedSQL = generateParameterizedSQL;
const effect_1 = require("effect");
const base_1 = require("./base");
const postgres_1 = require("./postgres");
const duckdb_1 = require("./duckdb");
// Export all generators
var postgres_2 = require("./postgres");
Object.defineProperty(exports, "PostgreSQLGenerator", { enumerable: true, get: function () { return postgres_2.PostgreSQLGenerator; } });
var duckdb_2 = require("./duckdb");
Object.defineProperty(exports, "DuckDBGenerator", { enumerable: true, get: function () { return duckdb_2.DuckDBGenerator; } });
var base_2 = require("./base");
Object.defineProperty(exports, "FieldResolver", { enumerable: true, get: function () { return base_2.FieldResolver; } });
Object.defineProperty(exports, "SQLDialect", { enumerable: true, get: function () { return base_2.SQLDialect; } });
// Factory for creating generators
function createGenerator(dialect) {
    switch (dialect) {
        case 'postgres':
            return new postgres_1.PostgreSQLGenerator();
        case 'duckdb':
            return new duckdb_1.DuckDBGenerator();
        case 'bigquery':
        case 'snowflake':
        case 'databricks':
            // For now, fall back to PostgreSQL generator
            // TODO: Implement specific generators for each dialect
            return new postgres_1.PostgreSQLGenerator();
        default:
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            throw new Error(`Unsupported dialect: ${dialect}`);
    }
}
// Convenience function to generate SQL with services
function generateSQL(ast, options) {
    const generator = createGenerator(options.dialect);
    // Create service layers
    const dialectLayer = effect_1.Layer.succeed(base_1.SQLDialect, {
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
    const fieldResolverLayer = effect_1.Layer.succeed(base_1.FieldResolver, {
        resolve: options.fieldResolver || ((field) => effect_1.Effect.succeed(field)),
    });
    return effect_1.Effect.provide(generator.generate(ast, options.context), effect_1.Layer.merge(dialectLayer, fieldResolverLayer));
}
// Convenience function to generate parameterized SQL with services
function generateParameterizedSQL(ast, options) {
    const generator = createGenerator(options.dialect);
    // Create service layers
    const dialectLayer = effect_1.Layer.succeed(base_1.SQLDialect, {
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
    const fieldResolverLayer = effect_1.Layer.succeed(base_1.FieldResolver, {
        resolve: options.fieldResolver || ((field) => effect_1.Effect.succeed(field)),
        resolveParameterized: options.parameterizedFieldResolver,
    });
    return effect_1.Effect.provide(generator.generateParameterized(ast, options.context), effect_1.Layer.merge(dialectLayer, fieldResolverLayer));
}
//# sourceMappingURL=index.js.map