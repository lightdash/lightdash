export enum CommercialFeatureFlags {
    Embedding = 'embedding',
    Scim = 'scim-token-management',
    AiCopilot = 'ai-copilot',
    ServiceAccounts = 'service-accounts',
    OrganizationWarehouseCredentials = 'organization-warehouse-credentials',
    CustomRoles = 'custom-roles',
    /** Multiple roles per organization/project (requires CustomRoles). Gates management surfaces only. */
    MultipleRoles = 'multiple-roles',
    HomepageBuilder = 'homepage-builder',
}
