import { WarehouseTypes, type CliDeployMetadata } from '@lightdash/common';
import type { Target } from './types';

export class DbtLocationError extends Error {}

type DbtTargetLocation = NonNullable<CliDeployMetadata['dbtTarget']>;

const locationValue = (value: unknown, field: string): string => {
    if (value === undefined || value === null || value === '') {
        throw new DbtLocationError(`the selected target has no ${field}`);
    }
    if (
        typeof value !== 'string' ||
        !value.trim() ||
        value.length > 255 ||
        /[\u0000-\u001f\u007f]/.test(value)
    ) {
        throw new DbtLocationError(
            `the selected target has an invalid ${field}; use a non-empty location name of at most 255 characters without control characters`,
        );
    }
    return value;
};

const duckdbDatabase = (target: Target): string => {
    if (target.attach !== undefined && target.attach !== null) {
        if (!Array.isArray(target.attach)) {
            throw new DbtLocationError(
                'the selected DuckDB target has invalid attach entries',
            );
        }
        for (const entry of target.attach) {
            if (
                typeof entry !== 'object' ||
                entry === null ||
                !('path' in entry) ||
                typeof entry.path !== 'string'
            ) {
                throw new DbtLocationError(
                    'the selected DuckDB target has an invalid attach entry',
                );
            }
            if (entry.path.startsWith('ducklake:')) {
                return locationValue(
                    ('alias' in entry ? entry.alias : undefined) ??
                        target.schema,
                    'database or catalog',
                );
            }
        }
    }
    if (typeof target.path === 'string' && target.path.startsWith('md:')) {
        return locationValue(
            target.path.slice(3).split('?', 1)[0],
            'database or catalog',
        );
    }
    if (
        typeof target.path === 'string' &&
        target.path.endsWith('.duckdb') &&
        !/[\u0000-\u001f\u007f?#]/.test(target.path)
    ) {
        return locationValue(target.schema, 'database or catalog');
    }
    throw new DbtLocationError(
        'the selected DuckDB target does not provide a supported MotherDuck, DuckLake, or embedded location',
    );
};

export const getDbtTargetLocation = (target: Target): DbtTargetLocation => {
    const database = (value: unknown): string =>
        locationValue(value, 'database or catalog');
    switch (target.type) {
        case 'postgres':
            return {
                type: WarehouseTypes.POSTGRES,
                database: database(
                    target.dbname === ''
                        ? target.database
                        : (target.dbname ?? target.database),
                ),
            };
        case 'redshift':
            return {
                type: WarehouseTypes.REDSHIFT,
                database: database(
                    target.dbname === ''
                        ? target.database
                        : (target.dbname ?? target.database),
                ),
            };
        case 'snowflake':
            return {
                type: WarehouseTypes.SNOWFLAKE,
                database: database(target.database),
            };
        case 'bigquery':
            return {
                type: WarehouseTypes.BIGQUERY,
                database: database(target.project),
            };
        case 'databricks':
            return {
                type: WarehouseTypes.DATABRICKS,
                database: database(target.catalog ?? target.schema),
            };
        case 'trino':
            return {
                type: WarehouseTypes.TRINO,
                database: database(target.database),
            };
        case 'clickhouse':
            return {
                type: WarehouseTypes.CLICKHOUSE,
                database: database(target.schema),
            };
        case 'athena':
            return {
                type: WarehouseTypes.ATHENA,
                database: database(target.database),
                region: locationValue(target.region_name, 'region'),
            };
        case 'duckdb':
            return {
                type: WarehouseTypes.DUCKDB,
                database: duckdbDatabase(target),
            };
        case 'spark':
            throw new DbtLocationError(
                'the spark adapter does not provide a supported location',
            );
        default:
            throw new DbtLocationError(
                'the selected dbt adapter does not provide a supported location',
            );
    }
};
