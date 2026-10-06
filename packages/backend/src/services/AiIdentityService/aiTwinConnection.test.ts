import { SnowflakeAuthenticationType, WarehouseTypes } from '@lightdash/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    buildAiTwinCredentials,
    checkAiTwinConnection,
    listAiTwinSchemas,
} from './aiTwinConnection';

const runQuery = vi.fn();
vi.mock('@lightdash/warehouses', () => ({
    SnowflakeWarehouseClient: class {
        runQuery = runQuery;
    },
}));

const projectCredentials = {
    type: WarehouseTypes.SNOWFLAKE as const,
    account: 'account',
    user: 'project-user',
    password: 'password',
    role: 'project-role',
    database: 'DB',
    warehouse: 'WH',
    schema: 'SCHEMA',
};

beforeEach(() => {
    runQuery.mockReset();
});

describe('AI twin connection', () => {
    it('uses key auth and leaves the twin default role in force', () => {
        const credentials = buildAiTwinCredentials({
            projectCredentials,
            twinName: 'TWIN',
            privateKey: 'PRIVATE',
        });
        expect(credentials).toMatchObject({
            user: 'TWIN',
            privateKey: 'PRIVATE',
            authenticationType: SnowflakeAuthenticationType.PRIVATE_KEY,
            requireAgentSession: true,
            expectedCurrentUser: 'TWIN',
        });
        expect(credentials.role).toBeUndefined();
        expect(credentials.password).toBeUndefined();
        expect(credentials.token).toBeUndefined();
    });

    it('accepts the active expected user', async () => {
        runQuery.mockResolvedValueOnce({
            rows: [
                {
                    CURRENT_USER: 'TWIN',
                    CURRENT_ROLE: 'ROLE',
                    IS_AGENT_ACTIVATED: true,
                },
            ],
        });
        await expect(
            checkAiTwinConnection(
                buildAiTwinCredentials({
                    projectCredentials,
                    twinName: 'TWIN',
                    privateKey: 'PRIVATE',
                }),
            ),
        ).resolves.toEqual({
            ok: true,
            currentUser: 'TWIN',
            currentRole: 'ROLE',
        });
    });

    it('returns the warehouse error when the connection fails', async () => {
        runQuery.mockRejectedValueOnce(new Error('Connection refused'));
        const result = await checkAiTwinConnection(
            buildAiTwinCredentials({
                projectCredentials,
                twinName: 'TWIN',
                privateKey: 'PRIVATE',
            }),
        );
        expect(result).toEqual({
            ok: false,
            message:
                'Could not connect to the Snowflake AI user: Connection refused',
        });
    });

    it('explains an inactive agent session', async () => {
        runQuery.mockResolvedValueOnce({
            rows: [{ CURRENT_USER: 'TWIN', IS_AGENT_ACTIVATED: false }],
        });
        const result = await checkAiTwinConnection(
            buildAiTwinCredentials({
                projectCredentials,
                twinName: 'TWIN',
                privateKey: 'PRIVATE',
            }),
        );
        expect(result).toEqual({
            ok: false,
            message:
                'Snowflake did not mark this session as an agent session. Check the user is TYPE = SERVICE_AGENT.',
        });
    });

    it('explains a user mismatch', async () => {
        runQuery.mockResolvedValueOnce({
            rows: [{ CURRENT_USER: 'OTHER', IS_AGENT_ACTIVATED: true }],
        });
        const result = await checkAiTwinConnection(
            buildAiTwinCredentials({
                projectCredentials,
                twinName: 'TWIN',
                privateKey: 'PRIVATE',
            }),
        );
        expect(result).toEqual({
            ok: false,
            message: 'Snowflake signed in as OTHER, not TWIN.',
        });
    });

    it('lists visible schemas across databases with case-insensitive row names', async () => {
        runQuery.mockResolvedValueOnce({ rows: [{ name: 'PUBLIC' }] });
        runQuery.mockResolvedValueOnce({ rows: [{ NAME: 'SALES' }] });
        await expect(
            listAiTwinSchemas(projectCredentials, ['DB', 'OTHER']),
        ).resolves.toEqual(['DB.PUBLIC', 'OTHER.SALES']);
        expect(runQuery).toHaveBeenNthCalledWith(
            1,
            'SHOW SCHEMAS IN DATABASE DB',
        );
        expect(runQuery).toHaveBeenNthCalledWith(
            2,
            'SHOW SCHEMAS IN DATABASE OTHER',
        );
    });

    it('treats an inaccessible database as empty and propagates other errors', async () => {
        runQuery.mockRejectedValueOnce(
            new Error("Database 'DB' does not exist or not authorized."),
        );
        runQuery.mockResolvedValueOnce({ rows: [{ name: 'PUBLIC' }] });
        await expect(
            listAiTwinSchemas(projectCredentials, ['DB', 'OTHER']),
        ).resolves.toEqual(['OTHER.PUBLIC']);
        runQuery.mockRejectedValueOnce(new Error('Connection refused'));
        await expect(
            listAiTwinSchemas(projectCredentials, ['DB']),
        ).rejects.toThrow('Connection refused');
    });

    it('rejects invalid database identifiers before querying', async () => {
        await expect(
            listAiTwinSchemas(projectCredentials, ['BAD-NAME']),
        ).rejects.toThrow();
        expect(runQuery).not.toHaveBeenCalled();
    });
});
