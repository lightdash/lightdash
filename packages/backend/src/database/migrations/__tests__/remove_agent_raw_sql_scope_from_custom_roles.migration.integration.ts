import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import {
    down,
    up,
} from '../20261011000002_remove_agent_raw_sql_scope_from_custom_roles';

let migrated: MigratedDatabase;
beforeAll(async () => {
    migrated = await createMigratedDatabase();
});
afterAll(async () => {
    await migrated?.destroy();
});

test('removes every custom role Raw SQL grant and preserves all other rows and grant metadata', async () => {
    await migrated.database.transaction(async (trx) => {
        const organizations = await trx('organizations')
            .insert([
                { organization_name: 'Raw SQL cleanup one' },
                { organization_name: 'Raw SQL cleanup two' },
            ])
            .returning('organization_uuid');
        const [user] = await trx('users')
            .insert({ first_name: 'Scope', last_name: 'Admin' } as never)
            .returning('user_uuid');
        const levels = ['project', 'organization'] as const;
        const roles = await trx('roles')
            .insert(
                organizations.flatMap((org) =>
                    levels.map((level) => ({
                        organization_uuid: org.organization_uuid,
                        name: `${level} agent role`,
                        description: null,
                        level,
                        created_by: user.user_uuid,
                    })),
                ),
            )
            .returning('role_uuid');
        const [rawSqlOnlyRole] = await trx('roles')
            .insert({
                organization_uuid: organizations[0].organization_uuid,
                name: 'Raw SQL only',
                description: null,
                level: 'project',
                created_by: user.user_uuid,
            })
            .returning('*');
        const systemRoleResult = await trx.raw<{
            rows: { role_uuid: string }[];
        }>(
            `INSERT INTO roles (name, description, level, organization_uuid, created_by, owner_type)
             VALUES (?, NULL, 'project', NULL, ?, 'system')
             RETURNING role_uuid`,
            ['System role fixture', user.user_uuid],
        );
        const systemRoleUuid = systemRoleResult.rows[0].role_uuid;
        const scopes = [
            'view:AgentRawSql',
            'view:AgentReadDiscover',
            'view:AgentQuery',
            'view:AgentExport',
            'view:Dashboard',
        ];
        const grants = [
            ...roles.flatMap((role) =>
                scopes.map((scope, index) => ({
                    role_uuid: role.role_uuid,
                    scope_name: scope,
                    granted_by: user.user_uuid,
                    granted_at: new Date(Date.UTC(2026, 0, index + 1)),
                })),
            ),
            ...[rawSqlOnlyRole.role_uuid, systemRoleUuid].map((roleUuid) => ({
                role_uuid: roleUuid,
                scope_name: 'view:AgentRawSql',
                granted_by: user.user_uuid,
                granted_at: new Date('2026-02-01T00:00:00Z'),
            })),
        ];
        await trx('scoped_roles').insert(grants);
        const readGrants = () =>
            trx('scoped_roles')
                .select('*')
                .orderBy(['role_uuid', 'scope_name']);
        const before = await readGrants();
        const userRoles = await trx('roles')
            .where('owner_type', 'user')
            .select('role_uuid');
        const userRoleUuids = new Set(userRoles.map((role) => role.role_uuid));
        const expected = before.filter(
            (row) =>
                row.scope_name !== 'view:AgentRawSql' ||
                !userRoleUuids.has(row.role_uuid),
        );

        await up(trx);

        expect(
            await trx('scoped_roles as sr')
                .join('roles as r', 'r.role_uuid', 'sr.role_uuid')
                .where('r.owner_type', 'user')
                .where('sr.scope_name', 'view:AgentRawSql')
                .select('sr.*'),
        ).toEqual([]);
        expect(await readGrants()).toEqual(expected);
        expect(
            await trx('scoped_roles').where(
                'role_uuid',
                rawSqlOnlyRole.role_uuid,
            ),
        ).toEqual([]);
        expect(
            await trx('roles')
                .where('role_uuid', rawSqlOnlyRole.role_uuid)
                .first(),
        ).toEqual(rawSqlOnlyRole);
        expect(
            await trx('scoped_roles').where('role_uuid', systemRoleUuid),
        ).toEqual(before.filter((row) => row.role_uuid === systemRoleUuid));

        await up(trx);

        expect(await readGrants()).toEqual(expected);
    });
});

test('refuses to restore removed grants', async () => {
    await expect(down()).rejects.toThrow(/^irreversible:/);
});
