import {
    AiAgentMarkerLevel,
    WarehouseTypes,
    type AiExecutionPlan,
} from '@lightdash/common';
import { describeAgentMarker } from './agentMarker';

export const aiExecutionPlanMock: Extract<
    AiExecutionPlan,
    { identity: 'connected_person' }
> = {
    identity: 'connected_person',
    identityUuid: 'connected-person-uuid',
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
        actorKind: 'person',
        personUuid: 'person-uuid',
        principalRef: 'ai_shared',
        queryTags: { ai_principal: 'ai_shared' },
    },
};

export const aiAgentMarkerMock = describeAgentMarker(WarehouseTypes.POSTGRES);

export const markedPersonPlanMock: Extract<
    AiExecutionPlan,
    { identity: 'marked_person' }
> = {
    identity: 'marked_person',
    assurances: [
        { kind: 'agent_marker', level: AiAgentMarkerLevel.IDENTIFY_ONLY },
    ],
    audit: {
        actorKind: 'person',
        personUuid: 'person-uuid',
        userUuid: 'person-uuid',
        principalRef: 'person@example.test',
        queryTags: { agent: 'true' },
    },
};

export const aiServiceAccountPlanMock: Extract<
    AiExecutionPlan,
    { identity: 'ai_service_account' }
> = {
    identity: 'ai_service_account',
    identityUuid: 'slot-generation',
    credentialUuid: 'slot-row',
    credentials: {
        type: WarehouseTypes.BIGQUERY,
        project: 'warehouse-project',
        dataset: 'dataset',
        timeoutSeconds: 0,
        priority: 'interactive',
        retries: 0,
        location: 'EU',
        maximumBytesBilled: 0,
        keyfileContents: {
            type: 'service_account',
            private_key: 'saved-key',
            client_email: 'agent@example.com',
        },
        requireUserCredentials: false,
        allowUserCredentials: false,
    },
    assurances: [{ kind: 'result_cache_off' }],
    audit: {
        actorKind: 'person',
        personUuid: 'person-uuid',
        userUuid: 'person-uuid',
        principalRef: 'slot-row',
        queryTags: { agent: 'true' },
    },
};
