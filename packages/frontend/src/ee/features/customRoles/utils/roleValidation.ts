import { isSystemRole } from '@lightdash/common';
import i18n from '../../../../i18n/i18n';

const tr = (key: string) => i18n.t(`validation.${key}`, { ns: 'customRoles' });

/**
 * Validates a role name
 * @param value - The role name to validate
 * @returns Error message if invalid, null if valid
 */
export const validateRoleName = (value: string): string | null => {
    if (!value || value.trim().length === 0) {
        return tr('nameRequired');
    }
    if (value.length < 3) {
        return tr('nameTooShort');
    }
    if (isSystemRole(value.toLocaleLowerCase())) {
        return tr('nameIsSystemRole');
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
        return tr('scopeRequired');
    }
    return null;
};
