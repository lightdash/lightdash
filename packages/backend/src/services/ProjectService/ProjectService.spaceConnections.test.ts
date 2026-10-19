import {
    FeatureFlags,
    QueryExecutionContext,
    VizAggregationOptions,
    VizIndexType,
} from '@lightdash/common';
import { ProjectService } from './ProjectService';

describe('Legacy SQL chart result jobs use space bindings', () => {
    it.each(
        ['stream', 'pivot'].flatMap((entry) =>
            [true, false].flatMap((enabled) =>
                ['reserved', null].map((effective) => ({
                    entry,
                    enabled,
                    effective,
                })),
            ),
        ),
    )(
        '$entry with enabled=$enabled effective=$effective',
        async ({ entry, enabled, effective }) => {
            const reachedWarehouse = new Error('Warehouse reached');
            const withWarehouseClient = vi
                .fn()
                .mockRejectedValue(reachedWarehouse);
            const spaceModel = {
                getSqlChartSpaceUuid: vi.fn().mockResolvedValue('child'),
                getEffectiveWarehouseConnectionUuid: vi
                    .fn()
                    .mockResolvedValue(effective),
            };
            const getFlag = vi.fn().mockResolvedValue({ enabled });
            const service = Object.assign(
                Object.create(ProjectService.prototype),
                {
                    projectModel: {
                        getSummary: vi
                            .fn()
                            .mockResolvedValue({ organizationUuid: 'org' }),
                    },
                    featureFlagModel: { get: getFlag },
                    spaceModel,
                    warehouseClientFactory: { withWarehouseClient },
                },
            ) as ProjectService;
            const payload = {
                organizationUuid: 'org',
                userUuid: 'user',
                projectUuid: 'project',
                sqlChartUuid: 'chart',
                sql: 'SELECT 1',
                limit: 10,
                context: QueryExecutionContext.CHART,
            };
            await expect(
                entry === 'stream'
                    ? service.streamSqlQueryIntoFile(payload)
                    : service.pivotQueryWorkerTask({
                          ...payload,
                          groupByColumns: undefined,
                          sortBy: undefined,
                          indexColumn: {
                              reference: 'category',
                              type: VizIndexType.CATEGORY,
                          },
                          valuesColumns: [
                              {
                                  reference: 'count',
                                  aggregation: VizAggregationOptions.SUM,
                              },
                          ],
                      }),
            ).rejects.toBe(reachedWarehouse);
            const fallback =
                entry === 'stream'
                    ? { kind: 'connection', warehouseConnectionUuid: null }
                    : { kind: 'sqlChart', savedSqlUuid: 'chart' };
            expect(withWarehouseClient).toHaveBeenCalledWith(
                {
                    kind: 'binding',
                    projectUuid: 'project',
                    binding:
                        enabled && effective !== null
                            ? { kind: 'space', spaceUuid: 'child', fallback }
                            : fallback,
                },
                expect.anything(),
                expect.anything(),
            );
            expect(getFlag).toHaveBeenCalledWith({
                user: { organizationUuid: 'org' },
                featureFlagId: FeatureFlags.SpaceWarehouseConnections,
            });
            expect(spaceModel.getSqlChartSpaceUuid).toHaveBeenCalledTimes(
                enabled ? 1 : 0,
            );
            expect(
                spaceModel.getEffectiveWarehouseConnectionUuid,
            ).toHaveBeenCalledTimes(enabled ? 1 : 0);
        },
    );
});
