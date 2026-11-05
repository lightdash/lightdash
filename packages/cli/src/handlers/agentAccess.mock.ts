import {
    AiAccessRefusalAction,
    AiAccessRefusalReason,
    type AiAccessForUser,
} from '@lightdash/common';

export const agentProjectUuid = '00000000-0000-0000-0000-000000000001';
export const agentConnectUrl = `https://example.com/agent/connect?project=${agentProjectUuid}&redirect=/agent-connected`;
export const agentAccess: AiAccessForUser = {
    projectUuid: agentProjectUuid,
    expiresAt: null,
    principalName: null,
    requirementSource: 'organization',
    source: 'agent_sign_in',
    identity: null,
    marker: null,
    warehouseConnectionUuid: null,
    enabled: false,
    principalKind: 'person',
    refusal: {
        code: 'ai_access_refused',
        reason: AiAccessRefusalReason.NEEDS_SIGN_IN,
        action: AiAccessRefusalAction.SIGN_IN,
        message:
            'Connect your agent to the warehouse once so it can run as you.',
        settingsUrl: null,
        connectUrl: agentConnectUrl,
    },
};
export const connectedAgentAccess: AiAccessForUser = {
    ...agentAccess,
    identity: 'connected_person',
    principalName: 'charlie@acme.com',
    enabled: true,
    refusal: null,
};
