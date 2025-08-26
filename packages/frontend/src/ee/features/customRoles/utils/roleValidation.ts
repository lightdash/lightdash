import { isSystemRole } from '@lightdash/common';

/**
 * Validates a role name
 * @param value - The role name to validate
 * @returns Error message if invalid, null if valid
 */
export const validateRoleName = (value: string): string | null => {
    if (!value || value.trim().length === 0) {
        return 'Role name is required';
    }
    if (value.length < 3) {
        return 'Role name must be at least 3 characters';
    }
    if (isSystemRole(value.toLocaleLowerCase())) {
        return 'Role name cannot match a system role';
    }
    return null;
};

/**
 * Validates role scopes
 * @param value - Object with scope names as keys and boolean values
 * @returns Error message if invalid, null if valid
 */
export const validateScopes = (
    value: Record<string, boolean>,
): string | null => {
    const isScopesEmpty = !Object.values(value).some(Boolean);
    if (isScopesEmpty) {
        return 'At least one scope is required';
    }
    return null;
};
