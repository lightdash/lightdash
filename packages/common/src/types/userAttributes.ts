export type UserAttribute = {
    uuid: string;
    createdAt: Date;
    name: string;
    organizationUuid: string;
    description?: string;
    users: UserAttributeValue[];
    attributeDefault: string | null;
};

export type UserAttributeValue = {
    userUuid: string;
    email: string;
    value: string;
};

export type UserAttributeValueMap = Record<string, string | null>;

export type CreateUserAttributeValue = Omit<UserAttributeValue, 'email'>;
export type CreateUserAttribute = Pick<
    UserAttribute,
    'name' | 'description' | 'attributeDefault'
> & {
    users: CreateUserAttributeValue[];
};

export type ApiUserAttributesResponse = {
    status: 'ok';
    results: UserAttribute[];
};

export type ApiCreateUserAttributeResponse = {
    status: 'ok';
    results: UserAttribute;
};
