import {
    CommercialFeatureFlags,
    ForbiddenError,
    type RegisteredAccount,
} from '@lightdash/common';
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
        } catch {
            return false;
        }
    }

    async assertEnabled(account: RegisteredAccount): Promise<void> {
        if (!(await this.isEnabled(account))) {
            throw new ForbiddenError('Direct access is not available');
        }
    }
}
