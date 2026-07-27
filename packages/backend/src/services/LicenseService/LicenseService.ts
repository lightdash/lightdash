import { BaseService } from '../BaseService';

export type LicenseStatus = {
    valid: boolean;
};

export class LicenseService extends BaseService {
    protected readonly valid: boolean = false;

    getLicenseStatus(): LicenseStatus {
        return { valid: this.valid };
    }
}
