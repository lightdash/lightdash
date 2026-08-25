import {
    CommercialFeatureFlags,
    ForbiddenError,
    getErrorMessage,
    type RegisteredAccount,
} from '@lightdash/common';
import Logger from '../../logging/logger';
import { type FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { type LicenseService } from '../LicenseService/LicenseService';

export class DirectAccessFeatureGate {
    constructor(
        private readonly featureFlagModel: Pick<FeatureFlagModel, 'get'>,
        private readonly licenseService: Pick<
            LicenseService,
            'getLicenseStatus'
        >,
    ) {}

    async isEnabled(account: RegisteredAccount): Promise<boolean> {
        if (!this.licenseService.getLicenseStatus().valid) {
            return false;
        }
        try {
            const featureFlag = await this.featureFlagModel.get({
                featureFlagId: CommercialFeatureFlags.DirectAccess,
                user: {
                    userUuid: account.user.userUuid,
                    organizationUuid: account.organization.organizationUuid,
                },
            });
            return featureFlag.enabled;
        } catch (error) {
            // Fail closed, but keep fault-denials distinguishable from
            // policy denials in the logs.
            Logger.warn(
                `Direct access flag resolution failed; failing closed: ${getErrorMessage(
                    error,
                )}`,
            );
            return false;
        }
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
        try {
            const featureFlag = await this.featureFlagModel.get({
                featureFlagId: CommercialFeatureFlags.DirectAccess,
                user: {
                    userUuid: user.userUuid,
                    organizationUuid: user.organizationUuid,
                },
            });
            return featureFlag.enabled;
        } catch (error) {
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
