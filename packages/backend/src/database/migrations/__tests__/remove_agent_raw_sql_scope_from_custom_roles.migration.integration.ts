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

test('removes custom role Raw SQL grants only when another scope remains and preserves all other rows and grant metadata', async () => {
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
        const [rawSqlAndDashboardRole, agentOnlyRole] = await trx('roles')
            .insert([
                {
                    organization_uuid: organizations[0].organization_uuid,
                    name: 'Raw SQL and dashboard',
                    description: null,
                    level: 'project',
                    created_by: user.user_uuid,
                },
                {
                    organization_uuid: organizations[0].organization_uuid,
                    name: 'Agent scopes only',
                    description: null,
                    level: 'project',
                    created_by: user.user_uuid,
                },
            ])
            .returning('role_uuid');
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
            ...[
                {
                    roleUuid: rawSqlAndDashboardRole.role_uuid,
                    scopeNames: ['view:AgentRawSql', 'view:Dashboard'],
                },
                {
                    roleUuid: agentOnlyRole.role_uuid,
                    scopeNames: [
                        'view:AgentRawSql',
                        'view:AgentReadDiscover',
                        'view:AgentQuery',
                        'view:AgentExport',
                    ],
                },
            ].flatMap(({ roleUuid, scopeNames }) =>
                scopeNames.map((scopeName, index) => ({
                    role_uuid: roleUuid,
                    scope_name: scopeName,
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
        const rolesLosingRawSql = new Set([
            ...roles.map((role) => role.role_uuid),
            rawSqlAndDashboardRole.role_uuid,
            agentOnlyRole.role_uuid,
        ]);
        const userRoleUuids = [...rolesLosingRawSql, rawSqlOnlyRole.role_uuid];
        const expected = before.filter(
            (row) =>
                row.scope_name !== 'view:AgentRawSql' ||
                !rolesLosingRawSql.has(row.role_uuid),
        );

        await up(trx);

        expect(
            await trx('roles as r')
                .leftJoin('scoped_roles as sr', 'sr.role_uuid', 'r.role_uuid')
                .where('r.owner_type', 'user')
                .whereIn('r.role_uuid', userRoleUuids)
                .groupBy('r.role_uuid')
                .havingRaw(
                    `COUNT(sr.scope_name) = 0
                     OR (BOOL_OR(sr.scope_name = 'view:AgentRawSql')
                         AND COUNT(sr.scope_name) <> 1)`,
                )
                .select('r.role_uuid'),
        ).toEqual([]);
        expect(await readGrants()).toEqual(expected);
        const rawSqlOnlyGrants = await trx('scoped_roles').where(
            'role_uuid',
            rawSqlOnlyRole.role_uuid,
        );
        expect(rawSqlOnlyGrants).toHaveLength(1);
        expect(rawSqlOnlyGrants).toEqual(
            before.filter((row) => row.role_uuid === rawSqlOnlyRole.role_uuid),
        );
        expect(
            await trx('scoped_roles')
                .where('role_uuid', rawSqlAndDashboardRole.role_uuid)
                .pluck('scope_name'),
        ).toEqual(['view:Dashboard']);
        expect(
            await trx('scoped_roles')
                .where('role_uuid', agentOnlyRole.role_uuid)
                .orderBy('scope_name')
                .pluck('scope_name'),
        ).toEqual([
            'view:AgentExport',
            'view:AgentQuery',
            'view:AgentReadDiscover',
        ]);
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

const withCommittedRole = async (
    name: string,
    run: (roleUuid: string) => Promise<void>,
) => {
    const { organizationUuid, userUuid, roleUuid } =
        await migrated.database.transaction(async (trx) => {
            const [organization] = await trx('organizations')
                .insert({ organization_name: name })
                .returning('organization_uuid');
            const [user] = await trx('users')
                .insert({ first_name: 'Scope', last_name: 'Admin' } as never)
                .returning('user_uuid');
            const [role] = await trx('roles')
                .insert({
                    organization_uuid: organization.organization_uuid,
                    name,
                    description: null,
                    level: 'project',
                    created_by: user.user_uuid,
                })
                .returning('role_uuid');
            await trx('scoped_roles').insert(
                ['view:AgentRawSql', 'view:Dashboard'].map((scopeName) => ({
                    role_uuid: role.role_uuid,
                    scope_name: scopeName,
                    granted_by: user.user_uuid,
                })),
            );
            return {
                organizationUuid: organization.organization_uuid,
                userUuid: user.user_uuid,
                roleUuid: role.role_uuid,
            };
        });
    try {
        await run(roleUuid);
    } finally {
        await migrated.database.transaction(async (trx) => {
            await trx('scoped_roles').where('role_uuid', roleUuid).delete();
            await trx('roles').where('role_uuid', roleUuid).delete();
            await trx('users').where('user_uuid', userUuid).delete();
            await trx('organizations')
                .where('organization_uuid', organizationUuid)
                .delete();
        });
    }
};

test('keeps Raw SQL when a pod deletes the other scope before the migration locks it', async () => {
    await withCommittedRole('Raw SQL pod deletes first', async (roleUuid) => {
        const pod = await migrated.database.transaction();
        try {
            await pod('scoped_roles')
                .where({ role_uuid: roleUuid, scope_name: 'view:Dashboard' })
                .delete();
            const migration = await migrated.database.transaction();
            try {
                const { rows } = await migration.raw<{
                    rows: { pid: number }[];
                }>('SELECT pg_backend_pid() AS pid');
                let finished = false;
                const running = up(migration).finally(() => {
                    finished = true;
                });
                void running.catch(() => {});
                try {
                    const deadline = Date.now() + 3000;
                    const waitForLock = async (): Promise<void> => {
                        if (Date.now() >= deadline || finished) {
                            throw new Error(
                                'The migration must block on the sibling scope within 3 seconds',
                            );
                        }
                        const activity = await migrated.database.raw<{
                            rows: { blocked: boolean }[];
                        }>(
                            `SELECT EXISTS (
                                SELECT 1 FROM pg_stat_activity
                                WHERE datname = current_database()
                                  AND pid = ?
                                  AND wait_event_type = 'Lock'
                            ) AS blocked`,
                            [rows[0].pid],
                        );
                        if (activity.rows[0].blocked) return;
                        await new Promise<void>((resolve) => {
                            setTimeout(resolve, 50);
                        });
                        return waitForLock();
                    };
                    await waitForLock();
                    expect(finished).toBe(false);
                    await pod.commit();
                    await running;
                    await migration.commit();
                    expect(
                        await migrated
                            .database('scoped_roles')
                            .where('role_uuid', roleUuid)
                            .pluck('scope_name'),
                    ).toEqual(['view:AgentRawSql']);
                } finally {
                    if (!pod.isCompleted()) await pod.rollback();
                    await running.catch(() => {});
                }
            } finally {
                if (!migration.isCompleted()) await migration.rollback();
            }
        } finally {
            if (!pod.isCompleted()) await pod.rollback();
        }
    });
});

test('holds the other scope against a pod delete until the migration commits', async () => {
    await withCommittedRole(
        'Raw SQL migration locks first',
        async (roleUuid) => {
            const migration = await migrated.database.transaction();
            try {
                await up(migration);
                const pod = await migrated.database.transaction();
                try {
                    await pod.raw("SET LOCAL lock_timeout = '500ms'");
                    await expect(
                        pod('scoped_roles')
                            .where({
                                role_uuid: roleUuid,
                                scope_name: 'view:Dashboard',
                            })
                            .delete(),
                    ).rejects.toMatchObject({ code: '55P03' });
                } finally {
                    await pod.rollback();
                }
                await migration.commit();
                expect(
                    await migrated
                        .database('scoped_roles')
                        .where('role_uuid', roleUuid)
                        .pluck('scope_name'),
                ).toEqual(['view:Dashboard']);
            } finally {
                if (!migration.isCompleted()) await migration.rollback();
            }
        },
    );
});
