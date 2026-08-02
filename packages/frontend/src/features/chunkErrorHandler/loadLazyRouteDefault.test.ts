import { describe, expect, it } from 'vitest';
import { type RouteChunkLoadError } from './chunkErrorHandler';
import { loadLazyRouteDefault } from './loadLazyRouteDefault';

describe('loadLazyRouteDefault', () => {
    it('returns the default component from a lazy route module', async () => {
        const RouteComponent = () => null;

        await expect(
            loadLazyRouteDefault('./pages/Home', async () => ({
                default: RouteComponent,
            })),
        ).resolves.toBe(RouteComponent);
    });

    it('throws a route chunk error when the import resolves without a default export', async () => {
        await expect(
            loadLazyRouteDefault('./pages/Home', async () => undefined),
        ).rejects.toMatchObject({
            name: 'RouteChunkLoadError',
            message: 'Route chunk failed to load: ./pages/Home',
            routeModule: './pages/Home',
        } satisfies Partial<RouteChunkLoadError>);
    });
});
