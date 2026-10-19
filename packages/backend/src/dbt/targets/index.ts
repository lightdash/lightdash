import {
    assertUnreachable,
    WarehouseTypes,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import type {
    DbtTargetPolicy,
    DbtTargetResult,
} from '../../services/WarehouseClientFactory/CredentialResolver';
import { athenaTarget } from './athena';
import { bigqueryTarget } from './bigquery';
import { clickhouseTarget } from './clickhouse';
import { databricksTarget } from './databricks';
import { duckdbTarget } from './duckdb';
import { postgresTarget } from './postgres';
import { redshiftTarget } from './redshift';
import { snowflakeTarget } from './snowflake';
import { trinoTarget } from './trino';

export const toDbtTarget = (
    credentials: CreateWarehouseCredentials,
    policy: DbtTargetPolicy,
): DbtTargetResult => {
    switch (credentials.type) {
        case WarehouseTypes.BIGQUERY:
            return bigqueryTarget(credentials, policy);
        case WarehouseTypes.REDSHIFT:
            return redshiftTarget(credentials, policy);
        case WarehouseTypes.POSTGRES:
            return postgresTarget(credentials, policy);
        case WarehouseTypes.TRINO:
            return trinoTarget(credentials, policy);
        case WarehouseTypes.SNOWFLAKE:
            return snowflakeTarget(credentials, policy);
        case WarehouseTypes.DATABRICKS:
            return databricksTarget(credentials, policy);
        case WarehouseTypes.CLICKHOUSE:
            return clickhouseTarget(credentials, policy);
        case WarehouseTypes.DUCKDB:
            return duckdbTarget(credentials, policy);
        case WarehouseTypes.ATHENA:
            return athenaTarget(credentials, policy);
        default:
            const { type } = credentials;
            return assertUnreachable(
                credentials,
                `No profile implemented for warehouse type: ${type}`,
            );
    }
};
