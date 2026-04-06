import { formatSql, type WarehouseClient } from '@lightdash/common';
import { BuildQueryProps, MetricQueryBuilder } from '../MetricQueryBuilder';
import {
    INTRINSIC_USER_ATTRIBUTES,
    QUERY_BUILDER_UTC_TIMEZONE,
    warehouseClientMock,
} from '../MetricQueryBuilder.mock';

export const SNAPSHOT_DEFAULTS = {
    intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
    timezone: QUERY_BUILDER_UTC_TIMEZONE,
    warehouseClient: warehouseClientMock,
} as const;

export const buildQuery = (
    args: Omit<
        BuildQueryProps,
        | 'parameterDefinitions'
        | 'intrinsicUserAttributes'
        | 'timezone'
        | 'warehouseSqlBuilder'
    > &
        Partial<
            Pick<BuildQueryProps, 'intrinsicUserAttributes' | 'timezone'>
        > & {
            warehouseClient?: WarehouseClient;
        },
): string => {
    const warehouseClient =
        args.warehouseClient ?? SNAPSHOT_DEFAULTS.warehouseClient;

    const { query } = new MetricQueryBuilder({
        parameterDefinitions: {},
        ...SNAPSHOT_DEFAULTS,
        ...args,
        warehouseSqlBuilder: warehouseClient,
    }).compileQuery();

    return formatSql(query, warehouseClient.credentials.type);
};
