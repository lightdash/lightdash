import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import {
    down,
    up,
} from '../20261125140000_remove_agent_capability_role_scopes';

let migrated: MigratedDatabase;
beforeAll(async () => {
    migrated = await createMigratedDatabase();
});
afterAll(async () => {
    await migrated?.destroy();
});

test('deletes agent capability scopes from custom roles and keeps every other scope', async () => {
    await migrated.database.transaction(async (trx) => {
        const [org] = await trx('organizations')
            .insert({ organization_name: 'Agent scope removal' })
            .returning('organization_uuid');
        const [user] = await trx('users')
            .insert({ first_name: 'Role', last_name: 'Admin' } as never)
            .returning('user_uuid');
        const [role] = await trx('roles')
            .insert({
                organization_uuid: org.organization_uuid,
                name: 'Custom',
                description: null,
                level: 'project' as const,
                created_by: user.user_uuid,
            })
            .returning('role_uuid');
        await trx('scoped_roles').insert(
            ['view:AgentRawSql', 'view:Dashboard'].map((scope_name) => ({
                role_uuid: role.role_uuid,
                scope_name,
                granted_by: user.user_uuid,
            })),
        );

        await up(trx);

        const rows = await trx('scoped_roles').where(
            'role_uuid',
            role.role_uuid,
        );
        expect(rows.map((row) => row.scope_name)).toEqual(['view:Dashboard']);
    });
});

test('cannot be reversed', async () => {
    await expect(down()).rejects.toThrow(/^irreversible:/);
});
