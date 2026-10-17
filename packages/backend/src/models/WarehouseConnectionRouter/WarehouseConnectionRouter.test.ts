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
        tracker.on
            .select('warehouse_connections')
            .response([{ is_original: false }]);
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
    });
});
