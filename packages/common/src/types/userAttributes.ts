export type OrgAttribute = {
    uuid: string;
    createdAt: Date;
    name: string;
    organizationUuid: string;
    description?: string;
    users: UserAttribute[];
};

export type UserAttribute = {
    userUuid: string;
    email: string;
    value: string;
};

export type CreateOrgAttribute = Omit<
    OrgAttribute,
    'uuid' | 'createdAt' | 'organizationUuid'
>;

export type ApiOrgAttributesResponse = {
    status: 'ok';
    results: OrgAttribute[];
};

export type ApiCreateOrgAttributesResponse = {
    status: 'ok';
    results: OrgAttribute;
};
