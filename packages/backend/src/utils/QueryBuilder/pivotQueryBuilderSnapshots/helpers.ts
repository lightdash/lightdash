import {
    formatSql,
    SupportedDbtAdapter,
    WarehouseTypes,
    WeekDay,
    type PivotConfiguration,
    type WarehouseSqlBuilder,
} from '@lightdash/common';
import { PivotQueryBuilder } from '../PivotQueryBuilder';

const mockPostgresSqlBuilder = {
    getFieldQuoteChar: () => '"',
    getAdapterType: () => SupportedDbtAdapter.POSTGRES,
    getStartOfWeek: () => WeekDay.MONDAY,
} as unknown as WarehouseSqlBuilder;

export const buildPivotQuery = (
    pivotConfiguration: PivotConfiguration,
    opts?: { baseSql?: string; columnLimit?: number },
): string => {
    const builder = new PivotQueryBuilder(
        opts?.baseSql ?? 'SELECT * FROM events',
        pivotConfiguration,
        mockPostgresSqlBuilder,
    );
    const sql = builder.toSql(
        opts?.columnLimit ? { columnLimit: opts.columnLimit } : undefined,
    );
    return formatSql(sql, WarehouseTypes.POSTGRES);
};
