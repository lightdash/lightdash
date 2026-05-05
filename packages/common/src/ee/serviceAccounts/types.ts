export enum ServiceAccountScope {
    SCIM_MANAGE = 'scim:manage',
    ORG_ADMIN = 'org:admin',
    ORG_EDIT = 'org:edit',
    ORG_READ = 'org:read',
}

export type ServiceAccount = {
    uuid: string;
    createdByUserUuid: string | null;
    organizationUuid: string;
    createdAt: Date;
    expiresAt: Date | null;
    description: string;
    lastUsedAt: Date | null;
    rotatedAt: Date | null;
    scopes: ServiceAccountScope[];
    // The dedicated `users` row provisioned for this service account. Auth
    // middleware loads this user to build `req.user`, so writes attribute the
    // service account itself (not a fallback admin) on `created_by_user_uuid`
    // / `updated_by_user_uuid` and audit logs.
    userUuid: string;
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
