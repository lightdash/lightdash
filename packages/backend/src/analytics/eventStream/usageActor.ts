/** Classify captured evidence only; a missing UUID does not imply anonymity. */
export const usageActorSql = (
    stream: string,
    column: (name: string) => string = (name) => `"${name}"`,
): { actorType: string; activitySource: string } => {
    const user = column('user_id');
    const identified = `WHEN ${user} IS NOT NULL THEN 'registered_user'`;
    switch (stream) {
        case 'content_views':
            return {
                actorType: `CASE WHEN ${column('actor_type')} = 'embed' OR ${column('view_context')} = 'embed' THEN 'embed' ${identified} ELSE 'unattributed' END`,
                activitySource: column('view_context'),
            };
        case 'query_events':
            return {
                actorType: `CASE
                    WHEN ${column('initiating_actor_type')} = 'service_account' THEN 'service_account'
                    WHEN ${column('initiating_actor_type')} = 'embed' OR ${column('context')} = 'embed' THEN 'embed'
                    ${identified}
                    WHEN ${column('workload_origin')} = 'scheduled' THEN 'scheduled'
                    WHEN ${column('workload_origin')} = 'agent' THEN 'ai'
                    ELSE 'unattributed' END`,
                activitySource: column('context'),
            };
        case 'ai_usage':
            return {
                actorType: `CASE ${identified} ELSE 'ai' END`,
                activitySource: column('feature'),
            };
        case 'agent_steps':
            return {
                actorType: `CASE ${identified} ELSE 'ai' END`,
                activitySource: "'agent'",
            };
        case 'mcp_tool_calls':
        case 'tool_activity':
            return {
                actorType: `CASE WHEN ${column('actor_type')} = 'service_account' THEN 'service_account' ${identified} ELSE 'unattributed' END`,
                activitySource: column('client_name'),
            };
        case 'user_activity':
            return {
                // Old summaries stay readable until their next bounded refresh.
                actorType: `COALESCE(${column('actor_category')}, CASE ${identified} WHEN ${column('stream')} IN ('ai_usage', 'agent_steps') THEN 'ai' ELSE 'unattributed' END)`,
                activitySource: column('activity_source'),
            };
        default:
            return {
                actorType: `CASE ${identified} ELSE 'unattributed' END`,
                activitySource: 'NULL::VARCHAR',
            };
    }
};

/** Preserve the existing name field ID so saved charts gain the same fallback. */
export const usageActorNameSql = (stream: string): string => {
    const { actorType, activitySource } = usageActorSql(
        stream,
        (name) => `\${${stream}.${name}}`,
    );
    return `COALESCE(NULLIF(TRIM(\${TABLE}.name), ''), CASE ${actorType}
        WHEN 'embed' THEN 'Embedded viewer'
        WHEN 'service_account' THEN 'Service account'
        WHEN 'registered_user' THEN 'User name unavailable'
        WHEN 'scheduled' THEN 'Scheduled activity'
        WHEN 'ai' THEN CASE ${activitySource}
            WHEN 'agent-suggestions' THEN 'AI activity · Suggestions'
            WHEN 'review-classifier' THEN 'AI activity · Review classification'
            WHEN 'embedding' THEN 'AI activity · Embeddings'
            WHEN 'compaction' THEN 'AI activity · Conversation compaction'
            WHEN 'ai-agent-memory' THEN 'AI activity · Agent memory'
            ELSE 'AI activity' END
        ELSE 'User not recorded' END)`;
};
