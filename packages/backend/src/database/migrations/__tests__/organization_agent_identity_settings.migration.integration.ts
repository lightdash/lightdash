import { randomUUID } from 'node:crypto';
import { OrganizationAgentIdentitySettingsModel } from '../../../models/OrganizationAgentIdentitySettingsModel';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import {
    down,
    up,
} from '../20261007165605_add_organization_agent_identity_settings';

let migrated: MigratedDatabase;
beforeAll(async () => {
    migrated = await createMigratedDatabase();
});
afterAll(async () => {
    await migrated?.destroy();
});

test('defaults to false, updates one row, and cascades organization deletion', async () => {
    const { database } = migrated;
    await database.transaction(async (trx) => {
        const [org] = await trx('organizations')
            .insert({ organization_name: 'Agent identity test' })
            .returning('organization_uuid');
        const model = new OrganizationAgentIdentitySettingsModel({
            database: trx,
        });
        expect(await model.get(org.organization_uuid)).toEqual({
            requireVerifiedAgentSessions: false,
        });
        const [row] = await trx('organization_agent_identity_settings')
            .insert({ organization_uuid: org.organization_uuid })
            .returning('*');
        expect(row.require_verified_agent_sessions).toBe(false);
        expect(row.created_at).toBeInstanceOf(Date);
        expect(row.updated_at).toBeInstanceOf(Date);
        await model.upsert(org.organization_uuid, {
            requireVerifiedAgentSessions: true,
        });
        expect(await model.get(org.organization_uuid)).toEqual({
            requireVerifiedAgentSessions: true,
        });
        await model.upsert(org.organization_uuid, {
            requireVerifiedAgentSessions: false,
        });
        expect(await model.get(org.organization_uuid)).toEqual({
            requireVerifiedAgentSessions: false,
        });
        expect(
            await trx('organization_agent_identity_settings').where(
                'organization_uuid',
                org.organization_uuid,
            ),
        ).toHaveLength(1);
        await trx('organizations')
            .where('organization_uuid', org.organization_uuid)
            .delete();
        expect(
            await trx('organization_agent_identity_settings').where(
                'organization_uuid',
                org.organization_uuid,
            ),
        ).toHaveLength(0);
    });
});

test('rejects settings for a missing organization', async () => {
    await expect(
        migrated
            .database('organization_agent_identity_settings')
            .insert({ organization_uuid: randomUUID() }),
    ).rejects.toMatchObject({ code: '23503' });
});

test('reverses and reapplies the additive migration', async () => {
    await migrated.database.transaction(async (trx) => {
        await down(trx);
        expect(
            await trx.schema.hasTable('organization_agent_identity_settings'),
        ).toBe(false);
        await up(trx);
        expect(
            await trx.schema.hasTable('organization_agent_identity_settings'),
        ).toBe(true);
    });
});
