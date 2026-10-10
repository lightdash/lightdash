import {
    AgentActorSurface,
    QueryExecutionContext,
    QuerySurface,
    type Account,
} from '@lightdash/common';
import {
    aiClientFromQueryContext,
    connectionContextFromAccount,
    connectionContextFromUser,
    ConnectionSurface,
    connectionSurfaceFromQuerySurface,
    getAccountAgentIdentityFacts,
    getAgentActor,
    querySurfaceFromConnectionSurface,
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

    test('ordinary CLI queries retain API credential routing', () => {
        expect(
            connectionSurfaceFromQuerySurface(
                QuerySurface.CLI,
                QueryExecutionContext.CLI,
            ),
        ).toBe(ConnectionSurface.API);
        expect(aiClientFromQueryContext(QueryExecutionContext.CLI)).toBeNull();
    });

    test('the user builder preserves the existing registered-user default', () => {
        expect(
            connectionContextFromUser(
                { userUuid: 'user-uuid' },
                { organizationUuid: 'org-uuid', queryContext: null },
            ),
        ).toEqual({
            organizationUuid: 'org-uuid',
            agentIdentity: null,
            actor: {
                surface: ConnectionSurface.APP,
                person: {
                    userUuid: 'user-uuid',
                    isRegisteredUser: true,
                    isServiceAccount: false,
                    serviceAccountUuid: null,
                    oauthClientId: null,
                },
                aiClient: null,
            },
            queryContext: null,
            purpose: 'query',
            aiAccess: 'enforce',
        });
    });

    test.each([
        [ConnectionSurface.APP, QuerySurface.APP],
        [ConnectionSurface.IN_APP_AGENT, QuerySurface.APP],
        [ConnectionSurface.DATA_APP, QuerySurface.APP],
        [ConnectionSurface.SCHEDULE, QuerySurface.APP],
        [ConnectionSurface.EMBED, QuerySurface.APP],
        [ConnectionSurface.SLACK_AGENT, QuerySurface.SLACK],
        [ConnectionSurface.MCP, QuerySurface.MCP],
        [ConnectionSurface.API, QuerySurface.API],
        [ConnectionSurface.CLI, QuerySurface.CLI],
    ] as const)(
        'maps connection surface %s to query surface %s',
        (surface, expected) => {
            expect(querySurfaceFromConnectionSurface(surface)).toBe(expected);
        },
    );

    test.each([
        [QuerySurface.SLACK, ConnectionSurface.SLACK_AGENT],
        [QuerySurface.API, ConnectionSurface.API],
        [QuerySurface.CLI, ConnectionSurface.CLI],
        [QuerySurface.MCP, ConnectionSurface.MCP],
        [QuerySurface.APP, ConnectionSurface.IN_APP_AGENT],
    ] as const)(
        'maps query surface %s to connection surface %s',
        (surface, expected) => {
            expect(
                connectionSurfaceFromQuerySurface(
                    surface,
                    QueryExecutionContext.AI,
                ),
            ).toBe(expected);
        },
    );

    test.each(Object.values(QueryExecutionContext))(
        'app attribution preserves the default for %s',
        (context) => {
            expect(
                connectionSurfaceFromQuerySurface(QuerySurface.APP, context),
            ).toBe(surfaceFromQueryContext(context));
        },
    );

    test.each([ConnectionSurface.SLACK_AGENT, ConnectionSurface.API])(
        'the account builder overrides %s without changing the AI client',
        (surface) => {
            const account = {
                authentication: { type: 'session' },
                user: { id: 'user-uuid' },
                isRegisteredUser: () => true,
                isServiceAccount: () => false,
            } as unknown as Account;
            const context = connectionContextFromAccount(account, {
                organizationUuid: 'org-uuid',
                queryContext: QueryExecutionContext.AI,
                surface,
                aiAccess: 'diagnostic',
            });
            expect(context).toMatchObject({
                actor: { surface, aiClient: { kind: 'agent' } },
                queryContext: QueryExecutionContext.AI,
                purpose: 'query',
                aiAccess: 'diagnostic',
            });
        },
    );

    test.each([
        { isRegisteredUser: true, isServiceAccount: false },
        { isRegisteredUser: true, isServiceAccount: true },
        { isRegisteredUser: false, isServiceAccount: false },
    ])('the account builder calls the account helpers for %o', (flags) => {
        const account = {
            authentication: { type: 'session' },
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
            person: {
                userUuid: 'user-uuid',
                ...flags,
                serviceAccountUuid: null,
                oauthClientId: null,
            },
            aiClient: { kind: 'mcp' },
        });
        expect(context.purpose).toBe('compile');
        expect(account.isRegisteredUser).toHaveBeenCalledOnce();
        expect(account.isServiceAccount).toHaveBeenCalledOnce();
    });
});

describe('connection actor identity', () => {
    test('carries the service account UUID from authentication', () => {
        const account = {
            authentication: {
                type: 'service-account',
                serviceAccountUuid: 'service-account',
            },
            user: { id: 'backing-user' },
            isRegisteredUser: () => true,
            isServiceAccount: () => true,
        } as Account;
        expect(
            connectionContextFromAccount(account, {
                organizationUuid: 'org',
                queryContext: QueryExecutionContext.AI,
            }).actor.person,
        ).toEqual({
            userUuid: 'backing-user',
            isRegisteredUser: true,
            isServiceAccount: true,
            serviceAccountUuid: 'service-account',
            oauthClientId: null,
        });
    });
    test.each([
        [
            ConnectionSurface.IN_APP_AGENT,
            AgentActorSurface.IN_APP_AGENT,
            'lightdash-chat',
        ],
        [
            ConnectionSurface.DATA_APP,
            AgentActorSurface.DATA_APP,
            'lightdash-data-app',
        ],
        [ConnectionSurface.SLACK_AGENT, AgentActorSurface.SLACK_AGENT, null],
        [ConnectionSurface.MCP, AgentActorSurface.MCP, null],
    ] as const)(
        'derives the default identity for %s',
        (surface, agentSurface, clientId) => {
            expect(
                getAgentActor({ surface, person: null, aiClient: null }),
            ).toEqual({ surface: agentSurface, clientId });
        },
    );
    test('reconstructs the stored actor without replacing its client', () => {
        const context = connectionContextFromUser(
            { userUuid: 'user' },
            {
                organizationUuid: 'org',
                queryContext: QueryExecutionContext.AI,
                agentActor: {
                    surface: AgentActorSurface.AI_SUMMARY,
                    clientId: 'lightdash-ai-summary',
                },
            },
        );
        expect(getAgentActor(context.actor)).toEqual({
            surface: AgentActorSurface.AI_SUMMARY,
            clientId: 'lightdash-ai-summary',
        });
    });
});

describe('account agent identity facts', () => {
    test.each([
        [
            { type: 'oauth', clientId: 'real-client' },
            { serviceAccountUuid: null, oauthClientId: 'real-client' },
        ],
        [
            { type: 'pat', clientId: 'API key' },
            { serviceAccountUuid: null, oauthClientId: null },
        ],
        [
            {
                type: 'service-account',
                serviceAccountUuid: 'sa',
                clientId: 'Service account',
            },
            { serviceAccountUuid: 'sa', oauthClientId: null },
        ],
    ])('extracts only real ids from %j', (authentication, expected) => {
        expect(
            getAccountAgentIdentityFacts({ authentication } as Account),
        ).toEqual(expected);
    });
});
