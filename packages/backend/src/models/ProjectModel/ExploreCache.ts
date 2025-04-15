import { Explore, ExploreError } from '@lightdash/common';
import NodeCache from 'node-cache';

type CachedExplore = Explore | ExploreError;

export class ExploreCache {
    private readonly cache: NodeCache;

    constructor() {
        // Initialize cache with 30 seconds TTL
        this.cache = new NodeCache({
            stdTTL: 30, // time to live in seconds
            checkperiod: 60, // cleanup interval in seconds
        });
    }

    private static getIndividualExploreKey(
        projectUuid: string,
        exploreName: string,
    ): string {
        return `explores::${projectUuid}::${exploreName}`;
    }

    private static getAllExploresKey(projectUuid: string): string {
        return `explores::${projectUuid}::all`;
    }

    public getIndividualExplore(
        projectUuid: string,
        exploreName: string,
    ): CachedExplore | undefined {
        return this.cache.get<CachedExplore>(
            ExploreCache.getIndividualExploreKey(projectUuid, exploreName),
        );
    }

    public setIndividualExplore(
        projectUuid: string,
        exploreName: string,
        explore: CachedExplore,
    ): void {
        this.cache.set(
            ExploreCache.getIndividualExploreKey(projectUuid, exploreName),
            explore,
        );
    }

    public getAllExplores(
        projectUuid: string,
    ): Record<string, CachedExplore> | undefined {
        return this.cache.get<Record<string, CachedExplore>>(
            ExploreCache.getAllExploresKey(projectUuid),
        );
    }

    public setAllExplores(
        projectUuid: string,
        explores: Record<string, CachedExplore>,
    ): void {
        this.cache.set(ExploreCache.getAllExploresKey(projectUuid), explores);
    }

    private delIndividualExplore(
        projectUuid: string,
        exploreName: string,
    ): void {
        this.cache.del(
            ExploreCache.getIndividualExploreKey(projectUuid, exploreName),
        );
    }

    private delAllExplores(projectUuid: string): void {
        this.cache.del(ExploreCache.getAllExploresKey(projectUuid));
    }

    public invalidateCache(projectUuid: string, exploreName?: string): void {
        if (exploreName) {
            // Delete the individual explore
            this.delIndividualExplore(projectUuid, exploreName);
            // Delete the all key since it's no longer valid
            this.delAllExplores(projectUuid);
        } else {
            // Delete all individual explores for the project and the all key
            this.cache.del(
                this.cache
                    .keys()
                    .filter((key: string) =>
                        key.startsWith(`explores::${projectUuid}::`),
                    ),
            );
        }
    }
}
