import type { OrganizationModel } from '../models/OrganizationModel';

export type OrganizationNameResolver = (
    organizationUuid: string,
) => Promise<string | undefined>;

type CacheEntry = {
    name: string | undefined;
    expiresAt: number;
};

const DEFAULT_TTL_MS = 10 * 60 * 1000;

type ResolverOptions = {
    ttlMs?: number;
    now?: () => number;
};

export const createOrganizationNameResolver = (
    organizationModel: Pick<OrganizationModel, 'get'>,
    options: ResolverOptions = {},
): OrganizationNameResolver => {
    const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    const now = options.now ?? Date.now;
    const cache = new Map<string, CacheEntry>();
    const inflight = new Map<string, Promise<string | undefined>>();

    return async (organizationUuid: string) => {
        if (!organizationUuid) return undefined;

        const currentTime = now();
        const cached = cache.get(organizationUuid);
        if (cached && cached.expiresAt > currentTime) {
            return cached.name;
        }

        const existing = inflight.get(organizationUuid);
        if (existing) return existing;

        const fetchPromise = (async () => {
            try {
                const org = await organizationModel.get(organizationUuid);
                cache.set(organizationUuid, {
                    name: org.name,
                    expiresAt: now() + ttlMs,
                });
                return org.name;
            } catch {
                cache.set(organizationUuid, {
                    name: undefined,
                    expiresAt: now() + ttlMs,
                });
                return undefined;
            } finally {
                inflight.delete(organizationUuid);
            }
        })();

        inflight.set(organizationUuid, fetchPromise);
        return fetchPromise;
    };
};

export const noopOrganizationNameResolver: OrganizationNameResolver =
    async () => undefined;
