import {
    getAgentClientLabel,
    type AgentIdentityClaim,
    type WarehouseClient,
} from '@lightdash/common';

export const trustedAgentQueryTags = <T extends Record<string, string>>(
    tags: T,
    claim: AgentIdentityClaim | null,
): T => {
    const result = { ...tags };
    delete result.agent;
    delete result.agent_surface;
    delete result.agent_client;
    if (claim === null) {
        delete result.ai_principal;
        return result;
    }
    return {
        ...result,
        agent: 'true',
        agent_surface: claim.act.surface,
        agent_client: getAgentClientLabel(claim.act.client_id),
    };
};

export const withTrustedAgentQueryTags = (
    client: WarehouseClient,
    claim: AgentIdentityClaim | null,
): WarehouseClient => {
    const tags = (value: Record<string, string> = {}) =>
        trustedAgentQueryTags(value, claim);
    const methods: Pick<
        WarehouseClient,
        | 'runQuery'
        | 'streamQuery'
        | 'executeAsyncQuery'
        | 'getAllTables'
        | 'listDatabases'
        | 'getTablesForDatabase'
        | 'getFields'
    > = {
        runQuery: (sql, queryTags, timezone, values) =>
            client.runQuery(sql, tags(queryTags), timezone, values),
        streamQuery: (sql, callback, options) =>
            client.streamQuery(sql, callback, {
                ...options,
                tags: tags(options.tags),
            }),
        executeAsyncQuery: (args, callback) =>
            client.executeAsyncQuery(
                { ...args, tags: tags(args.tags) },
                callback,
            ),
        getAllTables: (schema, queryTags) =>
            client.getAllTables(schema, tags(queryTags)),
        listDatabases: (queryTags) => client.listDatabases(tags(queryTags)),
        getTablesForDatabase: (database, queryTags) =>
            client.getTablesForDatabase(database, tags(queryTags)),
        getFields: (tableName, schema, database, queryTags) =>
            client.getFields(tableName, schema, database, tags(queryTags)),
    };
    return new Proxy(client, {
        get(target, property) {
            switch (property) {
                case 'runQuery':
                case 'streamQuery':
                case 'executeAsyncQuery':
                case 'getAllTables':
                case 'listDatabases':
                case 'getTablesForDatabase':
                case 'getFields':
                    return methods[property];
                default: {
                    const value = Reflect.get(target, property, target);
                    return typeof value === 'function'
                        ? value.bind(target)
                        : value;
                }
            }
        },
    });
};
