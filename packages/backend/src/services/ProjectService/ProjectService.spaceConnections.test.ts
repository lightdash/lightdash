import { Ability } from '@casl/ability';
import {
    ExploreType,
    FeatureFlags,
    QueryExecutionContext,
    SpaceMemberRole,
    VizAggregationOptions,
    VizIndexType,
    type PossibleAbilities,
} from '@lightdash/common';
import { fromSession } from '../../auth/account';
import { defaultSessionUser } from '../../auth/account/account.mock';
import { SpaceConnectionReservation } from '../SpaceService/SpaceConnectionReservation';
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

describe('Virtual view named connection reservations', () => {
    it.each(
        ['create', 'update'].flatMap((operation) =>
            [true, false].flatMap((enabled) =>
                [true, false].map((boundEditor) => ({
                    operation,
                    enabled,
                    boundEditor,
                })),
            ),
        ),
    )(
        '$operation enabled=$enabled boundEditor=$boundEditor',
        async ({ operation, enabled, boundEditor }) => {
            const account = fromSession(
                {
                    ...defaultSessionUser,
                    userUuid: 'author',
                    organizationUuid: 'org',
                    ability: new Ability<PossibleAbilities>([
                        { action: 'create', subject: 'VirtualView' },
                        { action: 'manage', subject: 'SqlRunner' },
                    ]),
                },
                'session',
            );
            const spaceModel = {
                getConnectionBoundSpaces: vi.fn().mockResolvedValue([
                    {
                        spaceUuid: 'bound',
                        warehouseConnectionUuid: 'reserved',
                    },
                ]),
            };
            const dependencies = {
                featureFlagModel: {
                    get: vi.fn().mockResolvedValue({ enabled }),
                },
                spaceModel,
                spacePermissionService: {
                    resolveAccessBatch: vi.fn().mockResolvedValue(
                        boundEditor
                            ? [
                                  {
                                      target: { spaceUuid: 'bound' },
                                      context: {
                                          access: [
                                              {
                                                  userUuid: 'author',
                                                  role: SpaceMemberRole.EDITOR,
                                              },
                                          ],
                                      },
                                  },
                              ]
                            : [],
                    ),
                },
            };
            const reachedBuilder = new Error('Reached SQL builder');
            const getWarehouseSqlBuilderSettings = vi
                .fn()
                .mockRejectedValue(reachedBuilder);
            const createVirtualView = vi.fn();
            const updateVirtualView = vi.fn();
            const service = Object.assign(
                Object.create(ProjectService.prototype),
                {
                    ...dependencies,
                    logger: { debug: vi.fn() },
                    projectModel: {
                        getSummary: vi
                            .fn()
                            .mockResolvedValue({ organizationUuid: 'org' }),
                        getConnectionRoute: vi.fn().mockResolvedValue('multi'),
                        resolveWarehouseCredentialRead: vi
                            .fn()
                            .mockResolvedValue({
                                kind: 'extra',
                                warehouseConnectionUuid: 'reserved',
                            }),
                        getExploreWarehouseConnectionUuid: vi
                            .fn()
                            .mockResolvedValue('reserved'),
                        createVirtualView,
                        updateVirtualView,
                    },
                    spaceConnectionReservation: new SpaceConnectionReservation(
                        dependencies as never,
                    ),
                    findExplores: vi
                        .fn()
                        .mockResolvedValue(
                            operation === 'create'
                                ? {}
                                : { view: { type: ExploreType.VIRTUAL } },
                        ),
                    getWarehouseSqlBuilderSettings,
                },
            ) as ProjectService;
            const payload = {
                name: 'View',
                sql: 'SELECT 1',
                columns: [],
                warehouseConnectionUuid: 'reserved',
            };
            await expect(
                operation === 'create'
                    ? service.createVirtualView(account, 'project', payload)
                    : service.updateVirtualView(
                          account,
                          'project',
                          'view',
                          payload,
                      ),
            ).rejects.toThrow(
                enabled && !boundEditor
                    ? 'This connection is reserved for a space you cannot edit.'
                    : reachedBuilder,
            );
            expect(getWarehouseSqlBuilderSettings).toHaveBeenCalledTimes(
                enabled && !boundEditor ? 0 : 1,
            );
            expect(spaceModel.getConnectionBoundSpaces).toHaveBeenCalledTimes(
                enabled ? 1 : 0,
            );
            expect(createVirtualView).not.toHaveBeenCalled();
            expect(updateVirtualView).not.toHaveBeenCalled();
        },
    );
});
