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
