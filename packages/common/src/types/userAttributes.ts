export type UserAttribute = {
    uuid: string;
    createdAt: Date;
    name: string;
    organizationUuid: string;
    description?: string;
    users: UserAttributeValue[];
    groups: GroupAttributeValue[];
    attributeDefault: string | null;
};

export type UserAttributeValue = {
    userUuid: string;
    email: string;
    value: string;
};

export type GroupAttributeValue = {
    groupUuid: string;
    value: string;
};

export type UserAttributeValueMap = Record<string, string[]>;

export type CreateUserAttributeValue = Omit<UserAttributeValue, 'email'>;
export type CreateGroupAttributeValue = GroupAttributeValue;

export type CreateUserAttribute = Pick<
    UserAttribute,
    'name' | 'description' | 'attributeDefault'
> & {
    users: CreateUserAttributeValue[];
    groups: CreateGroupAttributeValue[];
};

/**
 * A group→value mapping declared in `LD_SETUP_USER_ATTRIBUTES`. The group is
 * referenced by name (not UUID) because SCIM-synced groups are created by the
 * IdP, so their UUIDs aren't known at deploy time.
 */
export type UserAttributeSetupGroupMapping = {
    group: string;
    value: string;
};

/**
 * One entry in the `LD_SETUP_USER_ATTRIBUTES` instance-config env var. Defaults
 * are applied at parse time, so the post-parse shape has every field present.
 */
export type UserAttributeSetupEntry = {
    name: string;
    description?: string;
    attributeDefault: string | null;
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
