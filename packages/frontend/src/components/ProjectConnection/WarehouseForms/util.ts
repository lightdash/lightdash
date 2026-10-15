import { capitalize, type WarehouseTypes } from '@lightdash/common';
import i18n from '../../../i18n/i18n';

export const getSsoLabel = (warehouse: WarehouseTypes, provider?: string) =>
    i18n.t('warehouseAuth.sso', {
        ns: 'projectConnection',
        provider: provider ?? capitalize(warehouse),
    });
export const PRIVATE_KEY_LABEL = `Key Pair (private key file)`;
export const PASSWORD_LABEL = `Password`;
export const PERSONAL_ACCESS_TOKEN_LABEL = `Personal Access Token`;
