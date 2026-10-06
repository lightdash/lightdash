import {
    AI_DIRECT_TRANSPORT,
    AiPrincipalFailureReason,
    AiPrincipalKind,
    AiPrincipalStatus,
    NotFoundError,
    ParameterError,
} from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient } from 'knex-mock-client';
import { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import { AiPrincipalModel } from './AiPrincipalModel';

const now = new Date('2026-10-06T12:00:00Z');
const principal = {
    ai_principal_uuid: 'principal',
    ai_access_policy_uuid: 'policy',
    kind: AiPrincipalKind.GROUP,
    ref: 'agent',
    user_uuid: null,
    group_uuid: null,
    status: AiPrincipalStatus.PENDING,
    failure_reason: null,
    status_message: null,
    last_probe: null,
    public_key: null,
    public_key_fingerprint: null,
    encrypted_secret: Buffer.from('encrypted'),
    created_at: now,
    updated_at: now,
};
const policy = {
    ai_access_policy_uuid: 'policy',
    project_uuid: 'project',
    warehouse_connection_uuid: null,
    enabled: false,
    principal_kind: AiPrincipalKind.GROUP,
    transport: AI_DIRECT_TRANSPORT,
    shared_ref: null,
    twin_name_template: null,
    policy_source: null,
    created_at: now,
    updated_at: now,
};
const upsert = {
    enabled: true,
    principalKind: AiPrincipalKind.GROUP,
    transport: AI_DIRECT_TRANSPORT,
    sharedRef: null,
    twinNameTemplate: null,
    policySource: null,
    groupMappings: [{ groupUuid: 'group', ref: 'agent', priority: 3 }],
};
const database = knex({ client: MockClient, dialect: 'pg' });
const tracker = getTracker();
const encrypt = vi.fn(() => Buffer.from('ciphertext'));
const decrypt = vi.fn(() => 'private');
const model = new AiPrincipalModel({
    database,
    encryptionUtil: { encrypt, decrypt } as unknown as EncryptionUtil,
});
beforeEach(() => {
    tracker.reset();
    vi.clearAllMocks();
});
afterAll(async () => database.destroy());

describe('AiPrincipalModel', () => {
    test('translates a person uniqueness violation', async () => {
        tracker.on
            .insert('ai_principals')
            .simulateError(
                Object.assign(new Error('unique violation'), { code: '23505' }),
            );
        await expect(
            model.createPrincipal({
                aiAccessPolicyUuid: 'policy',
                kind: AiPrincipalKind.PERSON,
                ref: 'new',
                userUuid: 'user',
                groupUuid: null,
            }),
        ).rejects.toThrow(
            new ParameterError(
                'This person already has an AI principal on this policy with another reference.',
            ),
        );
    });
    test.each([
        AiPrincipalStatus.READY,
        AiPrincipalStatus.PENDING,
        AiPrincipalStatus.FAILED,
    ])(
        'keeps %s status and failure reason on a transient probe',
        async (status) => {
            const probe = {
                ok: false as const,
                transient: true,
                checkedAt: now,
                reason: AiPrincipalFailureReason.UNKNOWN,
                message: 'Temporary failure',
                observed: {},
            };
            tracker.on.update('ai_principals').response([
                {
                    ...principal,
                    status,
                    failure_reason: AiPrincipalFailureReason.WRONG_PRINCIPAL,
                    last_probe: probe,
                    status_message: probe.message,
                },
            ]);
            expect(await model.recordProbe('principal', probe)).toMatchObject({
                status,
                failureReason: AiPrincipalFailureReason.WRONG_PRINCIPAL,
                statusMessage: probe.message,
                lastProbe: probe,
            });
            expect(tracker.history.update[0].sql).not.toContain('"status" =');
            expect(tracker.history.update[0].sql).not.toContain(
                '"failure_reason" =',
            );
            expect(tracker.history.update[0].bindings).toContain(probe.message);
        },
    );

    test('findPolicy returns null for a missing policy', async () => {
        tracker.on.select('ai_access_policies').response([]);
        expect(await model.findPolicy('project', null)).toBeNull();
    });
    test('maps a policy with ordered group mappings', async () => {
        tracker.on.select('ai_access_policies').response([policy]);
        tracker.on.select('ai_principal_group_mappings').response([
            {
                group_uuid: 'group',
                group_name: 'Team',
                ref: 'agent',
                priority: 3,
            },
        ]);
        expect(await model.findPolicy('project', null)).toMatchObject({
            transport: AI_DIRECT_TRANSPORT,
            groupMappings: [
                {
                    groupUuid: 'group',
                    groupName: 'Team',
                    ref: 'agent',
                    priority: 3,
                },
            ],
        });
        expect(tracker.history.select[1].sql).toContain(
            'order by "priority" desc, "groups"."name" asc',
        );
    });
    test('upserts policy and replaces mappings in a transaction', async () => {
        tracker.on.insert('ai_access_policies').response([policy]);
        tracker.on.delete('ai_principal_group_mappings').response(1);
        tracker.on.insert('ai_principal_group_mappings').response([]);
        tracker.on.select('ai_principal_group_mappings').response([]);
        await model.upsertPolicy('project', null, upsert);
        await model.upsertPolicy('project', null, {
            ...upsert,
            enabled: false,
        });
        expect(
            tracker.history.insert.filter((q) =>
                q.sql.includes('ai_access_policies'),
            ),
        ).toHaveLength(2);
        expect(tracker.history.insert[0].sql).toContain(
            'on conflict (project_uuid) WHERE warehouse_connection_uuid IS NULL do update',
        );
        expect(tracker.history.delete).toHaveLength(2);
        expect(tracker.history.insert[1].bindings).toEqual([
            'policy',
            'group',
            3,
            'agent',
        ]);
    });
    test('returns an existing principal after an insert conflict', async () => {
        tracker.on.insert('ai_principals').response([]);
        tracker.on.select('ai_principals').response([principal]);
        expect(
            await model.createPrincipal({
                aiAccessPolicyUuid: 'policy',
                kind: AiPrincipalKind.GROUP,
                ref: 'agent',
                userUuid: null,
                groupUuid: null,
            }),
        ).toMatchObject({ aiPrincipalUuid: 'principal' });
        expect(tracker.history.insert[0].sql).toContain('do nothing');
    });
    test('encrypts the private key before storing it', async () => {
        tracker.on.update('ai_principals').response(1);
        await model.setSecret('principal', {
            secret: 'private',
            publicKey: 'public',
            publicKeyFingerprint: 'fingerprint',
        });
        expect(encrypt).toHaveBeenCalledWith('private');
        expect(tracker.history.update[0].bindings).toContainEqual(
            Buffer.from('ciphertext'),
        );
        expect(tracker.history.update[0].sql).toContain('encrypted_secret');
    });
    test.each([true, false])('records probe status for ok=%s', async (ok) => {
        const probe = ok
            ? { ok: true as const, checkedAt: now, observed: {} }
            : {
                  ok: false as const,
                  transient: false,
                  checkedAt: now,
                  observed: {},
                  reason: AiPrincipalFailureReason.WRONG_PRINCIPAL,
                  message: 'Wrong principal',
              };
        const status = ok ? AiPrincipalStatus.READY : AiPrincipalStatus.FAILED;
        tracker.on.update('ai_principals').response([
            {
                ...principal,
                status,
                failure_reason: ok
                    ? null
                    : AiPrincipalFailureReason.WRONG_PRINCIPAL,
                status_message: ok ? null : 'Wrong principal',
                last_probe: { ...probe, checkedAt: now.toISOString() },
            },
        ]);
        expect(await model.recordProbe('principal', probe)).toMatchObject({
            status,
            lastProbe: probe,
            failureReason: ok ? null : AiPrincipalFailureReason.WRONG_PRINCIPAL,
            statusMessage: ok ? null : 'Wrong principal',
        });
        expect(tracker.history.update[0].bindings).toContain(status);
    });
    test('resets status and clears all probe metadata', async () => {
        tracker.on.update('ai_principals').response([principal]);
        const result = await model.resetStatus('principal');
        expect(result).toMatchObject({
            status: AiPrincipalStatus.PENDING,
            failureReason: null,
            statusMessage: null,
            lastProbe: null,
        });
        expect(result).not.toHaveProperty('secret');
        const query = tracker.history.update[0];
        expect(query.sql).toContain('"status" = $1');
        expect(query.sql).toContain('"failure_reason" = $2');
        expect(query.sql).toContain('"status_message" = $3');
        expect(query.sql).toContain('"last_probe" = $4');
        expect(query.bindings).toEqual([
            AiPrincipalStatus.PENDING,
            null,
            null,
            null,
            expect.any(Date),
            'principal',
        ]);
    });
    test('resetStatus rejects a missing principal', async () => {
        tracker.on.update('ai_principals').response([]);
        await expect(model.resetStatus('missing')).rejects.toThrow(
            NotFoundError,
        );
    });
    test('decrypts only when requesting a principal with secrets', async () => {
        tracker.on.select('ai_principals').response([principal]);
        expect(await model.getPrincipal('principal')).toMatchObject({
            secret: 'private',
        });
        expect(decrypt).toHaveBeenCalledWith(principal.encrypted_secret);
        decrypt.mockClear();
        const rows = await model.listPrincipals('policy');
        expect(rows[0]).not.toHaveProperty('secret');
        expect(rows[0]).not.toHaveProperty('encrypted_secret');
        expect(decrypt).not.toHaveBeenCalled();
    });
    test('rejects missing principals', async () => {
        tracker.on.select('ai_principals').response([]);
        await expect(model.getPrincipal('missing')).rejects.toThrow(
            NotFoundError,
        );
    });
    test('falls back for probe and transport values of the wrong shape', async () => {
        tracker.on
            .select('ai_principals')
            .response([{ ...principal, last_probe: { ok: 'maybe' } }]);
        expect((await model.getPrincipal('principal')).lastProbe).toBeNull();
        tracker.on
            .select('ai_access_policies')
            .response([{ ...policy, transport: { kind: 'carrier_pigeon' } }]);
        tracker.on.select('ai_principal_group_mappings').response([]);
        expect((await model.getPolicy('policy')).transport).toEqual(
            AI_DIRECT_TRANSPORT,
        );
    });
    test('writes the audit row once per query and updates it on a retry', async () => {
        tracker.on.insert('ai_query_audit').response([]);
        await model.insertAudit({
            queryUuid: 'query',
            projectUuid: 'project',
            warehouseConnectionUuid: null,
            userUuid: 'user',
            aiPrincipalUuid: 'principal',
            principalKind: AiPrincipalKind.GROUP,
            principalRef: 'agent',
            transport: AI_DIRECT_TRANSPORT,
            probeOk: true,
            probeCheckedAt: now,
            personTag: 'user',
        });
        expect(tracker.history.insert[0].sql).toContain(
            'on conflict ("query_uuid") do update',
        );
    });
    test.each(['user@example.test', null])(
        'maps audit email %s with pagination and offsets',
        async (personEmail) => {
            tracker.on
                .select((q) => q.sql.includes('count('))
                .response([{ total: '21' }]);
            tracker.on.select('ai_query_audit').response([
                {
                    query_uuid: 'query',
                    project_uuid: 'project',
                    warehouse_connection_uuid: null,
                    user_uuid: 'user',
                    person_email: personEmail,
                    ai_principal_uuid: 'principal',
                    principal_kind: AiPrincipalKind.GROUP,
                    principal_ref: 'agent',
                    transport: AI_DIRECT_TRANSPORT,
                    probe_ok: true,
                    probe_checked_at: now,
                    person_tag: 'user',
                    created_at: now,
                },
            ]);
            expect(
                await model.listAudit('project', { page: 2, pageSize: 10 }),
            ).toEqual({
                data: [
                    {
                        queryUuid: 'query',
                        projectUuid: 'project',
                        warehouseConnectionUuid: null,
                        userUuid: 'user',
                        personEmail,
                        aiPrincipalUuid: 'principal',
                        principalKind: AiPrincipalKind.GROUP,
                        principalRef: 'agent',
                        transport: AI_DIRECT_TRANSPORT,
                        probeOk: true,
                        probeCheckedAt: now,
                        personTag: 'user',
                        createdAt: now,
                    },
                ],
                pagination: {
                    page: 2,
                    pageSize: 10,
                    totalResults: 21,
                    totalPageCount: 3,
                },
            });
            expect(tracker.history.select[1].sql).toContain(
                'left join "users" on "users"."user_uuid" = "ai_query_audit"."user_uuid"',
            );
            expect(tracker.history.select[1].sql).toContain(
                '"users"."email" as "person_email"',
            );
            expect(tracker.history.select[1].bindings).toEqual([
                'project',
                10,
                10,
            ]);
        },
    );
});
