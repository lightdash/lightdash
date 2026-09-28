import { WarehouseConnectionRouter } from './WarehouseConnectionRouter';

describe('WarehouseConnectionRouter credential reads', () => {
    it.each(['single', 'multi'] as const)(
        'returns the %s route with an original target from one route read',
        async (route) => {
            const router = new WarehouseConnectionRouter({
                database: {} as never,
            });
            const getRoute = vi
                .spyOn(router, 'getRoute')
                .mockResolvedValue(route);

            await expect(
                router.resolveCredentialReadWithRoute('project-uuid', {
                    kind: 'original',
                }),
            ).resolves.toEqual({
                route,
                target: { kind: 'original' },
            });
            expect(getRoute).toHaveBeenCalledExactlyOnceWith('project-uuid');
        },
    );
});
