import { WarehouseTypes } from './projects';

export const PERSONAL_SIGN_IN_EXPIRED_MARKER =
    'sign-in has expired. Reconnect to keep querying with your own account.';

const PERSONAL_SIGN_IN_WAREHOUSES = {
    [WarehouseTypes.BIGQUERY]: 'BigQuery',
    [WarehouseTypes.SNOWFLAKE]: 'Snowflake',
    [WarehouseTypes.DATABRICKS]: 'Databricks',
    [WarehouseTypes.REDSHIFT]: 'Redshift',
} as const;

export type PersonalSignInWarehouse = keyof typeof PERSONAL_SIGN_IN_WAREHOUSES;

export const getPersonalSignInExpiredMessage = (
    warehouseType: PersonalSignInWarehouse,
): string =>
    `Your ${PERSONAL_SIGN_IN_WAREHOUSES[warehouseType]} ${PERSONAL_SIGN_IN_EXPIRED_MARKER}`;

export const getPersonalSignInExpiredWarehouse = (
    message: string,
): PersonalSignInWarehouse | null => {
    for (const warehouseType of Object.keys(
        PERSONAL_SIGN_IN_WAREHOUSES,
    ) as PersonalSignInWarehouse[]) {
        if (
            message.startsWith(getPersonalSignInExpiredMessage(warehouseType))
        ) {
            return warehouseType;
        }
    }
    return null;
};

export const isPersonalSignInExpiredMessage = (message: string): boolean =>
    getPersonalSignInExpiredWarehouse(message) !== null;
