import { ForbiddenError, type RegisteredAccount } from '@lightdash/common';
import { type LicenseService } from '../LicenseService/LicenseService';

export class DirectAccessFeatureGate {
    constructor(
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
        return (
            user.organizationUuid !== undefined &&
            this.licenseService.getLicenseStatus().valid
        );
    }

    async assertEnabled(account: RegisteredAccount): Promise<void> {
        if (!(await this.isEnabled(account))) {
            throw new ForbiddenError('Direct access is not available');
        }
    }
}
