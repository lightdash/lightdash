import type { Dialect, CompileOptions } from '../types';
import { BaseSqlGenerator } from './base';
import { PostgresSqlGenerator } from './postgres';
import { BigQuerySqlGenerator } from './bigquery';
import { SnowflakeSqlGenerator } from './snowflake';
import { DuckDBSqlGenerator } from './duckdb';

export function createGenerator(options: CompileOptions): BaseSqlGenerator {
    switch (options.dialect) {
        case 'postgres':
            return new PostgresSqlGenerator(options);
        case 'bigquery':
            return new BigQuerySqlGenerator(options);
        case 'snowflake':
            return new SnowflakeSqlGenerator(options);
        case 'duckdb':
            return new DuckDBSqlGenerator(options);
        default: {
            const _exhaustive: never = options.dialect;
            throw new Error(`Unknown dialect: ${options.dialect}`);
        }
    }
}

export { BaseSqlGenerator } from './base';
