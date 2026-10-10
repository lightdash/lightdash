import { AgentCapability, OrganizationMemberRole } from '@lightdash/common';
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
    tracker.on
        .insert('organization_agent_capability_policies')
        .response([
            { mode: 'managed', version: 4, allowed_project_uuids: ['project'] },
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
            allowedProjectUuids: ['project'],
            systemRoleMatrix: matrix,
            updatedByUserUuid: 'user',
        }),
    ).toEqual({
        mode: 'managed',
        version: 4,
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
            { mode: 'legacy', version: 5, allowed_project_uuids: null },
        ]);
    tracker.on
        .delete('organization_agent_system_role_capabilities')
        .response(1);
    await model.save({
        organizationUuid: 'org',
        mode: 'legacy',
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
