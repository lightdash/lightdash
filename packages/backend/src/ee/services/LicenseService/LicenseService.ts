import { LicenseService } from '../../../services/LicenseService/LicenseService';

export class EnterpriseLicenseService extends LicenseService {
    protected override readonly valid: boolean = true;
}
