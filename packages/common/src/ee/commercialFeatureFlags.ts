export enum CommercialFeatureFlags {
    Embedding = 'embedding',
    Scim = 'scim-token-management',
    AiCopilot = 'ai-copilot',
    ServiceAccounts = 'service-accounts',
    OrganizationWarehouseCredentials = 'organization-warehouse-credentials',
    CustomRoles = 'custom-roles',
    HomepageBuilder = 'homepage-builder',
    /**
     * Org opt-in: the primary-slot org custom role's scope list fully decides
     * `manage:PersonalAccessToken` instead of inheriting the deployment default.
     */
    PatScopeAuthoritative = 'pat-scope-authoritative',
    /**
     * Per-organization kill switch for pre-aggregates. On wherever the
     * instance has a licence and pre-aggregate storage; a Console override
     * can only switch an organization off.
     */
    PreAggregates = 'pre-aggregates',
}
