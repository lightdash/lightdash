import {
    AI_DIRECT_TRANSPORT,
    AiAgentMarkerLevel,
    AiTransportKind,
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

export const aiAgentMarkerMock = describeAgentMarker(WarehouseTypes.POSTGRES);

export const markedPersonPlanMock: Extract<
    AiExecutionPlan,
    { identity: 'marked_person' }
> = {
    identity: 'marked_person',
    transport: { kind: AiTransportKind.DIRECT },
    assurances: [
        { kind: 'agent_marker', level: AiAgentMarkerLevel.IDENTIFY_ONLY },
    ],
    audit: {
        personUuid: 'person-uuid',
        userUuid: 'person-uuid',
        principalRef: 'person@example.test',
        queryTags: { agent: 'true' },
    },
};
