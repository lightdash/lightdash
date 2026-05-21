import {
    FeatureFlags,
    OrganizationAccessStatus,
    type Account,
    type OrganizationAccess,
} from '@lightdash/common';
import { BaseService } from '../BaseService';
import { type FeatureFlagService } from '../FeatureFlag/FeatureFlagService';

const DEFAULT_CACHE_TTL_MS = 60 * 1000;

type OrganizationAccessServiceArguments = {
    featureFlagService: FeatureFlagService;
    cacheTtlMs?: number;
};

type CacheEntry = {
    access: OrganizationAccess;
    expiresAt: number;
};

export class OrganizationAccessService extends BaseService {
    private readonly featureFlagService: FeatureFlagService;

    private readonly cacheTtlMs: number;

    private readonly cache = new Map<string, CacheEntry>();

    constructor(args: OrganizationAccessServiceArguments) {
        super();
        this.featureFlagService = args.featureFlagService;
        this.cacheTtlMs = args.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    }

    async getOrganizationAccess(
        account?: Account,
    ): Promise<OrganizationAccess> {
        const organizationUuid = account?.organization.organizationUuid;
        if (!organizationUuid) {
            return { status: OrganizationAccessStatus.ACTIVE };
        }

        const cached = this.cache.get(organizationUuid);
        if (cached && cached.expiresAt > Date.now()) {
            return cached.access;
        }

        const access = await this.resolveOrganizationAccess(account);
        this.cache.set(organizationUuid, {
            access,
            expiresAt: Date.now() + this.cacheTtlMs,
        });
        return access;
    }

    clearCache(organizationUuid?: string) {
        if (organizationUuid) {
            this.cache.delete(organizationUuid);
            return;
        }
        this.cache.clear();
    }

    private async resolveOrganizationAccess(
        account: Account,
    ): Promise<OrganizationAccess> {
        const user = {
            userUuid: account.user.id,
            organizationUuid: account.organization.organizationUuid,
            organizationName: account.organization.name,
        };

        const isWarning = await this.featureFlagService.get({
            user,
            featureFlagId: FeatureFlags.OrganizationTrialWarning,
        });

        if (isWarning.enabled) {
            return {
                status: OrganizationAccessStatus.TRIAL_WARNING,
            };
        }

        return { status: OrganizationAccessStatus.ACTIVE };
    }
}
