import {
    CommercialFeatureFlags,
    ForbiddenError,
    getErrorMessage,
    type RegisteredAccount,
} from '@lightdash/common';
import Logger from '../../logging/logger';
import { type FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { type LicenseService } from '../LicenseService/LicenseService';

const FLAG_CACHE_TTL_MS = 30_000;
const FLAG_CACHE_MAX_ENTRIES = 10_000;

export class DirectAccessFeatureGate {
    // Authorization resolves the flag once per subject, so a dashboard load
    // with N owned tiles would otherwise query the flag tables N times.
    // Caching the promise also collapses concurrent lookups into one query.
    // Flag/license changes take up to FLAG_CACHE_TTL_MS to reach this path.
    private readonly flagCache = new Map<
        string,
        { promise: Promise<boolean>; expiresAt: number }
    >();

    constructor(
        private readonly featureFlagModel: Pick<FeatureFlagModel, 'get'>,
        private readonly licenseService: Pick<
            LicenseService,
            'getLicenseStatus'
        >,
    ) {}

    async isEnabled(account: RegisteredAccount): Promise<boolean> {
        return this.isEnabledForUser({
            userUuid: account.user.userUuid,
            organizationUuid: account.organization.organizationUuid,
        });
    }

    async isEnabledForUser(user: {
        userUuid: string;
        organizationUuid: string | undefined;
    }): Promise<boolean> {
        if (
            user.organizationUuid === undefined ||
            !this.licenseService.getLicenseStatus().valid
        ) {
            return false;
        }
        const cacheKey = `${user.userUuid}:${user.organizationUuid}`;
        const cached = this.flagCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
            return cached.promise;
        }
        if (this.flagCache.size >= FLAG_CACHE_MAX_ENTRIES) {
            this.flagCache.clear();
        }
        const promise = this.resolveFlag(cacheKey, {
            userUuid: user.userUuid,
            organizationUuid: user.organizationUuid,
        });
        this.flagCache.set(cacheKey, {
            promise,
            expiresAt: Date.now() + FLAG_CACHE_TTL_MS,
        });
        return promise;
    }

    private async resolveFlag(
        cacheKey: string,
        user: { userUuid: string; organizationUuid: string },
    ): Promise<boolean> {
        try {
            const featureFlag = await this.featureFlagModel.get({
                featureFlagId: CommercialFeatureFlags.DirectAccess,
                user,
            });
            return featureFlag.enabled;
        } catch (error) {
            // Fail closed, but keep fault-denials distinguishable from
            // policy denials in the logs. Don't cache the failure — a
            // transient error must not pin denials for the TTL.
            this.flagCache.delete(cacheKey);
            Logger.warn(
                `Direct access flag resolution failed; failing closed: ${getErrorMessage(
                    error,
                )}`,
            );
            return false;
        }
    }

    async assertEnabled(account: RegisteredAccount): Promise<void> {
        if (!(await this.isEnabled(account))) {
            throw new ForbiddenError('Direct access is not available');
        }
    }
}
