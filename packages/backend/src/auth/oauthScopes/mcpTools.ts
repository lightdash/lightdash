import { ForbiddenError, type MemberAbility } from '@lightdash/common';
import { getOAuthScopeContext } from './scopedAbility';

export const MCP_TOOL_SCOPE_MAP: Readonly<Record<string, 'read' | 'write'>> = {
    connect_agent: 'read',
    get_lightdash_version: 'read',
    generate_hashes: 'read',
    list_explores: 'read',
    grep_fields: 'read',
    get_metadata: 'read',
    find_content: 'read',
    list_content: 'read',
    read_content: 'read',
    resolve_url: 'read',
    create_content: 'write',
    edit_content: 'write',
    create_scheduled_delivery: 'write',
    list_projects: 'read',
    get_context: 'read',
    set_project: 'read',
    get_current_project: 'read',
    list_agents: 'read',
    route_agent: 'read',
    set_agent: 'read',
    clear_agent: 'read',
    get_current_agent: 'read',
    run_metric_query: 'read',
    run_composer_queries: 'read',
    render_chart: 'read',
    run_sql: 'read',
    get_query_result: 'read',
    search_field_values: 'read',
    list_verified_content: 'read',
    run_ai_writeback: 'write',
    get_ai_writeback_status: 'read',
    generate_data_app: 'write',
    iterate_data_app: 'write',
    list_data_app_themes: 'read',
    get_data_app_build_status: 'read',
    list_skills: 'read',
    read_skill: 'read',
    read_skill_resource: 'read',
};

export const isMcpToolAllowed = (
    scopes: readonly string[],
    toolName: string,
): boolean => {
    if (!Object.hasOwn(MCP_TOOL_SCOPE_MAP, toolName)) return false;
    return (
        scopes.includes('mcp:write') ||
        (scopes.includes('mcp:read') && MCP_TOOL_SCOPE_MAP[toolName] === 'read')
    );
};

export const assertOAuthMcpToolAllowed = (
    ability: MemberAbility,
    toolName: string,
): void => {
    const context = getOAuthScopeContext(ability);
    if (context === null || isMcpToolAllowed(context.scopes, toolName)) return;
    context.record(
        'call',
        'McpTool',
        Object.hasOwn(MCP_TOOL_SCOPE_MAP, toolName) ? toolName : '[unknown]',
    );
    if (context.mode === 'enforce') {
        throw new ForbiddenError('OAuth scope does not allow this MCP tool');
    }
};
