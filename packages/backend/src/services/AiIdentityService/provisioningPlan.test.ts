import {
    AiIdentityProvisionerFindingReason,
    AiIdentityState,
    type AiIdentity,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    buildProvisioningPlan,
    classifyProvisionerUsers,
    missingProvisionerGrants,
} from './provisioningPlan';

const identity: AiIdentity & {
    createdByProvisioner: boolean;
    provisionedRole: string | null;
    provisionedUserName: string | null;
    provisionedPublicKeyFingerprint: string | null;
    groupUuids: string[];
} = {
    aiIdentityUuid: 'identity',
    aiIdentityAccountUuid: 'account',
    snowflakeAccount: 'snowflake',
    userUuid: 'user',
    email: 'alice@example.com',
    firstName: 'Alice',
    lastName: 'A',
    snowflakeLogin: 'ALICE',
    twinNameOverride: null,
    twinName: 'ALICE_AI',
    publicKey: 'YWJj',
    publicKeyFingerprint: 'fingerprint',
    state: AiIdentityState.PENDING,
    stale: false,
    failureReason: null,
    statusMessage: null,
    checkedAt: null,
    createdAt: new Date(),
    createdByProvisioner: false,
    provisionedRole: null,
    provisionedUserName: null,
    provisionedPublicKeyFingerprint: null,
    groupUuids: ['group'],
};

const mappings = [
    {
        aiIdentityRoleMappingUuid: 'mapping',
        groupUuid: 'group',
        groupName: 'Group',
        aiRole: 'ANALYST_AI',
        priority: 1,
    },
];

describe('provisioner verification', () => {
    it('reports missing account and AI role grants', () => {
        expect(missingProvisionerGrants([], new Set(['ANALYST_AI']))).toEqual([
            'CREATE USER on the account',
            'OWNERSHIP on AI role ANALYST_AI',
        ]);
        expect(
            missingProvisionerGrants(
                [
                    {
                        privilege: 'CREATE USER',
                        granted_on: 'ACCOUNT',
                        name: 'ACCOUNT',
                    },
                    {
                        privilege: 'OWNERSHIP',
                        granted_on: 'ROLE',
                        name: 'ANALYST_AI',
                    },
                ],
                new Set(['ANALYST_AI']),
            ),
        ).toEqual([]);
    });

    it('classifies owned users independently of sign-in status', () => {
        const findings = classifyProvisionerUsers(
            [
                { name: 'PERSON', owner: 'PROVISIONER', type: 'PERSON' },
                {
                    name: 'UNKNOWN_AI',
                    owner: 'PROVISIONER',
                    type: 'SERVICE_AGENT',
                },
                {
                    name: 'ALICE_AI',
                    owner: 'PROVISIONER',
                    type: 'SERVICE_AGENT',
                },
                { name: 'OTHER', owner: 'ADMIN', type: 'PERSON' },
            ],
            'PROVISIONER',
            new Set(['alice_ai']),
        );
        expect(findings.map(({ reason }) => reason)).toEqual([
            AiIdentityProvisionerFindingReason.NOT_SERVICE_AGENT,
            AiIdentityProvisionerFindingReason.NOT_CREATED_BY_LIGHTDASH,
            AiIdentityProvisionerFindingReason.NOT_CREATED_BY_LIGHTDASH,
        ]);
        expect(findings[0].fixSql).toContain('DROP USER "PERSON";');
        expect(findings[0].fixSql).toContain('GRANT OWNERSHIP ON USER');
    });
});

describe('buildProvisioningPlan', () => {
    it('creates and grants a user for the lowest priority mapping', () => {
        const plan = buildProvisioningPlan({
            identities: [identity],
            scopedUserUuids: new Set(['user']),
            mappings,
            pendingDrops: [],
        });
        expect(plan.items.map((item) => item.operation.kind)).toEqual([
            'create_user',
            'grant_role',
        ]);
        expect(plan.items[0].sql).toContain('TYPE = SERVICE_AGENT');
    });

    it('skips people without a name or mapped role', () => {
        const plan = buildProvisioningPlan({
            identities: [
                { ...identity, twinName: null },
                {
                    ...identity,
                    userUuid: 'other',
                    email: 'bob@example.com',
                    groupUuids: [],
                },
            ],
            scopedUserUuids: new Set(['user', 'other']),
            mappings,
            pendingDrops: [],
        });
        expect(plan.skipped.map((item) => item.reason)).toEqual([
            'no Snowflake login recorded; ask them to sign in to Snowflake or set an AI identity name',
            'no group mapped to an AI role',
        ]);
    });

    it('reconciles a role change and a rotated key', () => {
        const plan = buildProvisioningPlan({
            identities: [
                {
                    ...identity,
                    createdByProvisioner: true,
                    provisionedRole: 'OLD_AI',
                    provisionedUserName: 'ALICE_AI',
                    provisionedPublicKeyFingerprint: 'old',
                },
            ],
            scopedUserUuids: new Set(['user']),
            mappings: [
                ...mappings,
                { ...mappings[0], groupUuid: 'old-group', aiRole: 'OLD_AI' },
            ],
            pendingDrops: [],
        });
        expect(plan.items.map((item) => item.operation.kind)).toEqual([
            'revoke_role',
            'grant_role',
            'set_default_role',
            'set_public_key',
        ]);
    });

    it('drops users who leave scope and keeps queued deactivation drops', () => {
        const plan = buildProvisioningPlan({
            identities: [
                {
                    ...identity,
                    createdByProvisioner: true,
                    provisionedRole: 'ANALYST_AI',
                    provisionedUserName: 'ALICE_AI',
                },
            ],
            scopedUserUuids: new Set(),
            mappings,
            pendingDrops: [{ uuid: 'drop', userName: 'BOB_AI' }],
        });
        expect(plan.items.map((item) => item.operation.kind)).toEqual([
            'drop_user',
            'drop_user',
        ]);
    });
});
