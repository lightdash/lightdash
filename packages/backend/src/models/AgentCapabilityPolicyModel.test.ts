import {
    AgentCapability,
    OrganizationMemberRole,
    ParameterError,
} from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient } from 'knex-mock-client';
import { AgentCapabilityPolicyModel } from './AgentCapabilityPolicyModel';

const database = knex({ client: MockClient, dialect: 'pg' });
const tracker = getTracker();
const model = new AgentCapabilityPolicyModel({ database });
const emptyMatrix = Object.fromEntries(
    Object.values(OrganizationMemberRole).map((role) => [role, []]),
);

beforeEach(() => tracker.reset());
afterAll(async () => database.destroy());

test('defaults a missing policy to legacy without granting capabilities', async () => {
    tracker.on.select('organization_agent_capability_policies').response([]);
    expect(await model.get('org')).toEqual({
        mode: 'legacy',
        version: 0,
        allowedUserUuids: null,
        allowedGroupUuids: null,
        allowedProjectUuids: null,
        systemRoleMatrix: emptyMatrix,
    });
    expect(tracker.history.select[0].bindings).toContain('org');
});

test.each([null, [], ['project']])(
    'preserves project limit %j and role grants',
    async (allowedProjectUuids) => {
        tracker.on.select('organization_agent_capability_policies').response([
            {
                mode: 'managed',
                version: 3,
                allowed_project_uuids: allowedProjectUuids,
                system_role: OrganizationMemberRole.VIEWER,
                capability: AgentCapability.Query,
            },
            {
                mode: 'managed',
                version: 3,
                allowed_project_uuids: allowedProjectUuids,
                system_role: OrganizationMemberRole.ADMIN,
                capability: AgentCapability.RawSql,
            },
        ]);
        expect(await model.get('org')).toEqual({
            mode: 'managed',
            version: 3,
            allowedUserUuids: null,
            allowedGroupUuids: null,
            allowedProjectUuids,
            systemRoleMatrix: {
                ...emptyMatrix,
                viewer: [AgentCapability.Query],
                admin: [AgentCapability.RawSql],
            },
        });
        expect(tracker.history.select).toHaveLength(1);
    },
);

test('increments the stored version and replaces all matrix rows in the same transaction', async () => {
    tracker.on.insert('organization_agent_capability_policies').response([
        {
            mode: 'managed',
            version: 4,
            allowed_user_uuids: null,
            allowed_group_uuids: null,
            allowed_project_uuids: ['project'],
        },
    ]);
    tracker.on
        .delete('organization_agent_system_role_capabilities')
        .response(2);
    tracker.on
        .insert('organization_agent_system_role_capabilities')
        .response([]);
    const matrix = {
        member: [],
        viewer: [AgentCapability.Query],
        interactive_viewer: [],
        editor: [],
        developer: [],
        admin: [],
    };
    expect(
        await model.save({
            organizationUuid: 'org',
            mode: 'managed',
            version: 3,
            allowedUserUuids: null,
            allowedGroupUuids: null,
            allowedProjectUuids: ['project'],
            systemRoleMatrix: matrix,
            updatedByUserUuid: 'user',
        }),
    ).toEqual({
        mode: 'managed',
        version: 4,
        allowedUserUuids: null,
        allowedGroupUuids: null,
        allowedProjectUuids: ['project'],
        systemRoleMatrix: matrix,
    });
    expect(tracker.history.insert[0].sql).toContain(
        'on conflict ("organization_uuid") do update',
    );
    expect(tracker.history.insert[0].sql).toContain('"version" + 1');
    expect(tracker.history.insert[0].bindings).toContain('user');
    expect(tracker.history.delete[0].bindings).toEqual(['org']);
    expect(tracker.history.insert[1].bindings).toEqual([
        AgentCapability.Query,
        'org',
        'viewer',
    ]);
});

test('clears grants when saving an empty matrix', async () => {
    tracker.on
        .insert('organization_agent_capability_policies')
        .response([
            { mode: 'managed', version: 5, allowed_project_uuids: null },
        ]);
    tracker.on
        .delete('organization_agent_system_role_capabilities')
        .response(1);
    await model.save({
        organizationUuid: 'org',
        mode: 'managed',
        allowedUserUuids: null,
        allowedGroupUuids: null,
        allowedProjectUuids: null,
        systemRoleMatrix: {
            member: [],
            viewer: [],
            interactive_viewer: [],
            editor: [],
            developer: [],
            admin: [],
        },
        updatedByUserUuid: null,
    });
    expect(tracker.history.insert).toHaveLength(1);
    expect(tracker.history.delete).toHaveLength(1);
});

const saveUsers = (allowedUserUuids: string[] | null) =>
    model.save({
        organizationUuid: 'org',
        allowedGroupUuids: null,
        mode: 'managed',
        allowedProjectUuids: null,
        allowedUserUuids,
        systemRoleMatrix: {
            member: [],
            viewer: [],
            interactive_viewer: [],
            editor: [],
            developer: [],
            admin: [],
        },
        updatedByUserUuid: null,
    });

test.each([null, [], ['member'], ['member', 'member']])(
    'saves user admission %j',
    async (allowedUserUuids) => {
        tracker.on
            .select('organization_memberships')
            .response([{ user_uuid: 'member' }]);
        tracker.on.insert('organization_agent_capability_policies').response([
            {
                mode: 'managed',
                version: 1,
                allowed_project_uuids: null,
                allowed_user_uuids: allowedUserUuids,
            },
        ]);
        tracker.on
            .delete('organization_agent_system_role_capabilities')
            .response(0);
        expect(await saveUsers(allowedUserUuids)).toMatchObject({
            allowedUserUuids,
        });
        expect(tracker.history.insert[0].bindings).toContainEqual(
            allowedUserUuids,
        );
        if (allowedUserUuids?.length) {
            expect(tracker.history.select[0].bindings).toContain('org');
            expect(tracker.history.select[0].sql).toContain(
                '"organizations"."organization_uuid"',
            );
        }
    },
);

test('rejects a non-member before changing the policy', async () => {
    tracker.on
        .select('organization_memberships')
        .response([{ user_uuid: 'member' }]);
    await expect(saveUsers(['member', 'outsider'])).rejects.toBeInstanceOf(
        ParameterError,
    );
    expect(tracker.history.insert).toHaveLength(0);
    expect(tracker.history.delete).toHaveLength(0);
});

test.each([null, [], ['member']])(
    'reads user admission %j',
    async (allowedUserUuids) => {
        tracker.on.select('organization_agent_capability_policies').response([
            {
                mode: 'managed',
                version: 1,
                allowed_project_uuids: null,
                allowed_user_uuids: allowedUserUuids,
            },
        ]);
        tracker.on
            .select('organization_memberships')
            .response([{ user_uuid: 'member' }]);
        expect(await model.get('org')).toMatchObject({ allowedUserUuids });
    },
);

test.each([{ members: [] }, { members: [{ user_uuid: 'member' }] }])(
    'filters departed members on read without widening admission: %j',
    async ({ members }) => {
        tracker.on.select('organization_agent_capability_policies').response([
            {
                mode: 'managed',
                version: 1,
                allowed_user_uuids: ['member', 'departed'],
            },
        ]);
        tracker.on.select('organization_memberships').response(members);
        expect((await model.get('org')).allowedUserUuids).toEqual(
            members.map((member) => member.user_uuid),
        );
    },
);

test('does not revalidate a stored member list when resetting to legacy', async () => {
    tracker.on
        .insert('organization_agent_capability_policies')
        .response([{ mode: 'legacy', version: 2 }]);
    tracker.on
        .delete('organization_agent_system_role_capabilities')
        .response(0);
    tracker.on
        .select('organization_agent_capability_policies')
        .response([{ mode: 'legacy', version: 2 }]);
    await model.save({
        organizationUuid: 'org',
        allowedGroupUuids: null,
        mode: 'legacy',
        allowedUserUuids: ['departed'],
        allowedProjectUuids: null,
        systemRoleMatrix: {
            member: [],
            viewer: [],
            interactive_viewer: [],
            editor: [],
            developer: [],
            admin: [],
        },
        updatedByUserUuid: null,
    });
    expect(tracker.history.select).toHaveLength(1);
    expect(tracker.history.select[0].sql).not.toContain(
        'organization_memberships',
    );
});

test.each([{ rows: [] }, { rows: [{ version: 1 }] }])(
    'rejects stale versions before replacing the matrix: %j',
    async ({ rows }) => {
        tracker.on
            .insert('organization_agent_capability_policies')
            .response(rows);
        await expect(
            model.save({
                organizationUuid: 'org',
                mode: 'managed',
                version: 3,
                allowedUserUuids: null,
                allowedGroupUuids: null,
                allowedProjectUuids: null,
                systemRoleMatrix: {
                    member: [],
                    viewer: [],
                    interactive_viewer: [],
                    editor: [],
                    developer: [],
                    admin: [],
                },
                updatedByUserUuid: null,
            }),
        ).rejects.toThrow(
            'Agent permissions changed. Reload the latest permissions before saving.',
        );
        expect(tracker.history.insert[0].sql).toContain(
            'where "organization_agent_capability_policies"."version" =',
        );
        expect(tracker.history.insert[0].bindings.at(-1)).toBe(3);
        expect(tracker.history.delete).toHaveLength(0);
    },
);

test('an omitted people list keeps the stored column out of the update', async () => {
    tracker.on.insert('organization_agent_capability_policies').response([
        {
            mode: 'managed',
            version: 2,
            allowed_project_uuids: null,
            allowed_user_uuids: ['member'],
        },
    ]);
    tracker.on
        .delete('organization_agent_system_role_capabilities')
        .response(0);
    await model.save({
        organizationUuid: 'org',
        allowedGroupUuids: null,
        mode: 'managed',
        allowedProjectUuids: null,
        systemRoleMatrix: emptyMatrix as never,
        updatedByUserUuid: 'admin',
    });
    const { sql } = tracker.history.insert[0];
    expect(sql).toContain('do update set');
    const update = sql.slice(sql.indexOf('do update set'));
    expect(update).toContain('allowed_project_uuids');
    expect(update).not.toContain('allowed_user_uuids');
    expect(tracker.history.select).toHaveLength(0);
});

const saveGroups = (allowedGroupUuids?: string[] | null) =>
    model.save({
        organizationUuid: 'org',
        mode: 'managed',
        allowedProjectUuids: null,
        allowedGroupUuids,
        systemRoleMatrix: emptyMatrix as never,
        updatedByUserUuid: null,
    });

test.each([null, ['group']])(
    'saves group admission %j',
    async (allowedGroupUuids) => {
        tracker.on.select('groups').response([{ group_uuid: 'group' }]);
        tracker.on.insert('organization_agent_capability_policies').response([
            {
                mode: 'managed',
                version: 1,
                allowed_group_uuids: allowedGroupUuids,
            },
        ]);
        tracker.on
            .delete('organization_agent_system_role_capabilities')
            .response(0);
        expect(await saveGroups(allowedGroupUuids)).toMatchObject({
            allowedGroupUuids,
        });
        expect(tracker.history.insert[0].bindings).toContainEqual(
            allowedGroupUuids,
        );
        if (allowedGroupUuids) {
            expect(tracker.history.select[0].bindings).toEqual([
                'org',
                'group',
            ]);
            expect(tracker.history.select[0].sql).toContain(
                '"organizations"."organization_uuid"',
            );
        } else expect(tracker.history.select).toHaveLength(0);
    },
);

test.each([null, [], ['group']])(
    'reads group admission %j',
    async (allowedGroupUuids) => {
        tracker.on.select('organization_agent_capability_policies').response([
            {
                mode: 'legacy',
                version: 1,
                allowed_group_uuids: allowedGroupUuids,
            },
        ]);
        tracker.on.select('groups').response([{ group_uuid: 'group' }]);
        expect(await model.get('org')).toMatchObject({ allowedGroupUuids });
    },
);

test.each([{ groups: [] }, { groups: [{ group_uuid: 'group' }] }])(
    'filters deleted groups without widening admission: %j',
    async ({ groups }) => {
        tracker.on.select('organization_agent_capability_policies').response([
            {
                mode: 'legacy',
                version: 1,
                allowed_group_uuids: ['group', 'deleted'],
            },
        ]);
        tracker.on.select('groups').response(groups);
        expect((await model.get('org')).allowedGroupUuids).toEqual(
            groups.map((group) => group.group_uuid),
        );
    },
);

test('rejects groups outside the organization', async () => {
    tracker.on.select('groups').response([{ group_uuid: 'group' }]);
    await expect(saveGroups(['group', 'outsider'])).rejects.toBeInstanceOf(
        ParameterError,
    );
    expect(tracker.history.insert).toHaveLength(0);
});

test('rejects an explicit empty group list', async () => {
    await expect(saveGroups([])).rejects.toThrow(
        'Choose at least one group, or allow everyone.',
    );
    expect(tracker.history.insert).toHaveLength(0);
});

test.each([{ stored: [] }, { stored: ['deleted'] }])(
    'omitting groups preserves the exact stored value %j',
    async ({ stored: allowedGroupUuids }) => {
        tracker.on.insert('organization_agent_capability_policies').response([
            {
                mode: 'managed',
                version: 2,
                allowed_group_uuids: allowedGroupUuids,
            },
        ]);
        tracker.on
            .delete('organization_agent_system_role_capabilities')
            .response(0);
        expect(await saveGroups()).toMatchObject({ allowedGroupUuids });
        const { sql } = tracker.history.insert[0];
        expect(sql.slice(sql.indexOf('do update set'))).not.toContain(
            'allowed_group_uuids',
        );
        expect(tracker.history.select).toHaveLength(0);
    },
);

test('legacy saves preserve the stored matrix, project list and people list', async () => {
    tracker.on.select('organization_agent_capability_policies').response([
        {
            mode: 'legacy',
            version: 3,
            allowed_project_uuids: ['stored-project'],
            allowed_user_uuids: ['stored-user'],
            allowed_group_uuids: ['group'],
            system_role: OrganizationMemberRole.VIEWER,
            capability: AgentCapability.Query,
        },
    ]);
    tracker.on
        .select('organization_memberships')
        .response([{ user_uuid: 'stored-user' }]);
    tracker.on.select('groups').response([{ group_uuid: 'group' }]);
    tracker.on.insert('organization_agent_capability_policies').response([
        {
            mode: 'legacy',
            version: 3,
            allowed_project_uuids: ['stored-project'],
            allowed_user_uuids: ['stored-user'],
            allowed_group_uuids: ['group'],
        },
    ]);
    const saved = await model.save({
        organizationUuid: 'org',
        mode: 'legacy',
        allowedProjectUuids: [],
        allowedUserUuids: [],
        allowedGroupUuids: ['group'],
        systemRoleMatrix: emptyMatrix as never,
        updatedByUserUuid: null,
    });
    expect(saved).toMatchObject({
        mode: 'legacy',
        allowedProjectUuids: ['stored-project'],
        allowedUserUuids: ['stored-user'],
        allowedGroupUuids: ['group'],
        systemRoleMatrix: { ...emptyMatrix, viewer: [AgentCapability.Query] },
    });
    const { sql } = tracker.history.insert[0];
    const update = sql.slice(sql.indexOf('do update set'));
    expect(update).not.toContain('allowed_project_uuids');
    expect(update).not.toContain('allowed_user_uuids');
    expect(tracker.history.delete).toHaveLength(0);
});

describe('getForEnforcement', () => {
    test('defaults a missing policy without another SELECT', async () => {
        tracker.on
            .select('organization_agent_capability_policies')
            .response([]);
        expect(await model.getForEnforcement('org')).toEqual({
            mode: 'legacy',
            version: 0,
            allowedProjectUuids: null,
            allowedUserUuids: null,
            storedAllowedGroupUuids: null,
            hasExistingAllowedGroup: null,
            systemRoleMatrix: emptyMatrix,
        });
        expect(tracker.history.select).toHaveLength(1);
    });

    test.each([
        { stored: null, exists: null },
        { stored: [], exists: false },
        { stored: ['deleted'], exists: false },
        { stored: ['foreign'], exists: false },
        { stored: ['live', 'deleted'], exists: true },
    ])(
        'reads $stored with existence $exists in one statement',
        async ({ stored, exists }) => {
            tracker.on
                .select('organization_agent_capability_policies')
                .response([
                    {
                        mode: 'managed',
                        version: 4,
                        allowed_project_uuids: ['project'],
                        allowed_user_uuids: null,
                        allowed_group_uuids: stored,
                        has_existing_allowed_group: exists,
                        system_role: 'viewer',
                        capability: AgentCapability.Query,
                    },
                ]);
            expect(await model.getForEnforcement('org')).toEqual({
                mode: 'managed',
                version: 4,
                allowedProjectUuids: ['project'],
                allowedUserUuids: null,
                storedAllowedGroupUuids: stored,
                hasExistingAllowedGroup: exists,
                systemRoleMatrix: {
                    ...emptyMatrix,
                    viewer: [AgentCapability.Query],
                },
            });
            expect(tracker.history.select).toHaveLength(1);
            const [query] = tracker.history.select;
            expect(query.sql).toMatch(
                /case when .*allowed_group_uuids.* is null then null else exists/i,
            );
            expect(query.sql).toContain('has_existing_allowed_group');
            expect(query.sql).toContain('"groups"');
            expect(query.sql).toContain('"organizations"');
            expect(query.sql).toMatch(
                /organization_uuid.*=.*organization_uuid/,
            );
            expect(query.sql).toMatch(/group_uuid.*= ANY/i);
            expect(query.bindings).toEqual(['org']);
        },
    );

    test.each([
        { storedUsers: null },
        { storedUsers: [] },
        { storedUsers: ['departed', 'member', 'member'] },
    ])('only hydrates non-empty people lists: %j', async ({ storedUsers }) => {
        tracker.on.select('organization_agent_capability_policies').response([
            {
                mode: 'legacy',
                version: 1,
                allowed_user_uuids: storedUsers,
                allowed_group_uuids: ['live'],
                has_existing_allowed_group: true,
            },
        ]);
        if (storedUsers?.length)
            tracker.on
                .select('organization_memberships')
                .response([{ user_uuid: 'member' }]);
        const policy = await model.getForEnforcement('org');
        expect(policy.allowedUserUuids).toEqual(
            storedUsers === null
                ? null
                : storedUsers.filter((uuid) => uuid === 'member'),
        );
        expect(tracker.history.select).toHaveLength(
            storedUsers?.length ? 2 : 1,
        );
    });
});
