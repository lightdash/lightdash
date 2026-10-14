import {
    WarehouseTypes,
    type CreateWarehouseCredentials,
    type ProjectMemberRole,
    type WarehouseClient,
    type WarehouseResults,
} from '@lightdash/common';

const asLimit = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0
        ? value
        : null;

export const hasRoleMaximumBytesBilled = (
    credentials: CreateWarehouseCredentials,
): boolean =>
    credentials.type === WarehouseTypes.BIGQUERY &&
    Object.values(credentials.maximumBytesBilledByRole ?? {}).some(
        (limit) => asLimit(limit) !== null,
    );

/**
 * The BigQuery maximum bytes billed for one query: the agent override for
 * agent queries, then the person's project role, then the connection value.
 * Returns null when the connection value applies unchanged.
 */
export const resolveMaximumBytesBilled = (
    credentials: CreateWarehouseCredentials,
    { isAgent, role }: { isAgent: boolean; role: ProjectMemberRole | null },
): number | null => {
    if (credentials.type !== WarehouseTypes.BIGQUERY) return null;
    const agentLimit = asLimit(credentials.agentMaximumBytesBilled);
    if (isAgent && agentLimit !== null) return agentLimit;
    return role === null
        ? null
        : asLimit(credentials.maximumBytesBilledByRole?.[role]);
};

export const withMaximumBytesBilled = (
    client: WarehouseClient,
    maximumBytesBilled: number | null,
): WarehouseClient => {
    if (maximumBytesBilled === null) return client;
    const methods: Pick<
        WarehouseClient,
        'runQuery' | 'streamQuery' | 'executeAsyncQuery'
    > = {
        runQuery: async (sql, tags, timezone, values) => {
            let fields: WarehouseResults['fields'] = {};
            const rows: WarehouseResults['rows'] = [];
            await client.streamQuery(
                sql,
                (data) => {
                    fields = data.fields;
                    rows.push(...data.rows);
                },
                { values, tags, timezone, maximumBytesBilled },
            );
            return { fields, rows };
        },
        streamQuery: (sql, callback, options) =>
            client.streamQuery(sql, callback, {
                ...options,
                maximumBytesBilled,
            }),
        executeAsyncQuery: (args, callback) =>
            client.executeAsyncQuery({ ...args, maximumBytesBilled }, callback),
    };
    return new Proxy(client, {
        get(target, property) {
            switch (property) {
                case 'runQuery':
                case 'streamQuery':
                case 'executeAsyncQuery':
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
