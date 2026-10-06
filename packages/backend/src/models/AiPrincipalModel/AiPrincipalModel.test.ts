import {
    AI_DIRECT_TRANSPORT,
    AiPrincipalFailureReason,
    AiPrincipalKind,
    AiPrincipalStatus,
    NotFoundError,
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
    encrypted_private_key: Buffer.from('encrypted'),
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
        await model.setKeyPair('principal', {
            privateKey: 'private',
            publicKey: 'public',
            publicKeyFingerprint: 'fingerprint',
        });
        expect(encrypt).toHaveBeenCalledWith('private');
        expect(tracker.history.update[0].bindings).toContainEqual(
            Buffer.from('ciphertext'),
        );
        expect(tracker.history.update[0].sql).toContain(
            'encrypted_private_key',
        );
    });
    test.each([true, false])('records probe status for ok=%s', async (ok) => {
        const probe = ok
            ? { ok: true as const, checkedAt: now, observed: {} }
            : {
                  ok: false as const,
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
    test('decrypts only when requesting a principal with secrets', async () => {
        tracker.on.select('ai_principals').response([principal]);
        expect(await model.getPrincipal('principal')).toMatchObject({
            privateKey: 'private',
        });
        expect(decrypt).toHaveBeenCalledWith(principal.encrypted_private_key);
        decrypt.mockClear();
        const rows = await model.listPrincipals('policy');
        expect(rows[0]).not.toHaveProperty('privateKey');
        expect(rows[0]).not.toHaveProperty('encrypted_private_key');
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
    test('computes audit pagination and offsets', async () => {
        tracker.on
            .select((q) => q.sql.includes('count('))
            .response([{ total: '21' }]);
        tracker.on.select('ai_query_audit').response([]);
        expect(
            await model.listAudit('project', { page: 2, pageSize: 10 }),
        ).toEqual({
            data: [],
            pagination: {
                page: 2,
                pageSize: 10,
                totalResults: 21,
                totalPageCount: 3,
            },
        });
        expect(tracker.history.select[1].bindings).toEqual(['project', 10, 10]);
    });
});
