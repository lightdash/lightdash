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
