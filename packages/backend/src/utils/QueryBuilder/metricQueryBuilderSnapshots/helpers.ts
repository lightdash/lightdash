import { SupportedDbtAdapter } from '@lightdash/common';
// eslint-disable-next-line import/no-extraneous-dependencies
import { format, type FormatOptionsWithLanguage } from 'sql-formatter';
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

const getLanguage = (
    adapterType?: SupportedDbtAdapter,
): FormatOptionsWithLanguage['language'] => {
    switch (adapterType) {
        case SupportedDbtAdapter.BIGQUERY:
            return 'bigquery';
        case SupportedDbtAdapter.SNOWFLAKE:
            return 'snowflake';
        case SupportedDbtAdapter.TRINO:
        case SupportedDbtAdapter.DATABRICKS:
            return 'spark';
        case SupportedDbtAdapter.POSTGRES:
            return 'postgresql';
        case SupportedDbtAdapter.REDSHIFT:
            return 'redshift';
        default:
            return 'sql';
    }
};

const formatSqlForSnapshot = (
    sql: string,
    adapterType?: SupportedDbtAdapter,
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
