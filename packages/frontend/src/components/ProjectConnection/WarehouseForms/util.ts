import { capitalize, type WarehouseTypes } from '@lightdash/common';

export const getSsoLabel = (warehouse: WarehouseTypes, provider?: string) =>
    `User Account (Sign in with ${provider ?? capitalize(warehouse)})`;
export const PRIVATE_KEY_LABEL = `Service Account (JSON key file)`;
export const PASSWORD_LABEL = `Password`;
export const EXTERNAL_BROWSER_LABEL = `External Browser`;
export const PERSONAL_ACCESS_TOKEN_LABEL = `Personal Access Token`;
export const NONE_LABEL = `None`;
