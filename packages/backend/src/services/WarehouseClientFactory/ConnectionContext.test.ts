import { QueryExecutionContext, type Account } from '@lightdash/common';
import {
    aiClientFromQueryContext,
    connectionContextFromAccount,
    connectionContextFromUser,
    ConnectionSurface,
    surfaceFromQueryContext,
    type ConnectionAiClient,
} from './ConnectionContext';

const expectedSurfaces = {
    [QueryExecutionContext.DASHBOARD]: ConnectionSurface.APP,
    [QueryExecutionContext.AUTOREFRESHED_DASHBOARD]: ConnectionSurface.APP,
    [QueryExecutionContext.EXPLORE]: ConnectionSurface.APP,
    [QueryExecutionContext.FILTER_AUTOCOMPLETE]: ConnectionSurface.APP,
    [QueryExecutionContext.CHART]: ConnectionSurface.APP,
    [QueryExecutionContext.CHART_HISTORY]: ConnectionSurface.APP,
    [QueryExecutionContext.SQL_CHART]: ConnectionSurface.APP,
    [QueryExecutionContext.SQL_RUNNER]: ConnectionSurface.APP,
    [QueryExecutionContext.VIEW_UNDERLYING_DATA]: ConnectionSurface.APP,
    [QueryExecutionContext.ALERT]: ConnectionSurface.SCHEDULE,
    [QueryExecutionContext.SCHEDULED_DELIVERY]: ConnectionSurface.SCHEDULE,
    [QueryExecutionContext.CSV]: ConnectionSurface.APP,
    [QueryExecutionContext.GSHEETS]: ConnectionSurface.APP,
    [QueryExecutionContext.GSHEETS_ADDON]: ConnectionSurface.APP,
    [QueryExecutionContext.SCHEDULED_GSHEETS_CHART]: ConnectionSurface.SCHEDULE,
    [QueryExecutionContext.SCHEDULED_GSHEETS_DASHBOARD]:
        ConnectionSurface.SCHEDULE,
    [QueryExecutionContext.SCHEDULED_GSHEETS_SQL_CHART]:
        ConnectionSurface.SCHEDULE,
    [QueryExecutionContext.SCHEDULED_CHART]: ConnectionSurface.SCHEDULE,
    [QueryExecutionContext.SCHEDULED_DASHBOARD]: ConnectionSurface.SCHEDULE,
    [QueryExecutionContext.CALCULATE_TOTAL]: ConnectionSurface.APP,
    [QueryExecutionContext.CALCULATE_SUBTOTAL]: ConnectionSurface.APP,
    [QueryExecutionContext.EMBED]: ConnectionSurface.EMBED,
    [QueryExecutionContext.AI]: ConnectionSurface.IN_APP_AGENT,
    [QueryExecutionContext.MCP_RUN_METRIC_QUERY]: ConnectionSurface.MCP,
    [QueryExecutionContext.MCP_RUN_SQL]: ConnectionSurface.MCP,
    [QueryExecutionContext.MCP_SEARCH_FIELD_VALUES]: ConnectionSurface.MCP,
    [QueryExecutionContext.API]: ConnectionSurface.API,
    [QueryExecutionContext.CLI]: ConnectionSurface.API,
    [QueryExecutionContext.METRICS_EXPLORER]: ConnectionSurface.APP,
    [QueryExecutionContext.PRE_AGGREGATE_MATERIALIZATION]:
        ConnectionSurface.APP,
    [QueryExecutionContext.COMPOSE_SQL_RUNNER]: ConnectionSurface.APP,
    [QueryExecutionContext.MULTI_SOURCE_QUERY]: ConnectionSurface.APP,
    [QueryExecutionContext.DATA_APP_SAMPLE]: ConnectionSurface.DATA_APP,
    [QueryExecutionContext.DESKTOP]: ConnectionSurface.APP,
} satisfies Record<QueryExecutionContext, ConnectionSurface>;

const expectedAiClients = {
    [QueryExecutionContext.AI]: { kind: 'agent' },
    [QueryExecutionContext.MCP_RUN_METRIC_QUERY]: { kind: 'mcp' },
    [QueryExecutionContext.MCP_RUN_SQL]: { kind: 'mcp' },
    [QueryExecutionContext.MCP_SEARCH_FIELD_VALUES]: { kind: 'mcp' },
    [QueryExecutionContext.DATA_APP_SAMPLE]: { kind: 'data_app' },
} satisfies Partial<Record<QueryExecutionContext, ConnectionAiClient>>;

const aiClients: Partial<Record<QueryExecutionContext, ConnectionAiClient>> =
    expectedAiClients;

describe('ConnectionContext', () => {
    test.each(Object.values(QueryExecutionContext))(
        'maps the surface and AI client for %s',
        (context) => {
            expect(surfaceFromQueryContext(context)).toBe(
                expectedSurfaces[context],
            );
            expect(aiClientFromQueryContext(context)).toEqual(
                aiClients[context] ?? null,
            );
        },
    );

    test('an absent query context maps to the app with no AI client', () => {
        expect(surfaceFromQueryContext(null)).toBe(ConnectionSurface.APP);
        expect(aiClientFromQueryContext(null)).toBeNull();
    });

    test('the user builder preserves the existing registered-user default', () => {
        expect(
            connectionContextFromUser(
                { userUuid: 'user-uuid' },
                { organizationUuid: 'org-uuid', queryContext: null },
            ),
        ).toEqual({
            organizationUuid: 'org-uuid',
            actor: {
                surface: ConnectionSurface.APP,
                person: {
                    userUuid: 'user-uuid',
                    isRegisteredUser: true,
                    isServiceAccount: false,
                },
                aiClient: null,
            },
            queryContext: null,
            purpose: 'query',
        });
    });

    test.each([
        { isRegisteredUser: true, isServiceAccount: false },
        { isRegisteredUser: true, isServiceAccount: true },
        { isRegisteredUser: false, isServiceAccount: false },
    ])('the account builder calls the account helpers for %o', (flags) => {
        const account = {
            user: { id: 'user-uuid' },
            isRegisteredUser: vi.fn(() => flags.isRegisteredUser),
            isServiceAccount: vi.fn(() => flags.isServiceAccount),
        };
        const context = connectionContextFromAccount(
            account as unknown as Account,
            {
                organizationUuid: 'org-uuid',
                queryContext: QueryExecutionContext.MCP_RUN_SQL,
                purpose: 'compile',
            },
        );
        expect(context.actor).toEqual({
            surface: ConnectionSurface.MCP,
            person: { userUuid: 'user-uuid', ...flags },
            aiClient: { kind: 'mcp' },
        });
        expect(context.purpose).toBe('compile');
        expect(account.isRegisteredUser).toHaveBeenCalledOnce();
        expect(account.isServiceAccount).toHaveBeenCalledOnce();
    });
});
