/**
 * These are unassignable scopes inherited by default for ServiceAccounts.
 * They are used for identifying Service Accounts.
 */
export enum SystemServiceAccountScope {
    SYSTEM_LOGIN = 'system:login',
}

export enum ServiceAccountScope {
    SCIM_MANAGE = 'scim:manage',
    ORG_ADMIN = 'org:admin',
    ORG_READ = 'org:read',
}

export type ServiceAccountScopeAll =
    | ServiceAccountScope
    | SystemServiceAccountScope;

/** This is a list of all the scopes, and which scopes they contain
 * So when we check if a service account has a specific scope, or scopes
 * For example, if a service account has the scope org:admin, it will also have the scope org:read
 */
const ServiceAccountScopeHierarchy: Record<
    ServiceAccountScope,
    ServiceAccountScope[]
> = {
    [ServiceAccountScope.SCIM_MANAGE]: [],
    [ServiceAccountScope.ORG_ADMIN]: [ServiceAccountScope.ORG_READ],
    [ServiceAccountScope.ORG_READ]: [],
};

// Helper function to check if a service account has all required scopes including parent scopes
export const hasRequiredScopes = (
    serviceAccountScopes: ServiceAccountScope[],
    requiredScopes: ServiceAccountScope[],
): boolean =>
    requiredScopes.every((requiredScope) => {
        // Check if the service account has the required scope directly
        if (serviceAccountScopes.includes(requiredScope)) {
            return true;
        }

        // Check if any of the service account's scopes include the required scope as a parent
        return serviceAccountScopes.some((scope) => {
            const parentScopes = ServiceAccountScopeHierarchy[scope];
            return parentScopes.includes(requiredScope);
        });
    });

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
