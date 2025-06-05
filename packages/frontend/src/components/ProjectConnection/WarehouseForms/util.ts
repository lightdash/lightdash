import { capitalize, type WarehouseTypes } from '@lightdash/common';

export const getSsoLabel = (warehouse: WarehouseTypes) =>
    `User Account (Sign in with ${capitalize(warehouse)})`;
export const PRIVATE_KEY_LABEL = `Service Account (JSON key file)`;
export const PASSWORD_LABEL = `Password`;
