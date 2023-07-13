export type OrgUserAttribute = {
    uuid: string;
    name: string;
    organizationUuid: string;
    description?: string;
    users: UserAttribute[];
};

export type UserAttribute = {
    userUuid: string;
    value: string;
};

export type ApiUserAttributesResponse = {
    status: 'ok';
    results: OrgUserAttribute[];
};
