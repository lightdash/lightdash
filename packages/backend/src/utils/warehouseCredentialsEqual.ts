import {
    normalizeWarehouseCredentials,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import isEqual from 'lodash/isEqual';

export const warehouseCredentialsEqual = (
    current: CreateWarehouseCredentials | null,
    next: CreateWarehouseCredentials,
): boolean => {
    if (!current) return false;
    try {
        return isEqual(
            JSON.parse(JSON.stringify(normalizeWarehouseCredentials(current))),
            JSON.parse(JSON.stringify(normalizeWarehouseCredentials(next))),
        );
    } catch {
        return false;
    }
};
