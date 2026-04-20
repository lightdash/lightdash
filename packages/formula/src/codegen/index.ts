import type { CompileOptions } from '../types';
import type { BaseSqlGenerator } from './base';
import { BigQuerySqlGenerator } from './bigquery';
import { DuckDBSqlGenerator } from './duckdb';
import { PostgresSqlGenerator } from './postgres';
import { RedshiftSqlGenerator } from './redshift';
import { SnowflakeSqlGenerator } from './snowflake';

export function createGenerator(options: CompileOptions): BaseSqlGenerator {
    switch (options.dialect) {
        case 'postgres':
            return new PostgresSqlGenerator(options);
        case 'redshift':
            return new RedshiftSqlGenerator(options);
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
