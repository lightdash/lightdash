export enum ServiceAccountScope {
    SCIM_MANAGE = 'scim:manage',
    ORG_ADMIN = 'org:admin',
}

export type ServiceAccount = {
    uuid: string;
    organizationUuid: string;
    createdAt: Date;
    expiresAt: Date | null;
    description: string;
    lastUsedAt: Date | null;
    rotatedAt: Date | null;
    scopes: ServiceAccountScope[];
};

export type ServiceAccountWithToken = ServiceAccount & {
    token: string;
};

export type ApiCreateServiceAccountRequest = Pick<
    ServiceAccount,
    'expiresAt' | 'description' | 'scopes'
>;

export type ApiCreateServiceAccountResponse = {
    token: string;
    expiresAt: Date;
};

export type CreateServiceAccount = Pick<
    ServiceAccount,
    'organizationUuid' | 'expiresAt' | 'description' | 'scopes'
>;
