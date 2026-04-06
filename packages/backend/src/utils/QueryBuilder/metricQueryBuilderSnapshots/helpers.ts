import { assertUnreachable, SupportedDbtAdapter } from '@lightdash/common';
// eslint-disable-next-line import/no-extraneous-dependencies
import { format, type SqlLanguage } from 'sql-formatter';
import { BuildQueryProps, MetricQueryBuilder } from '../MetricQueryBuilder';
import {
    INTRINSIC_USER_ATTRIBUTES,
    QUERY_BUILDER_UTC_TIMEZONE,
    warehouseClientMock,
} from '../MetricQueryBuilder.mock';

export const SNAPSHOT_DEFAULTS = {
    intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
    timezone: QUERY_BUILDER_UTC_TIMEZONE,
    warehouseSqlBuilder: warehouseClientMock,
} as const;

const getLanguage = (adapterType: SupportedDbtAdapter): SqlLanguage => {
    switch (adapterType) {
        case SupportedDbtAdapter.BIGQUERY:
            return 'bigquery';
        case SupportedDbtAdapter.SNOWFLAKE:
            return 'snowflake';
        case SupportedDbtAdapter.DATABRICKS:
            return 'spark';
        case SupportedDbtAdapter.TRINO:
        case SupportedDbtAdapter.ATHENA:
            return 'trino';
        case SupportedDbtAdapter.POSTGRES:
        case SupportedDbtAdapter.DUCKDB:
            return 'postgresql';
        case SupportedDbtAdapter.REDSHIFT:
            return 'redshift';
        case SupportedDbtAdapter.CLICKHOUSE:
            return 'sql';
        default:
            return assertUnreachable(
                adapterType,
                `Unsupported sql formatter adapter: ${adapterType}`,
            );
    }
};

const formatSqlForSnapshot = (
    sql: string,
    adapterType: SupportedDbtAdapter,
): string => {
    try {
        return format(sql, {
            language: getLanguage(adapterType),
        });
    } catch {
        return sql;
    }
};

export const buildQuery = (
    args: Omit<
        BuildQueryProps,
        | 'parameterDefinitions'
        | 'intrinsicUserAttributes'
        | 'timezone'
        | 'warehouseSqlBuilder'
    > &
        Partial<
            Pick<
                BuildQueryProps,
                'intrinsicUserAttributes' | 'timezone' | 'warehouseSqlBuilder'
            >
        >,
): string => {
    const { query } = new MetricQueryBuilder({
        parameterDefinitions: {},
        ...SNAPSHOT_DEFAULTS,
        ...args,
    }).compileQuery();

    return formatSqlForSnapshot(
        query,
        args.warehouseSqlBuilder?.getAdapterType() ??
            SNAPSHOT_DEFAULTS.warehouseSqlBuilder.getAdapterType(),
    );
};
