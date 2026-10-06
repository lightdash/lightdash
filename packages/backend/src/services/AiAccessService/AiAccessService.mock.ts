import {
    AI_DIRECT_TRANSPORT,
    AiPrincipalKind,
    AiPrincipalStatus,
    WarehouseTypes,
    type AiExecutionPlan,
} from '@lightdash/common';

export const aiExecutionPlanMock: AiExecutionPlan = {
    principal: {
        aiPrincipalUuid: 'ai-principal-uuid',
        aiAccessPolicyUuid: 'ai-policy-uuid',
        kind: AiPrincipalKind.SHARED,
        ref: 'ai_shared',
        userUuid: null,
        groupUuid: null,
        status: AiPrincipalStatus.READY,
        failureReason: null,
        statusMessage: null,
        lastProbe: {
            ok: true,
            checkedAt: new Date('2026-10-01'),
            observed: {},
        },
        publicKey: null,
        publicKeyFingerprint: null,
        createdAt: new Date('2026-10-01'),
        updatedAt: new Date('2026-10-01'),
    },
    transport: AI_DIRECT_TRANSPORT,
    credentials: {
        type: WarehouseTypes.POSTGRES,
        host: 'localhost',
        port: 5432,
        user: 'ai_shared',
        password: 'test',
        dbname: 'test',
        schema: 'public',
    },
    assurances: [],
    audit: {
        personUuid: 'person-uuid',
        principalRef: 'ai_shared',
        queryTags: { ai_principal: 'ai_shared' },
    },
};
