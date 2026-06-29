import { NotFoundError } from '@lightdash/common';
import { createOrganizationNameResolver } from './organizationNameResolver';

describe('createOrganizationNameResolver', () => {
    it('returns the organization name on first lookup', async () => {
        const get = vi
            .fn()
            .mockResolvedValue({ organizationUuid: 'uuid-1', name: 'Acme' });
        const resolve = createOrganizationNameResolver({ get });

        await expect(resolve('uuid-1')).resolves.toBe('Acme');
        expect(get).toHaveBeenCalledTimes(1);
    });

    it('caches successful lookups within the TTL', async () => {
        const get = vi
            .fn()
            .mockResolvedValue({ organizationUuid: 'uuid-1', name: 'Acme' });
        let mockNow = 1_000;
        const resolve = createOrganizationNameResolver(
            { get },
            { ttlMs: 60_000, now: () => mockNow },
        );

        await resolve('uuid-1');
        mockNow += 30_000; // still within TTL
        await resolve('uuid-1');

        expect(get).toHaveBeenCalledTimes(1);
    });

    it('refreshes the cache after the TTL expires', async () => {
        const get = vi
            .fn()
            .mockResolvedValueOnce({
                organizationUuid: 'uuid-1',
                name: 'Acme',
            })
            .mockResolvedValueOnce({
                organizationUuid: 'uuid-1',
                name: 'Acme Renamed',
            });
        let mockNow = 1_000;
        const resolve = createOrganizationNameResolver(
            { get },
            { ttlMs: 60_000, now: () => mockNow },
        );

        await expect(resolve('uuid-1')).resolves.toBe('Acme');
        mockNow += 120_000; // past TTL
        await expect(resolve('uuid-1')).resolves.toBe('Acme Renamed');

        expect(get).toHaveBeenCalledTimes(2);
    });

    it('returns undefined and caches the miss when the org is not found', async () => {
        const get = vi
            .fn()
            .mockRejectedValue(new NotFoundError('No organization found'));
        const resolve = createOrganizationNameResolver({ get });

        await expect(resolve('missing-uuid')).resolves.toBeUndefined();
        await expect(resolve('missing-uuid')).resolves.toBeUndefined();

        expect(get).toHaveBeenCalledTimes(1);
    });

    it('returns undefined for an empty uuid without calling the model', async () => {
        const get = vi.fn();
        const resolve = createOrganizationNameResolver({ get });

        await expect(resolve('')).resolves.toBeUndefined();
        expect(get).not.toHaveBeenCalled();
    });

    it('deduplicates concurrent lookups for the same uuid', async () => {
        let resolveGet: (value: {
            organizationUuid: string;
            name: string;
        }) => void;
        const get = vi.fn().mockReturnValue(
            new Promise((res) => {
                resolveGet = res;
            }),
        );
        const resolve = createOrganizationNameResolver({ get });

        const a = resolve('uuid-1');
        const b = resolve('uuid-1');
        resolveGet!({ organizationUuid: 'uuid-1', name: 'Acme' });

        await expect(a).resolves.toBe('Acme');
        await expect(b).resolves.toBe('Acme');
        expect(get).toHaveBeenCalledTimes(1);
    });
});
