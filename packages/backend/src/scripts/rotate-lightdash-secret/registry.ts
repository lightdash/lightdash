export type CiphertextRegistryEntry = {
    table: string;
    primaryKeyColumn: string;
    column: string;
};

// Every database field that stores EncryptionUtil (AES-256-GCM) ciphertext
// derived from LIGHTDASH_SECRET. Tables are existence-checked at runtime so
// EE-only and dormant tables are skipped on instances that lack them.
// `dbt_cloud_integrations.service_token` is a dormant legacy field: its
// reader was removed but the table was never dropped, so old deployments can
// still hold ciphertext in it.
export const CIPHERTEXT_REGISTRY: CiphertextRegistryEntry[] = [
    {
        table: 'projects',
        primaryKeyColumn: 'project_id',
        column: 'dbt_connection',
    },
    {
        table: 'warehouse_credentials',
        primaryKeyColumn: 'warehouse_credentials_id',
        column: 'encrypted_credentials',
    },
    {
        table: 'organization_warehouse_credentials',
        primaryKeyColumn: 'organization_warehouse_credentials_uuid',
        column: 'warehouse_connection',
    },
    {
        table: 'user_warehouse_credentials',
        primaryKeyColumn: 'user_warehouse_credentials_uuid',
        column: 'encrypted_credentials',
    },
    {
        table: 'project_dbt_sources',
        primaryKeyColumn: 'project_dbt_source_uuid',
        column: 'dbt_connection',
    },
    {
        table: 'warehouse_connect_codes',
        primaryKeyColumn: 'warehouse_connect_code_uuid',
        column: 'encrypted_credentials',
    },
    {
        table: 'ssh_key_pairs',
        primaryKeyColumn: 'public_key',
        column: 'private_key',
    },
    {
        table: 'github_app_installations',
        primaryKeyColumn: 'github_app_installation_uuid',
        column: 'encrypted_installation_id',
    },
    {
        table: 'gitlab_app_installations',
        primaryKeyColumn: 'gitlab_app_installation_uuid',
        column: 'encrypted_installation_id',
    },
    {
        table: 'linear_app_installations',
        primaryKeyColumn: 'linear_app_installation_uuid',
        column: 'encrypted_installation_id',
    },
    {
        table: 'linear_app_installations',
        primaryKeyColumn: 'linear_app_installation_uuid',
        column: 'encrypted_access_token',
    },
    {
        table: 'linear_app_installations',
        primaryKeyColumn: 'linear_app_installation_uuid',
        column: 'encrypted_refresh_token',
    },
    {
        table: 'git_user_credentials',
        primaryKeyColumn: 'git_user_credential_uuid',
        column: 'encrypted_auth_token',
    },
    {
        table: 'git_user_credentials',
        primaryKeyColumn: 'git_user_credential_uuid',
        column: 'encrypted_refresh_token',
    },
    {
        table: 'user_oauth_grants',
        primaryKeyColumn: 'user_oauth_grant_uuid',
        column: 'encrypted_refresh_token',
    },
    {
        table: 'organization_sso_configurations',
        primaryKeyColumn: 'organization_sso_configuration_uuid',
        column: 'config',
    },
    {
        table: 'embedding',
        primaryKeyColumn: 'project_uuid',
        column: 'encoded_secret',
    },
    {
        table: 'managed_agent_settings',
        primaryKeyColumn: 'project_uuid',
        column: 'service_account_token',
    },
    {
        table: 'mobile_push_installations',
        primaryKeyColumn: 'mobile_push_installation_uuid',
        column: 'encrypted_device_token',
    },
    {
        table: 'ai_agent_live_activities',
        primaryKeyColumn: 'live_activity_uuid',
        column: 'encrypted_push_token',
    },
    {
        table: 'ai_mcp_server_credential',
        primaryKeyColumn: 'ai_mcp_server_credential_uuid',
        column: 'encrypted_credentials',
    },
    {
        table: 'ai_organization_settings',
        primaryKeyColumn: 'organization_uuid',
        column: 'encrypted_provider_api_keys',
    },
    {
        table: 'external_connection_secrets',
        primaryKeyColumn: 'external_connection_uuid',
        column: 'encrypted_payload',
    },
    {
        table: 'dbt_cloud_integrations',
        primaryKeyColumn: 'project_id',
        column: 'service_token',
    },
];
