export type UserAttribute = {
    uuid: string;
    createdAt: Date;
    name: string;
    organizationUuid: string;
    description?: string;
    users: UserAttributeValue[];
};

export type UserAttributeValue = {
    userUuid: string;
    email: string;
    value: string;
};

export type CreateUserAttributeValue = Omit<UserAttributeValue, 'email'>;
export type CreateUserAttribute = Pick<
    UserAttribute,
    'name' | 'description'
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
