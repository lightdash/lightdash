import {
    SupportedDbtAdapter,
    type FunnelQueryRequest,
} from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import { describe, expect, it } from 'vitest';
import { EXPLORE } from '../../utils/QueryBuilder/MetricQueryBuilder.mock';
import { FunnelService } from './FunnelService';

const request: FunnelQueryRequest = {
    exploreName: 'table1',
    timestampFieldId: 'table1_dim1',
    userIdFieldId: 'table1_shared',
    eventNameFieldId: 'table1_shared',
    steps: [
        { stepOrder: 1, eventName: 'signup' },
        { stepOrder: 2, eventName: 'purchase' },
    ],
    dateRange: { type: 'preset', preset: 'last_30_days' },
};

describe('FunnelService.generateFunnelSql', () => {
    it.each([SupportedDbtAdapter.SNOWFLAKE, SupportedDbtAdapter.POSTGRES])(
        'aliases the base table so quoted field references resolve (%s)',
        (adapter) => {
            const sql = FunnelService.generateFunnelSql(
                request,
                EXPLORE,
                warehouseSqlBuilderFromType(adapter),
            );
            expect(sql).toContain(
                `FROM ${EXPLORE.tables.table1.sqlTable} AS "table1"`,
            );
        },
    );
});
