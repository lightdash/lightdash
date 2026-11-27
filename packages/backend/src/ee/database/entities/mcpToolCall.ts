import { Knex } from 'knex';

export const McpToolCallTableName = 'mcp_tool_call';

export type DbMcpToolCall = {
    mcp_tool_call_uuid: string;
    organization_uuid: string;
    user_uuid: string;
    project_uuid: string | null;
    agent_uuid: string | null;
    tool_name: string;
    tool_args: object;
    status: 'success' | 'error';
    error_message: string | null;
    duration_ms: number;
    result_metadata: object | null;
    client_name: string | null;
    client_version: string | null;
    user_agent: string | null;
    auth_type: string;
    protocol_version: string | null;
    mcp_session_id: string | null;
    direction: 'inbound' | 'outbound';
    ai_mcp_server_uuid: string | null;
    created_at: Date;
};

export type McpToolCallTable = Knex.CompositeTableType<
    DbMcpToolCall,
    Omit<DbMcpToolCall, 'mcp_tool_call_uuid' | 'created_at'>,
    never
>;

export const McpSessionClientInfoTableName = 'mcp_session_client_info';

export type DbMcpSessionClientInfo = {
    mcp_session_id: string;
    user_uuid: string;
    organization_uuid: string;
    client_name: string;
    client_version: string | null;
    created_at: Date;
};

export type McpSessionClientInfoTable = Knex.CompositeTableType<
    DbMcpSessionClientInfo,
    Omit<DbMcpSessionClientInfo, 'created_at'>,
    never
>;
