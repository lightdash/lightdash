import {
    aiIdentitySnowflakeIdentifier,
    CreateSnowflakeCredentials,
    getErrorMessage,
    SnowflakeAuthenticationType,
} from '@lightdash/common';
import { SnowflakeWarehouseClient } from '@lightdash/warehouses';

export const buildAiTwinCredentials = ({
    projectCredentials,
    twinName,
    privateKey,
}: {
    projectCredentials: CreateSnowflakeCredentials;
    twinName: string;
    privateKey: string;
}): CreateSnowflakeCredentials => ({
    ...projectCredentials,
    user: twinName,
    authenticationType: SnowflakeAuthenticationType.PRIVATE_KEY,
    privateKey,
    privateKeyPass: undefined,
    password: undefined,
    token: undefined,
    refreshToken: undefined,
    role: undefined,
    requireUserCredentials: false,
    requireAgentSession: true,
    expectedCurrentUser: twinName,
});

export const listAiTwinSchemas = async (
    credentials: CreateSnowflakeCredentials,
    databases: string[],
): Promise<string[]> => {
    const client = new SnowflakeWarehouseClient(credentials);
    const results = await Promise.all(
        databases.map(async (database) => {
            const name = aiIdentitySnowflakeIdentifier(database);
            try {
                const result = await client.runQuery(
                    `SHOW SCHEMAS IN DATABASE ${name}`,
                );
                return result.rows.map((row) => {
                    const schemaName = Object.entries(row).find(
                        ([field]) => field.toUpperCase() === 'NAME',
                    )?.[1];
                    return `${name}.${String(schemaName ?? '')}`;
                });
            } catch (cause) {
                if (
                    cause instanceof Error &&
                    /database .* does not exist or not authorized/i.test(
                        cause.message,
                    )
                )
                    return [];
                throw cause;
            }
        }),
    );
    return results.flat();
};

export const checkAiTwinConnection = async (
    credentials: CreateSnowflakeCredentials,
): Promise<
    | { ok: true; currentUser: string; currentRole: string | null }
    | { ok: false; message: string }
> => {
    try {
        const client = new SnowflakeWarehouseClient(credentials);
        const result = await client.runQuery(
            "SELECT CURRENT_USER() AS CURRENT_USER, CURRENT_ROLE() AS CURRENT_ROLE, SYS_CONTEXT('SNOWFLAKE$CURRENT', 'IS_AGENT_ACTIVATED')::BOOLEAN AS IS_AGENT_ACTIVATED",
        );
        const row = result.rows[0];
        const currentUser = String(row?.CURRENT_USER ?? '');
        const currentRole =
            row?.CURRENT_ROLE == null ? null : String(row.CURRENT_ROLE);
        if (row?.IS_AGENT_ACTIVATED !== true) {
            return {
                ok: false,
                message:
                    'Snowflake did not mark this session as an agent session. Check the user is TYPE = SERVICE_AGENT.',
            };
        }
        if (
            currentUser.toUpperCase() !==
            credentials.expectedCurrentUser?.toUpperCase()
        ) {
            return {
                ok: false,
                message: `Snowflake signed in as ${currentUser}, not ${credentials.expectedCurrentUser}.`,
            };
        }
        return { ok: true, currentUser, currentRole };
    } catch (e) {
        return {
            ok: false,
            message: `Could not connect to the Snowflake AI user: ${getErrorMessage(e)}`,
        };
    }
};
