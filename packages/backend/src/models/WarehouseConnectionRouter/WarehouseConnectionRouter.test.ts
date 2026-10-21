import { WarehouseTypes } from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient } from 'knex-mock-client';
import { WarehouseConnectionRouter } from './WarehouseConnectionRouter';

describe('WarehouseConnectionRouter credential reads', () => {
    it.each(['single', 'multi'] as const)(
        'returns the %s route with an original target from one route read',
        async (route) => {
            const router = new WarehouseConnectionRouter({
                database: {} as never,
            });
            const originalWarehouseConnectionUuid =
                route === 'multi' ? 'original-connection-uuid' : null;
            const getRouteWithOriginal = vi
                .spyOn(router, 'getRouteWithOriginal')
                .mockResolvedValue({ route, originalWarehouseConnectionUuid });

            await expect(
                router.resolveCredentialReadWithRoute('project-uuid', {
                    kind: 'original',
                }),
            ).resolves.toEqual({
                route,
                target: { kind: 'original' },
                originalWarehouseConnectionUuid,
            });
            expect(getRouteWithOriginal).toHaveBeenCalledExactlyOnceWith(
                'project-uuid',
            );
        },
    );
});

describe('WarehouseConnectionRouter space bindings', () => {
    const connectionUuid = '00000000-0000-4000-8000-000000000001';
    const originalUuid = '00000000-0000-4000-8000-000000000002';
    const otherUuid = '00000000-0000-4000-8000-000000000003';
    let originalType: WarehouseTypes;
    let otherType: WarehouseTypes;
    const database = knex({ client: MockClient });
    const tracker = getTracker();
    const getEffectiveWarehouseConnectionUuid =
        vi.fn<
            (args: {
                projectUuid: string;
                spaceUuid: string;
            }) => Promise<string | null>
        >();
    const router = new WarehouseConnectionRouter({
        database,
        spaceModel: { getEffectiveWarehouseConnectionUuid },
    });

    beforeEach(() => {
        tracker.reset();
        getEffectiveWarehouseConnectionUuid.mockReset();
        vi.spyOn(router, 'getRouteWithOriginal').mockResolvedValue({
            route: 'multi',
            originalWarehouseConnectionUuid: null,
        });
        originalType = WarehouseTypes.POSTGRES;
        otherType = WarehouseTypes.POSTGRES;
        tracker.on.select('warehouse_connections').response((query) => {
            const connections = [
                {
                    warehouse_connection_uuid: connectionUuid,
                    is_original: false,
                    warehouse_type: WarehouseTypes.POSTGRES,
                    original_warehouse_type: originalType,
                },
                {
                    warehouse_connection_uuid: originalUuid,
                    is_original: true,
                    warehouse_type: null,
                    original_warehouse_type: originalType,
                },
                {
                    warehouse_connection_uuid: otherUuid,
                    is_original: false,
                    warehouse_type: otherType,
                    original_warehouse_type: originalType,
                },
            ];
            return query.sql.includes('warehouse_credentials')
                ? connections
                : connections.filter((connection) =>
                      query.bindings.includes(
                          connection.warehouse_connection_uuid,
                      ),
                  );
        });
    });

    afterAll(async () => {
        await database.destroy();
    });

    it.each(['bound-space', 'nested-space'])(
        'uses the effective connection for %s',
        async (spaceUuid) => {
            getEffectiveWarehouseConnectionUuid.mockResolvedValue(
                connectionUuid,
            );
            await expect(
                router.resolveCredentialRead('project', {
                    kind: 'space',
                    spaceUuid,
                    fallback: { kind: 'original' },
                }),
            ).resolves.toEqual({
                kind: 'extra',
                warehouseConnectionUuid: connectionUuid,
            });
            expect(
                getEffectiveWarehouseConnectionUuid,
            ).toHaveBeenCalledExactlyOnceWith({
                projectUuid: 'project',
                spaceUuid,
            });
            expect(
                tracker.history.select.filter(({ sql }) =>
                    sql.includes('warehouse_credentials'),
                ),
            ).toHaveLength(1);
        },
    );

    it.each([
        { spaceOriginal: false, fallbackOriginal: false },
        { spaceOriginal: false, fallbackOriginal: true },
        { spaceOriginal: true, fallbackOriginal: false },
    ])(
        'compares warehouse types with space original=$spaceOriginal and fallback original=$fallbackOriginal',
        async ({ spaceOriginal, fallbackOriginal }) => {
            const spaceConnectionUuid = spaceOriginal
                ? originalUuid
                : connectionUuid;
            const fallbackUuid = fallbackOriginal ? originalUuid : otherUuid;
            const spaceTarget = spaceOriginal
                ? { kind: 'original' }
                : {
                      kind: 'extra',
                      warehouseConnectionUuid: spaceConnectionUuid,
                  };
            const fallbackTarget = fallbackOriginal
                ? { kind: 'original' }
                : { kind: 'extra', warehouseConnectionUuid: fallbackUuid };
            getEffectiveWarehouseConnectionUuid.mockResolvedValue(
                spaceConnectionUuid,
            );
            const binding = {
                kind: 'space',
                spaceUuid: 'bound-space',
                fallback: {
                    kind: 'connection',
                    warehouseConnectionUuid: fallbackUuid,
                },
            } as const;
            await expect(
                router.resolveCredentialRead('project', binding),
            ).resolves.toEqual(spaceTarget);

            if (fallbackOriginal) originalType = WarehouseTypes.TRINO;
            else otherType = WarehouseTypes.TRINO;
            await expect(
                router.resolveCredentialRead('project', binding),
            ).resolves.toEqual(fallbackTarget);
        },
    );

    it.each([WarehouseTypes.POSTGRES, WarehouseTypes.TRINO])(
        'resolves a SQL chart on %s before applying the space connection',
        async (warehouseType) => {
            otherType = warehouseType;
            getEffectiveWarehouseConnectionUuid.mockResolvedValue(
                connectionUuid,
            );
            tracker.on
                .select('saved_sql_versions')
                .response([{ warehouse_connection_uuid: otherUuid }]);
            await expect(
                router.resolveCredentialRead('project', {
                    kind: 'space',
                    spaceUuid: 'bound-space',
                    fallback: {
                        kind: 'sqlChart',
                        savedSqlUuid: '00000000-0000-4000-8000-000000000004',
                    },
                }),
            ).resolves.toEqual({
                kind: 'extra',
                warehouseConnectionUuid:
                    warehouseType === WarehouseTypes.POSTGRES
                        ? connectionUuid
                        : otherUuid,
            });
        },
    );

    it('uses the fallback when no ancestor has a connection', async () => {
        getEffectiveWarehouseConnectionUuid.mockResolvedValue(null);
        await expect(
            router.resolveCredentialRead('project', {
                kind: 'space',
                spaceUuid: 'unbound-space',
                fallback: {
                    kind: 'connection',
                    warehouseConnectionUuid: connectionUuid,
                },
            }),
        ).resolves.toEqual({
            kind: 'extra',
            warehouseConnectionUuid: connectionUuid,
        });
        expect(
            tracker.history.select.some(({ sql }) =>
                sql.includes('warehouse_credentials'),
            ),
        ).toBe(false);
    });

    it('does not read warehouse types without a space binding', async () => {
        await expect(
            router.resolveCredentialRead('project', {
                kind: 'connection',
                warehouseConnectionUuid: connectionUuid,
            }),
        ).resolves.toEqual({
            kind: 'extra',
            warehouseConnectionUuid: connectionUuid,
        });
        expect(getEffectiveWarehouseConnectionUuid).not.toHaveBeenCalled();
        expect(tracker.history.select).toHaveLength(1);
    });

    it('does not read the space on the single route', async () => {
        vi.spyOn(router, 'getRouteWithOriginal').mockResolvedValue({
            route: 'single',
            originalWarehouseConnectionUuid: null,
        });
        await expect(
            router.resolveCredentialRead('project', {
                kind: 'space',
                spaceUuid: 'bound-space',
                fallback: { kind: 'original' },
            }),
        ).resolves.toEqual({ kind: 'original' });
        expect(getEffectiveWarehouseConnectionUuid).not.toHaveBeenCalled();
        expect(tracker.history.select).toHaveLength(0);
    });
});
