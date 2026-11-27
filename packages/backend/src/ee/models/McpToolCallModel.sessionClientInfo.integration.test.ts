import { randomUUID } from 'crypto';
import { Knex } from 'knex';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../testing/migratedDatabase';
import { McpToolCallModel } from './McpToolCallModel';

describe('McpToolCallModel session client info (PostgreSQL)', () => {
    let migrated: MigratedDatabase;
    let database: Knex;
    let model: McpToolCallModel;
    let organizationUuid: string;
    let userUuid: string;
    let otherUserUuid: string;

    const insertUser = async () => {
        const [user] = await database('users')
            .insert({
                first_name: 'Test',
                last_name: 'User',
                is_active: true,
                is_marketing_opted_in: false,
                is_setup_complete: true,
                is_tracking_anonymized: false,
            })
            .returning('user_uuid');
        return user.user_uuid;
    };

    beforeAll(async () => {
        migrated = await createMigratedDatabase(undefined, { min: 0, max: 4 });
        database = migrated.database;
        model = new McpToolCallModel({ database });
        const [org] = await database('organizations')
            .insert({ organization_name: `mcp ${randomUUID()}` })
            .returning(['organization_uuid']);
        organizationUuid = org.organization_uuid;
        userUuid = await insertUser();
        otherUserUuid = await insertUser();
    });

    afterAll(async () => {
        await migrated?.destroy();
    });

    test('reads a session client only for the user who initialized it', async () => {
        const sessionId = randomUUID();
        await model.saveSessionClientInfo({
            sessionId,
            userUuid,
            organizationUuid,
            clientName: 'claude-ai',
            clientVersion: '1.0',
        });

        await expect(
            model.findSessionClientInfo(sessionId, userUuid, organizationUuid),
        ).resolves.toMatchObject({
            client_name: 'claude-ai',
            client_version: '1.0',
        });
        await expect(
            model.findSessionClientInfo(
                sessionId,
                otherUserUuid,
                organizationUuid,
            ),
        ).resolves.toBeUndefined();
    });

    test('a repeated session id keeps the first client', async () => {
        const sessionId = randomUUID();
        const save = (clientName: string, owner: string) =>
            model.saveSessionClientInfo({
                sessionId,
                userUuid: owner,
                organizationUuid,
                clientName,
                clientVersion: null,
            });
        await save('claude-ai', userUuid);
        await save('claude-code', otherUserUuid);

        await expect(
            model.findSessionClientInfo(sessionId, userUuid, organizationUuid),
        ).resolves.toMatchObject({ client_name: 'claude-ai' });
    });
});
