import { Knex } from 'knex';

export const AiAgentTableName = 'ai_agent';

export type DbAiAgent = {
    ai_agent_uuid: string;
    organization_uuid: string;
    project_uuid: string;
    name: string;
    slug: string;
    description: string | null;
    image_url: string | null;
    tags: string[] | null;
    enable_data_access: boolean;
    enable_self_improvement: boolean;
    /**
     * @deprecated Per-agent reasoning toggle was removed. The gating feature flag
     * `agent-reasoning` was never enabled so this column was effectively
     * unused. Reasoning is now controlled per-prompt via `ai_prompt.model_config.reasoning`.
     * Column kept on the table (DB default `false`); drop in a follow-up migration.
     */
    enable_reasoning?: boolean;
    version: number;
    created_at: Date;
    updated_at: Date;
};

export type AiAgentTable = Knex.CompositeTableType<
    // base
    DbAiAgent,
    // insert
    Omit<DbAiAgent, 'ai_agent_uuid' | 'created_at' | 'updated_at'>,
    // update
    Partial<Omit<DbAiAgent, 'ai_agent_uuid' | 'created_at' | 'updated_at'>> & {
        updated_at: Knex.Raw;
    }
>;

export const AiAgentIntegrationTableName = 'ai_agent_integration';

export type DbAiAgentIntegration = {
    ai_agent_integration_uuid: string;
    ai_agent_uuid: string;
    integration_type: string;
    created_at: Date;
};

export type AiAgentIntegrationTable = Knex.CompositeTableType<
    DbAiAgentIntegration,
    Omit<DbAiAgentIntegration, 'ai_agent_integration_uuid' | 'created_at'>
>;

export const AiAgentSlackIntegrationTableName = 'ai_agent_slack_integration';

export type DbAiAgentSlackIntegration = {
    ai_agent_integration_slack_uuid: string;
    organization_uuid: string;
    ai_agent_integration_uuid: string;
    slack_channel_id: string;
    created_at: Date;
};

export type AiAgentSlackIntegrationTable = Knex.CompositeTableType<
    DbAiAgentSlackIntegration,
    Omit<
        DbAiAgentSlackIntegration,
        'ai_agent_integration_slack_uuid' | 'created_at'
    >
>;

export const AiAgentInstructionVersionsTableName =
    'ai_agent_instruction_versions';

export type DbAiAgentInstructionVersions = {
    ai_agent_instruction_version_uuid: string;
    ai_agent_uuid: string;
    instruction: string;
    created_at: Date;
};

export type AiAgentInstructionVersionsTable = Knex.CompositeTableType<
    // base
    DbAiAgentInstructionVersions,
    // insert
    Omit<
        DbAiAgentInstructionVersions,
        'ai_agent_instruction_version_uuid' | 'created_at'
    >
    // update - defaults to partial of insert
>;

export const AiAgentGroupAccessTableName = 'ai_agent_group_access';

export type DbAiAgentGroupAccess = {
    group_uuid: string;
    ai_agent_uuid: string;
    created_at: Date;
};

export type AiAgentGroupAccessTable = Knex.CompositeTableType<
    // base
    DbAiAgentGroupAccess,
    // insert
    Omit<DbAiAgentGroupAccess, 'created_at'>,
    // update
    Partial<
        Omit<
            DbAiAgentGroupAccess,
            'group_uuid' | 'ai_agent_uuid' | 'created_at'
        >
    >
>;

export const AiAgentUserAccessTableName = 'ai_agent_user_access';

export type DbAiAgentUserAccess = {
    user_uuid: string;
    ai_agent_uuid: string;
    created_at: Date;
};

export type AiAgentUserAccessTable = Knex.CompositeTableType<
    // base
    DbAiAgentUserAccess,
    // insert
    Omit<DbAiAgentUserAccess, 'created_at'>,
    // update
    Partial<
        Omit<DbAiAgentUserAccess, 'user_uuid' | 'ai_agent_uuid' | 'created_at'>
    >
>;

export const AiAgentSpaceAccessTableName = 'ai_agent_space_access';

export type DbAiAgentSpaceAccess = {
    ai_agent_uuid: string;
    space_uuid: string;
    created_at: Date;
};

export type AiAgentSpaceAccessTable = Knex.CompositeTableType<
    // base
    DbAiAgentSpaceAccess,
    // insert
    Omit<DbAiAgentSpaceAccess, 'created_at'>,
    // update
    Partial<
        Omit<
            DbAiAgentSpaceAccess,
            'ai_agent_uuid' | 'space_uuid' | 'created_at'
        >
    >
>;

export const AiMcpServerTableName = 'ai_mcp_server';

export type DbAiMcpServer = {
    ai_mcp_server_uuid: string;
    project_uuid: string;
    name: string;
    url: string;
    icon_url: string | null;
    auth_type: 'none' | 'bearer' | 'oauth';
    connection_status:
        | 'not_connected'
        | 'connecting'
        | 'connected'
        | 'error'
        | null;
    error: string | null;
    created_at: Date;
    updated_at: Date;
};

export type AiMcpServerTable = Knex.CompositeTableType<
    DbAiMcpServer,
    Omit<DbAiMcpServer, 'ai_mcp_server_uuid' | 'created_at' | 'updated_at'>,
    Partial<
        Omit<DbAiMcpServer, 'ai_mcp_server_uuid' | 'created_at' | 'updated_at'>
    > & {
        updated_at: Knex.Raw;
    }
>;

export const AiMcpServerCredentialTableName = 'ai_mcp_server_credential';

export type DbAiMcpServerCredential = {
    ai_mcp_server_credential_uuid: string;
    ai_mcp_server_uuid: string;
    credential_scope: 'shared' | 'user';
    user_uuid: string | null;
    encrypted_credentials: Buffer;
    created_by_user_uuid: string | null;
    updated_by_user_uuid: string | null;
    created_at: Date;
    updated_at: Date;
};

export type AiMcpServerCredentialTable = Knex.CompositeTableType<
    DbAiMcpServerCredential,
    Omit<
        DbAiMcpServerCredential,
        'ai_mcp_server_credential_uuid' | 'created_at' | 'updated_at'
    >,
    Partial<
        Omit<
            DbAiMcpServerCredential,
            'ai_mcp_server_credential_uuid' | 'created_at' | 'updated_at'
        >
    > & {
        updated_at: Knex.Raw;
    }
>;

export const AiAgentMcpServerTableName = 'ai_agent_mcp_server';

export type DbAiAgentMcpServer = {
    ai_agent_uuid: string;
    ai_mcp_server_uuid: string;
    created_at: Date;
};

export type AiAgentMcpServerTable = Knex.CompositeTableType<
    DbAiAgentMcpServer,
    Omit<DbAiAgentMcpServer, 'created_at'>,
    Partial<
        Omit<
            DbAiAgentMcpServer,
            'ai_agent_uuid' | 'ai_mcp_server_uuid' | 'created_at'
        >
    >
>;

export const AiMcpServerToolTableName = 'ai_mcp_server_tool';

export type DbAiMcpServerTool = {
    ai_mcp_server_tool_uuid: string;
    ai_mcp_server_uuid: string;
    tool_name: string;
    title: string | null;
    description: string | null;
    input_schema: unknown;
    annotations: unknown | null;
    meta: unknown | null;
    created_at: Date;
    updated_at: Date;
};

export type AiMcpServerToolTable = Knex.CompositeTableType<
    DbAiMcpServerTool,
    Omit<
        DbAiMcpServerTool,
        'ai_mcp_server_tool_uuid' | 'created_at' | 'updated_at'
    >,
    Partial<
        Omit<
            DbAiMcpServerTool,
            'ai_mcp_server_tool_uuid' | 'created_at' | 'updated_at'
        >
    > & {
        updated_at: Knex.Raw;
    }
>;

export const AiAgentMcpServerToolTableName = 'ai_agent_mcp_server_tool';

export type DbAiAgentMcpServerTool = {
    ai_agent_uuid: string;
    ai_mcp_server_uuid: string;
    ai_mcp_server_tool_uuid: string;
    enabled: boolean;
    created_at: Date;
    updated_at: Date;
};

export type AiAgentMcpServerToolTable = Knex.CompositeTableType<
    DbAiAgentMcpServerTool,
    Omit<DbAiAgentMcpServerTool, 'created_at' | 'updated_at'>,
    Partial<
        Omit<
            DbAiAgentMcpServerTool,
            | 'ai_agent_uuid'
            | 'ai_mcp_server_uuid'
            | 'ai_mcp_server_tool_uuid'
            | 'created_at'
        >
    > & {
        updated_at: Knex.Raw;
    }
>;
