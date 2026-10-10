export enum AgentCapability {
    ReadDiscover = 'read_discover',
    Query = 'query',
    RawSql = 'raw_sql',
    ContentWrite = 'content_write',
    Delete = 'delete',
    Publish = 'publish',
    DeployUpload = 'deploy_upload',
    DbtWriteback = 'dbt_writeback',
    Export = 'export',
    Administration = 'administration',
    ExternalTools = 'external_tools',
}

export const AGENT_CAPABILITY_DEFAULTS = [
    AgentCapability.ReadDiscover,
    AgentCapability.Query,
    AgentCapability.Export,
    AgentCapability.RawSql,
] as const;

export const AGENT_PILOT_CAPABILITIES = [
    AgentCapability.ReadDiscover,
    AgentCapability.Query,
    AgentCapability.Export,
] as const;
