export type UserAttribute = {
    uuid: string;
    createdAt: Date;
    name: string;
    organizationUuid: string;
    description?: string;
    users: UserAttributeValue[];
    groups: GroupAttributeValue[];
    attributeDefaults: string[] | null;
    /** @deprecated Use `attributeDefaults`. Equals `attributeDefaults?.[0] ?? null`; kept for backwards compatibility. */
    attributeDefault: string | null;
};

export type UserAttributeValue = {
    userUuid: string;
    email: string;
    values: string[];
    /** @deprecated Use `values`. Equals `values[0]`; kept for backwards compatibility. */
    value: string;
};

export type GroupAttributeValue = {
    groupUuid: string;
    values: string[];
    /** @deprecated Use `values`. Equals `values[0]`; kept for backwards compatibility. */
    value: string;
};

export type UserAttributeValueMap = Record<string, string[]>;

export type CreateUserAttributeValue = {
    userUuid: string;
    values?: string[];
    /** @deprecated Use `values`. Accepted for backwards compatibility. */
    value?: string;
};

export type CreateGroupAttributeValue = {
    groupUuid: string;
    values?: string[];
    /** @deprecated Use `values`. Accepted for backwards compatibility. */
    value?: string;
};

export type CreateUserAttribute = {
    name: string;
    description?: string;
    /** Canonical default value(s). null/empty means no default. */
    attributeDefaults?: string[] | null;
    /** @deprecated Use `attributeDefaults`. Accepted for backwards compatibility. */
    attributeDefault?: string[] | string | null;
    users: CreateUserAttributeValue[];
    groups: CreateGroupAttributeValue[];
};

/**
 * Normalize a value entry that may carry the deprecated single `value` field
 * or the canonical `values` array into a plain `string[]`.
 */
export const getUserAttributeValues = (entry: {
    values?: string[];
    value?: string;
}): string[] => {
    if (entry.values && entry.values.length > 0) {
        return entry.values;
    }
    if (entry.value !== undefined && entry.value !== '') {
        return [entry.value];
    }
    return [];
};

/**
 * Resolve the canonical `attributeDefaults` array (preferred) or the deprecated
 * `attributeDefault` (array or single string) into `string[] | null`
 * (null = no default).
 */
export const getAttributeDefaultValues = (entry: {
    attributeDefaults?: string[] | null;
    attributeDefault?: string[] | string | null;
}): string[] | null => {
    if (entry.attributeDefaults !== undefined) {
        const defaults = entry.attributeDefaults;
        return defaults && defaults.length > 0 ? defaults : null;
    }
    const legacy = entry.attributeDefault;
    if (legacy == null) {
        return null;
    }
    if (Array.isArray(legacy)) {
        return legacy.length > 0 ? legacy : null;
    }
    return legacy === '' ? null : [legacy];
};

/**
 * A group→value mapping declared in `LD_SETUP_USER_ATTRIBUTES`. The group is
 * referenced by name (not UUID) because SCIM-synced groups are created by the
 * IdP, so their UUIDs aren't known at deploy time.
 */
export type UserAttributeSetupGroupMapping = {
    group: string;
    values: string[];
};

/**
 * One entry in the `LD_SETUP_USER_ATTRIBUTES` instance-config env var. Defaults
 * are applied at parse time, so the post-parse shape has every field present.
 */
export type UserAttributeSetupEntry = {
    name: string;
    description?: string;
    attributeDefault: string[] | null;
    groups: UserAttributeSetupGroupMapping[];
};

export type ApiUserAttributesResponse = {
    status: 'ok';
    results: UserAttribute[];
};

export type ApiCreateUserAttributeResponse = {
    status: 'ok';
    results: UserAttribute;
};
