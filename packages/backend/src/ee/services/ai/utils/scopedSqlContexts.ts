import { QueryExecutionContext } from '@lightdash/common';

/**
 * Query execution contexts whose raw SQL is subject to the project's agent SQL
 * scope.
 *
 * The human SQL Runner is deliberately absent: the scope narrows what an agent
 * will read, it does not narrow what a person with `manage SqlRunner` may
 * query. Restricting the SQL Runner here would silently shrink a surface
 * customers rely on.
 *
 * Both agent-facing entry points funnel through
 * `AsyncQueryService.executeAsyncSqlQuery`, so gating there rather than at each
 * caller means a new agent SQL path cannot be added without inheriting the
 * scope.
 */
const AGENT_SCOPED_QUERY_CONTEXTS: ReadonlySet<QueryExecutionContext> = new Set(
    [
        QueryExecutionContext.AI,
        QueryExecutionContext.MCP_RUN_SQL,
        // MCP-submitted multi-source queries: the sql source funnels through
        // executeAsyncSqlQuery, so this context inherits the agent SQL scope
        // (the human multiSourceQuery context stays unscoped, like sqlRunner)
        QueryExecutionContext.MCP_MULTI_SOURCE_QUERY,
    ],
);

export const isAgentScopedQueryContext = (
    context: QueryExecutionContext | undefined,
): boolean => !!context && AGENT_SCOPED_QUERY_CONTEXTS.has(context);
