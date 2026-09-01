export enum CommercialFeatureFlags {
    Embedding = 'embedding',
    Scim = 'scim-token-management',
    AiCopilot = 'ai-copilot',
    ServiceAccounts = 'service-accounts',
    OrganizationWarehouseCredentials = 'organization-warehouse-credentials',
    CustomRoles = 'custom-roles',
    DirectAccess = 'direct-access',
    ContentReviewRequests = 'content-review-requests',
    HomepageBuilder = 'homepage-builder',
    /**
     * Org opt-in: the primary-slot org custom role's scope list fully decides
     * `manage:PersonalAccessToken` instead of inheriting the deployment default.
     */
    PatScopeAuthoritative = 'pat-scope-authoritative',
}
