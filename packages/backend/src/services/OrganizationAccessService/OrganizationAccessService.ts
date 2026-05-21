import {
    FeatureFlags,
    ForbiddenError,
    OrganizationAccessStatus,
    type Account,
    type OrganizationAccess,
} from '@lightdash/common';
import { BaseService } from '../BaseService';
import { type FeatureFlagService } from '../FeatureFlag/FeatureFlagService';

const DEFAULT_CACHE_TTL_MS = 60 * 1000;
const TRIAL_BLOCKED_MESSAGE =
    'Your Lightdash trial has expired. Contact sales to restore query access.';
const TRIAL_API_CLI_BLOCKED_MESSAGE =
    'Your Lightdash trial has expired. API and CLI query access is blocked.';

type OrganizationAccessServiceArguments = {
    featureFlagService: FeatureFlagService;
    cacheTtlMs?: number;
};

type CacheEntry = {
    access: OrganizationAccess;
    expiresAt: number;
};

const isApiCliAccount = (account?: Account) =>
    account?.authentication.type === 'pat' ||
    account?.authentication.type === 'oauth' ||
    account?.authentication.type === 'service-account';

export class OrganizationAccessService extends BaseService {
    private readonly featureFlagService: FeatureFlagService;

    private readonly cacheTtlMs: number;

    private readonly cache = new Map<string, CacheEntry>();

    constructor(args: OrganizationAccessServiceArguments) {
        super();
        this.featureFlagService = args.featureFlagService;
        this.cacheTtlMs = args.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    }

    async assertQueryAccess(account?: Account): Promise<OrganizationAccess> {
        const access = await this.getOrganizationAccess(account);
        if (access.status !== OrganizationAccessStatus.TRIAL_BLOCKED) {
            return access;
        }

        if (isApiCliAccount(account) && !access.apiCliBlocked) {
            return access;
        }

        throw new ForbiddenError(
            isApiCliAccount(account)
                ? TRIAL_API_CLI_BLOCKED_MESSAGE
                : TRIAL_BLOCKED_MESSAGE,
        );
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

        const [isBlocked, isWarning, isApiCliBlocked] = await Promise.all([
            this.featureFlagService.get({
                user,
                featureFlagId: FeatureFlags.OrganizationTrialBlocked,
            }),
            this.featureFlagService.get({
                user,
                featureFlagId: FeatureFlags.OrganizationTrialWarning,
            }),
            this.featureFlagService.get({
                user,
                featureFlagId: FeatureFlags.OrganizationTrialApiCliBlocked,
            }),
        ]);

        if (isBlocked.enabled) {
            return {
                status: OrganizationAccessStatus.TRIAL_BLOCKED,
                apiCliBlocked: isApiCliBlocked.enabled,
            };
        }

        if (isWarning.enabled) {
            return {
                status: OrganizationAccessStatus.TRIAL_WARNING,
            };
        }

        return { status: OrganizationAccessStatus.ACTIVE };
    }
}
