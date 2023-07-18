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

export type CreateOrgAttribute = Omit<
    UserAttribute,
    'uuid' | 'createdAt' | 'organizationUuid'
>;

export type ApiOrgAttributesResponse = {
    status: 'ok';
    results: UserAttribute[];
};

export type ApiCreateOrgAttributesResponse = {
    status: 'ok';
    results: UserAttribute;
};
