import {
    AgentActorSurface,
    buildAgentIdentityClaim,
    getAgentClientLabel,
} from './agentIdentity';
import { QueryExecutionContext, withAgentMarkerTag } from './analytics';

describe('withAgentMarkerTag', () => {
    test.each([
        QueryExecutionContext.AI,
        QueryExecutionContext.MCP_RUN_METRIC_QUERY,
        QueryExecutionContext.MCP_RUN_SQL,
        QueryExecutionContext.MCP_SEARCH_FIELD_VALUES,
        QueryExecutionContext.DATA_APP_SAMPLE,
    ])('marks %s without changing existing tags', (context) => {
        const tags = { query_context: context, user_uuid: 'person' };
        expect(withAgentMarkerTag(tags)).toEqual({ ...tags, agent: 'true' });
        expect(tags).not.toHaveProperty('agent');
    });

    test.each(
        Object.values(QueryExecutionContext).filter(
            (context) =>
                ![
                    QueryExecutionContext.AI,
                    QueryExecutionContext.MCP_RUN_METRIC_QUERY,
                    QueryExecutionContext.MCP_RUN_SQL,
                    QueryExecutionContext.MCP_SEARCH_FIELD_VALUES,
                    QueryExecutionContext.DATA_APP_SAMPLE,
                ].includes(context),
        ),
    )('leaves %s unmarked', (context) => {
        const tags = { query_context: context, user_uuid: 'person' };
        expect(withAgentMarkerTag(tags)).toEqual(tags);
        expect(withAgentMarkerTag(tags)).not.toHaveProperty('agent');
    });
});

describe('agent identity query tags', () => {
    test.each(['oauth-client', 'OAuth.Client', null])(
        'adds only identifiers for client %s',
        (clientId) => {
            const identity = buildAgentIdentityClaim({
                subject: { type: 'user', uuid: 'private-user' },
                surface: AgentActorSurface.MCP,
                clientId,
            });
            expect(
                withAgentMarkerTag(
                    { query_context: QueryExecutionContext.MCP_RUN_SQL },
                    identity,
                ),
            ).toEqual({
                query_context: QueryExecutionContext.MCP_RUN_SQL,
                agent: 'true',
                agent_surface: 'mcp',
                agent_client: getAgentClientLabel(clientId),
            });
        },
    );
    test.each(Object.values(QueryExecutionContext))(
        'keeps flag-off tags byte-identical for %s',
        (context) => {
            const tags = { query_context: context, original: 'value' };
            expect(JSON.stringify(withAgentMarkerTag(tags, null))).toBe(
                JSON.stringify(withAgentMarkerTag(tags)),
            );
        },
    );
});
