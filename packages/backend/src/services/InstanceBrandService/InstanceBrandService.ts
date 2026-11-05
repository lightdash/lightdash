import { type InstanceBrand } from '@lightdash/common';
import { BaseService } from '../BaseService';

export const INSTANCE_LOGO_PATH = '/api/v1/org/brand/instance-logo';

export type InstanceLogoFile = {
    contentType: string;
    data: Buffer;
    version: string;
};

export const getInstanceLogoUrl = (version: string) =>
    `${INSTANCE_LOGO_PATH}?v=${version}`;

// Instance branding is an Enterprise feature, see EnterpriseInstanceBrandService
export class InstanceBrandService extends BaseService {
    getInstanceBrand(): InstanceBrand | null {
        return null;
    }

    getInstanceLogoFile(): InstanceLogoFile | null {
        return null;
    }
}
