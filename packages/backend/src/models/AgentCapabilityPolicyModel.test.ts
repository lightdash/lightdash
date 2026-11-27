import { AgentCapability, ParameterError } from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient } from 'knex-mock-client';
import { AgentCapabilityPolicyModel } from './AgentCapabilityPolicyModel';

const database = knex({ client: MockClient, dialect: 'pg' });
const tracker = getTracker();
const model = new AgentCapabilityPolicyModel({ database });
const roleTableQueries = () =>
    tracker.history.all.filter(({ sql }) =>
        sql.includes('organization_agent_system_role_capabilities'),
    );

beforeEach(() => tracker.reset());
afterAll(async () => database.destroy());

test('defaults a missing policy to no restrictions', async () => {
    tracker.on.select('organization_agent_capability_policies').response([]);
    expect(await model.get('org')).toEqual({
        version: 0,
        allowedCapabilities: null,
        allowedGroupUuids: null,
    });
    expect(tracker.history.select[0].bindings).toContain('org');
});

test.each([
    { allowedCapabilities: null, stored: 'managed' },
    { allowedCapabilities: [], stored: 'legacy' },
    { allowedCapabilities: [AgentCapability.Query], stored: 'managed' },
])(
    'reads capability limit $allowedCapabilities whatever the stored mode',
    async ({ allowedCapabilities, stored }) => {
        tracker.on.select('organization_agent_capability_policies').response([
            {
                mode: stored,
                version: 3,
                allowed_capabilities: allowedCapabilities,
            },
        ]);
        expect(await model.get('org')).toEqual({
            version: 3,
            allowedGroupUuids: null,
            allowedCapabilities,
        });
        expect(tracker.history.select).toHaveLength(1);
        expect(roleTableQueries()).toEqual([]);
    },
);

test('increments the stored version without writing role rows', async () => {
    const stored = [
        {
            mode: 'managed',
            version: 4,
            allowed_user_uuids: null,
            allowed_group_uuids: null,
            allowed_capabilities: [AgentCapability.Query],
        },
    ];
    tracker.on
        .insert('organization_agent_capability_policies')
        .response(stored);
    tracker.on
        .select('organization_agent_capability_policies')
        .response(stored);
    expect(
        await model.save({
            organizationUuid: 'org',
            version: 3,
            allowedGroupUuids: null,
            allowedCapabilities: [AgentCapability.Query],
            updatedByUserUuid: 'user',
        }),
    ).toEqual({
        version: 4,
        allowedGroupUuids: null,
        allowedCapabilities: [AgentCapability.Query],
    });
    expect(tracker.history.insert[0].sql).toContain(
        'on conflict ("organization_uuid") do update',
    );
    expect(tracker.history.insert[0].sql).toContain('"version" + 1');
    expect(tracker.history.insert[0].bindings).toContain('user');
    expect(tracker.history.insert[0].bindings).toContain('managed');
    expect(tracker.history.insert).toHaveLength(1);
    expect(tracker.history.delete).toHaveLength(0);
    expect(roleTableQueries()).toEqual([]);
});

test.each([{ rows: [] }, { rows: [{ version: 1 }] }])(
    'rejects stale versions: %j',
    async ({ rows }) => {
        tracker.on
            .insert('organization_agent_capability_policies')
            .response(rows);
        await expect(
            model.save({
                organizationUuid: 'org',
                version: 3,
                allowedGroupUuids: null,
                allowedCapabilities: Object.values(AgentCapability),
                updatedByUserUuid: null,
            }),
        ).rejects.toThrow(
            'Agent permissions changed. Reload the latest permissions before saving.',
        );
        expect(tracker.history.insert[0].sql).toContain(
            'where "organization_agent_capability_policies"."version" =',
        );
        expect(tracker.history.insert[0].bindings.at(-1)).toBe(3);
    },
);

test('omitted capabilities preserve the stored limit atomically', async () => {
    const stored = [
        {
            mode: 'managed',
            version: 2,
            allowed_capabilities: [AgentCapability.Query],
            allowed_group_uuids: null,
        },
    ];
    tracker.on
        .insert('organization_agent_capability_policies')
        .response(stored);
    tracker.on
        .select('organization_agent_capability_policies')
        .response(stored);
    const saved = await model.save({
        organizationUuid: 'org',
        updatedByUserUuid: null,
    });
    expect(saved.allowedCapabilities).toEqual([AgentCapability.Query]);
    const { sql } = tracker.history.insert[0];
    const update = sql.slice(sql.indexOf('do update set'));
    expect(update).not.toContain('"allowed_capabilities"');
    expect(update).not.toContain('"mode"');
    expect(update).toContain('allowed_user_uuids');
});

test('clearing the capability list stores an unrestricted policy', async () => {
    const stored = [
        {
            mode: 'legacy',
            version: 2,
            allowed_capabilities: null,
            allowed_group_uuids: null,
        },
    ];
    tracker.on
        .insert('organization_agent_capability_policies')
        .response(stored);
    tracker.on
        .select('organization_agent_capability_policies')
        .response(stored);
    const saved = await model.save({
        organizationUuid: 'org',
        allowedCapabilities: null,
        updatedByUserUuid: null,
    });
    expect(saved.allowedCapabilities).toBeNull();
    const { sql, bindings } = tracker.history.insert[0];
    expect(sql.slice(sql.indexOf('do update set'))).toContain('"mode"');
    expect(bindings).toContain('legacy');
    expect(bindings).not.toContain('managed');
});

const saveGroups = (allowedGroupUuids?: string[] | null) =>
    model.save({
        organizationUuid: 'org',
        allowedGroupUuids,
        updatedByUserUuid: null,
    });

test.each([null, ['group']])(
    'saves group admission %j',
    async (allowedGroupUuids) => {
        const stored = [
            {
                mode: 'legacy',
                version: 1,
                allowed_capabilities: null,
                allowed_group_uuids: allowedGroupUuids,
            },
        ];
        tracker.on
            .select('from "organization_agent_capability_policies"')
            .response(stored);
        tracker.on.select('groups').response([{ group_uuid: 'group' }]);
        tracker.on
            .insert('organization_agent_capability_policies')
            .response(stored);
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
        } else expect(tracker.history.select).toHaveLength(1);
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
    'omitting groups leaves the stored value %j untouched',
    async ({ stored: allowedGroupUuids }) => {
        const stored = [
            {
                mode: 'legacy',
                version: 2,
                allowed_capabilities: null,
                allowed_group_uuids: allowedGroupUuids,
            },
        ];
        tracker.on
            .select('from "organization_agent_capability_policies"')
            .response(stored);
        tracker.on.select('groups').response([]);
        tracker.on
            .insert('organization_agent_capability_policies')
            .response(stored);
        // Reads drop deleted groups; the stored value itself is not rewritten.
        expect(await saveGroups()).toMatchObject({ allowedGroupUuids: [] });
        const { sql } = tracker.history.insert[0];
        expect(sql.slice(sql.indexOf('do update set'))).not.toContain(
            'allowed_group_uuids',
        );
    },
);

describe('getForEnforcement', () => {
    test('defaults a missing policy without another SELECT', async () => {
        tracker.on
            .select('organization_agent_capability_policies')
            .response([]);
        expect(await model.getForEnforcement('org')).toEqual({
            version: 0,
            allowedCapabilities: null,
            storedAllowedGroupUuids: null,
            hasExistingAllowedGroup: null,
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
                        allowed_capabilities: [AgentCapability.Query],
                        allowed_user_uuids: null,
                        allowed_group_uuids: stored,
                        has_existing_allowed_group: exists,
                    },
                ]);
            expect(await model.getForEnforcement('org')).toEqual({
                version: 4,
                allowedCapabilities: [AgentCapability.Query],
                storedAllowedGroupUuids: stored,
                hasExistingAllowedGroup: exists,
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
            expect(roleTableQueries()).toEqual([]);
        },
    );

    test.each([null, [], ['departed']])(
        'ignores stored people and project lists: %j',
        async (storedUsers) => {
            tracker.on
                .select('organization_agent_capability_policies')
                .response([
                    {
                        mode: 'managed',
                        version: 1,
                        allowed_capabilities: null,
                        allowed_user_uuids: storedUsers,
                        allowed_project_uuids: ['excluded'],
                    },
                ]);
            const policies = await Promise.all([
                model.get('org'),
                model.getForEnforcement('org'),
            ]);
            for (const policy of policies) {
                expect(policy).not.toHaveProperty('allowedUserUuids');
                expect(policy).not.toHaveProperty('allowedProjectUuids');
            }
            expect(tracker.history.select).toHaveLength(2);
            for (const query of tracker.history.select) {
                expect(query.sql).not.toContain('allowed_user_uuids');
                expect(query.sql).not.toContain('allowed_project_uuids');
                expect(query.sql).not.toContain('.*');
            }
        },
    );
});
