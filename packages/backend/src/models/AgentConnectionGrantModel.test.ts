import {
    AgentCapability,
    ParameterError,
    type AgentConnectionGrantCreate,
} from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient } from 'knex-mock-client';
import { type DbAgentConnectionGrant } from '../database/entities/agentConnectionGrants';
import { AgentConnectionGrantModel } from './AgentConnectionGrantModel';

let database: ReturnType<typeof knex>;
let tracker: ReturnType<typeof getTracker>;
let model: AgentConnectionGrantModel;
const now = new Date('2026-10-10T12:00:00Z');
const input: AgentConnectionGrantCreate = {
    organizationUuid: 'org',
    subjectUserUuid: 'subject',
    clientId: 'lightdash-cli',
    name: 'cli-dev',
    resource: 'https://server.example',
    approvedCapabilities: [AgentCapability.ReadDiscover, AgentCapability.Query],
    approvedProjectUuids: ['project'],
    resourceConstraints: { version: 1 },
    approvalPolicyVersion: null,
    approvedByUserUuid: 'subject',
    approvalRequestUuid: null,
    expiresAt: new Date(now.getTime() + 86400000),
};
const row: DbAgentConnectionGrant = {
    agent_connection_grant_uuid: 'grant',
    organization_uuid: input.organizationUuid,
    subject_user_uuid: input.subjectUserUuid,
    client_id: input.clientId,
    credential_kind: 'oauth',
    actor_kind: 'agent',
    name: input.name,
    resource: input.resource,
    refresh_family_uuid: null,
    approved_capabilities: input.approvedCapabilities,
    approved_project_uuids: input.approvedProjectUuids,
    resource_constraints: input.resourceConstraints,
    grant_contract_version: 1,
    grant_revision: 1,
    approval_policy_version: null,
    approved_by_user_uuid: 'subject',
    approval_method: 'browser_consent',
    approved_at: now,
    approval_request_uuid: null,
    expires_at: input.expiresAt,
    revoked_at: null,
    revoked_by_user_uuid: null,
    revocation_reason: null,
    replaced_by_grant_uuid: null,
    created_at: now,
    last_used_at: null,
};

beforeEach(() => {
    database = knex({ client: MockClient, dialect: 'pg' });
    tracker = getTracker();
    model = new AgentConnectionGrantModel({ database });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
});
afterEach(async () => {
    vi.useRealTimers();
    await database.destroy();
});

const mockCreate = () => {
    tracker.on.select('projects').response([{ project_uuid: 'project' }]);
    tracker.on.insert('agent_connection_grants').response([row]);
};

const mockRevoke = () => {
    tracker.on
        .update('agent_connection_grants')
        .response([{ ...row, revoked_at: now }]);
    tracker.on.delete('oauth2_access_tokens').response(1);
    tracker.on.delete('oauth2_authorization_codes').response(1);
    tracker.on.update('oauth2_refresh_tokens').response(1);
};

test.each(['unknown', 'toString'])(
    'rejects unknown capability %s before inserting',
    async (capability) => {
        await expect(
            model.create({
                ...input,
                approvedCapabilities: [capability as AgentCapability],
            }),
        ).rejects.toBeInstanceOf(ParameterError);
        expect(tracker.history.insert).toHaveLength(0);
    },
);

test('rejects an empty project list', async () => {
    await expect(
        model.create({ ...input, approvedProjectUuids: [] }),
    ).rejects.toBeInstanceOf(ParameterError);
    expect(tracker.history.insert).toHaveLength(0);
});

test('rejects projects missing from the bound organization', async () => {
    tracker.on.select('projects').response([{ project_uuid: 'project' }]);
    await expect(
        model.create({
            ...input,
            approvedProjectUuids: ['project', 'foreign-project'],
        }),
    ).rejects.toBeInstanceOf(ParameterError);
    expect(tracker.history.select).toHaveLength(1);
    expect(tracker.history.select[0].sql).toContain(
        '"organizations"."organization_uuid" =',
    );
    expect(tracker.history.select[0].bindings).toContain('org');
    expect(tracker.history.insert).toHaveLength(0);
});

test.each([
    new Date(now.getTime() - 1),
    now,
    new Date(now.getTime() + 7 * 86400000 + 1),
    new Date('invalid'),
])('rejects invalid expiry %s', async (expiresAt) => {
    await expect(model.create({ ...input, expiresAt })).rejects.toBeInstanceOf(
        ParameterError,
    );
    expect(tracker.history.insert).toHaveLength(0);
});

test('deduplicates capabilities and projects and accepts the maximum expiry', async () => {
    mockCreate();
    await model.create({
        ...input,
        approvedCapabilities: [AgentCapability.Query, AgentCapability.Query],
        approvedProjectUuids: ['project', 'project'],
        expiresAt: new Date(now.getTime() + 7 * 86400000),
    });
    expect(tracker.history.select).toHaveLength(1);
    expect(tracker.history.insert[0].bindings).toContainEqual([
        AgentCapability.Query,
    ]);
    expect(tracker.history.insert[0].bindings).toContainEqual(['project']);
});

test('returns the stored grant with explicit nulls and server-owned metadata', async () => {
    mockCreate();
    expect(await model.create(input)).toMatchObject({
        ...input,
        grantUuid: 'grant',
        credentialKind: 'oauth',
        actorKind: 'agent',
        refreshFamilyUuid: null,
        grantContractVersion: 1,
        grantRevision: 1,
        approvalMethod: 'browser_consent',
        approvedAt: now,
        revokedAt: null,
        revokedByUserUuid: null,
        revocationReason: null,
        replacedByGrantUuid: null,
        createdAt: now,
        lastUsedAt: null,
    });
});

test('returns null when the grant is missing', async () => {
    tracker.on.select('agent_connection_grants').response([]);
    expect(await model.find('missing')).toBeNull();
    expect(await model.findActive('missing', now)).toBeNull();
});

test.each([
    { revoked_at: now },
    { expires_at: now },
    { expires_at: new Date(now.getTime() - 1) },
])('returns no active grant for %j', async (override) => {
    tracker.on
        .select('agent_connection_grants')
        .response([{ ...row, ...override }]);
    expect(await model.findActive('grant', now)).toBeNull();
});

test('returns an active grant before its absolute expiry', async () => {
    tracker.on.select('agent_connection_grants').response([row]);
    expect(await model.findActive('grant', now)).toMatchObject({
        grantUuid: 'grant',
    });
});

test('lists only the subject and organization with status and newest first', async () => {
    tracker.on
        .select('agent_connection_grants')
        .response([
            row,
            { ...row, revoked_at: now, expires_at: now },
            { ...row, expires_at: now },
        ]);
    expect(
        (
            await model.listForSubject({
                organizationUuid: 'org',
                subjectUserUuid: 'subject',
            })
        ).map((grant) => grant.status),
    ).toEqual(['active', 'revoked', 'expired']);
    expect(tracker.history.select[0].bindings).toEqual(['org', 'subject']);
    expect(tracker.history.select[0].sql).toContain(
        'order by "created_at" desc',
    );
});

test('revokes only bound tokens and preserves the first revocation on repeat', async () => {
    mockRevoke();
    const revoke = {
        organizationUuid: 'org',
        grantUuid: 'grant',
        revokedByUserUuid: 'subject',
        reason: 'user_request',
    };
    await model.revoke(revoke);
    await model.revoke(revoke);
    expect(tracker.history.update).toHaveLength(4);
    const grantUpdates = tracker.history.update.filter((query) =>
        query.sql.includes('"agent_connection_grants"'),
    );
    grantUpdates.forEach((query) => {
        expect(query.sql).toContain('coalesce');
        expect(query.sql).toContain('"organization_uuid" =');
        expect(query.bindings).toContain('org');
    });
    tracker.history.delete.forEach((query) => {
        expect(query.sql).toContain('where "agent_connection_grant_uuid" =');
        expect(query.bindings).toEqual(['grant']);
    });
    expect(
        tracker.history.delete.filter((query) =>
            query.sql.includes('oauth2_access_tokens'),
        ),
    ).toHaveLength(0);
    expect(
        tracker.history.delete.filter((query) =>
            query.sql.includes('oauth2_authorization_codes'),
        ),
    ).toHaveLength(2);
    tracker.history.update
        .filter((query) => query.sql.includes('oauth2_refresh_tokens'))
        .forEach((query) => {
            expect(query.sql).toContain('coalesce(revoked_at, now())');
            expect(query.sql).toContain(
                'where "agent_connection_grant_uuid" =',
            );
            expect(query.bindings).toEqual(['grant']);
        });
});

test('also revokes every token in the bound refresh family', async () => {
    tracker.on
        .update('agent_connection_grants')
        .response([{ ...row, revoked_at: now, refresh_family_uuid: 'family' }]);
    tracker.on.delete('oauth2_access_tokens').response(1);
    tracker.on.delete('oauth2_authorization_codes').response(1);
    tracker.on.update('oauth2_refresh_tokens').response(1);
    await model.revoke({
        organizationUuid: 'org',
        grantUuid: 'grant',
        revokedByUserUuid: 'subject',
        reason: 'user_request',
    });
    const familyQueries = [
        ...tracker.history.update,
        ...tracker.history.delete,
    ].filter((query) => query.sql.includes('"family_uuid" ='));
    expect(familyQueries.map((query) => query.bindings)).toEqual([
        ['family'],
        ['family'],
    ]);
    expect(
        familyQueries.some((query) =>
            query.sql.includes('oauth2_refresh_tokens'),
        ),
    ).toBe(true);
    expect(
        familyQueries.some((query) =>
            query.sql.includes('oauth2_access_tokens'),
        ),
    ).toBe(true);
    expect(
        familyQueries.find((query) =>
            query.sql.includes('oauth2_access_tokens'),
        )?.sql,
    ).toContain('"agent_connection_grant_uuid" is null');
});

test('does not revoke tokens when the grant is outside the organization', async () => {
    tracker.on.update('agent_connection_grants').response([]);
    await expect(
        model.revoke({
            organizationUuid: 'other-org',
            grantUuid: 'grant',
            revokedByUserUuid: 'subject',
            reason: 'user_request',
        }),
    ).rejects.toThrow();
    expect(tracker.history.delete).toHaveLength(0);
    expect(tracker.history.update).toHaveLength(1);
});

test.each([
    { subjectUserUuid: 'other' },
    { organizationUuid: 'other' },
    { clientId: 'other' },
])('rejects replacement with different ownership %j', async (override) => {
    tracker.on.select('agent_connection_grants').response([row]);
    await expect(
        model.replace({
            organizationUuid: 'org',
            oldGrantUuid: 'grant',
            newGrantInput: { ...input, ...override },
            actorUserUuid: 'subject',
        }),
    ).rejects.toBeInstanceOf(ParameterError);
    expect(tracker.history.insert).toHaveLength(0);
    expect(tracker.history.update).toHaveLength(0);
});

test('replaces the grant, revokes its tokens and links to the replacement', async () => {
    tracker.on.select('agent_connection_grants').response([row]);
    tracker.on.select('projects').response([{ project_uuid: 'project' }]);
    tracker.on
        .insert('agent_connection_grants')
        .response([{ ...row, agent_connection_grant_uuid: 'new-grant' }]);
    mockRevoke();
    expect(
        await model.replace({
            organizationUuid: 'org',
            oldGrantUuid: 'grant',
            newGrantInput: input,
            actorUserUuid: 'subject',
        }),
    ).toMatchObject({ grantUuid: 'new-grant' });
    expect(tracker.history.select[0].sql).toContain('for update');
    expect(tracker.history.select[0].bindings).toContain('org');
    expect(tracker.history.update[0].bindings).toContain('replaced');
    expect(tracker.history.update.at(-1)?.bindings).toContain('new-grant');
    expect(tracker.history.update.at(-1)?.sql).toContain(
        '"replaced_by_grant_uuid"',
    );
    expect(tracker.history.delete).toHaveLength(1);
    expect(tracker.history.delete[0].sql).toContain(
        'oauth2_authorization_codes',
    );
    expect(tracker.history.transactions).toHaveLength(1);
    expect(tracker.history.transactions[0].state).toBe('committed');
    expect(tracker.history.transactions[0].queries).toHaveLength(
        tracker.history.all.length,
    );
});

test('refuses to replace an already revoked grant', async () => {
    tracker.on
        .select('agent_connection_grants')
        .response([{ ...row, revoked_at: now }]);
    await expect(
        model.replace({
            organizationUuid: 'org',
            oldGrantUuid: 'grant',
            newGrantInput: input,
            actorUserUuid: 'subject',
        }),
    ).rejects.toThrow();
    expect(tracker.history.insert).toHaveLength(0);
});

test('binds a refresh family atomically only when unset or equal', async () => {
    tracker.on.update('agent_connection_grants').response(1);
    await model.bindRefreshFamily({
        organizationUuid: 'org',
        grantUuid: 'grant',
        familyUuid: 'family',
    });
    expect(tracker.history.update[0].sql).toContain(
        '("refresh_family_uuid" is null or "refresh_family_uuid" =',
    );
    expect(tracker.history.update[0].bindings).toEqual([
        'family',
        'grant',
        'org',
        'family',
    ]);
});

test('rejects a different refresh family or a missing grant', async () => {
    tracker.on.update('agent_connection_grants').response(0);
    await expect(
        model.bindRefreshFamily({
            organizationUuid: 'org',
            grantUuid: 'grant',
            familyUuid: 'different',
        }),
    ).rejects.toBeInstanceOf(ParameterError);
});

test('touches last use at most once per minute', async () => {
    tracker.on.update('agent_connection_grants').response(1);
    await model.touchLastUsed('grant');
    expect(tracker.history.update[0].sql).toContain(
        '"last_used_at" is null or "last_used_at" <=',
    );
    expect(tracker.history.update[0].bindings).toContainEqual(
        new Date(now.getTime() - 60000),
    );
});

test('rolls back revocation when token cleanup fails', async () => {
    tracker.on
        .update('agent_connection_grants')
        .response([{ ...row, revoked_at: now }]);
    tracker.on
        .delete('oauth2_authorization_codes')
        .simulateError(new Error('token cleanup failed'));
    await expect(
        model.revoke({
            organizationUuid: 'org',
            grantUuid: 'grant',
            revokedByUserUuid: 'subject',
            reason: 'user_request',
        }),
    ).rejects.toThrow('token cleanup failed');
    expect(tracker.history.transactions).toHaveLength(1);
    expect(tracker.history.transactions[0].state).toBe('rolled back');
});

test('rolls back the replacement when revoking the old tokens fails', async () => {
    tracker.on.select('agent_connection_grants').response([row]);
    mockCreate();
    tracker.on
        .update('agent_connection_grants')
        .response([{ ...row, revoked_at: now }]);
    tracker.on
        .delete('oauth2_authorization_codes')
        .simulateError(new Error('token cleanup failed'));
    await expect(
        model.replace({
            organizationUuid: 'org',
            oldGrantUuid: 'grant',
            newGrantInput: input,
            actorUserUuid: 'subject',
        }),
    ).rejects.toThrow('token cleanup failed');
    expect(tracker.history.insert).toHaveLength(1);
    expect(tracker.history.transactions).toHaveLength(1);
    expect(tracker.history.transactions[0].state).toBe('rolled back');
    expect(tracker.history.transactions[0].queries).toHaveLength(
        tracker.history.all.length,
    );
});
