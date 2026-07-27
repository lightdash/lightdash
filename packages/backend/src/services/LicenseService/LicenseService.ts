import { BaseService } from '../BaseService';

export type LicenseStatus = {
    hasLicenseKey: boolean;
    valid: boolean;
};

export class LicenseService extends BaseService {
    protected readonly valid: boolean = false;

    private readonly hasLicenseKey: boolean;

    constructor({ licenseKey }: { licenseKey: string | null }) {
        super();
        this.hasLicenseKey = licenseKey !== null;
    }

    getLicenseStatus(): LicenseStatus {
        return {
            hasLicenseKey: this.hasLicenseKey,
            valid: this.valid,
        };
    }
}
