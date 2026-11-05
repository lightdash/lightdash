import {
    AgentActorSurface,
    buildAgentIdentityClaim,
    getAgentClientLabel,
} from '@lightdash/common';
import { trustedAgentQueryTags } from './agentQueryTags';

describe('trustedAgentQueryTags', () => {
    const forged = {
        user_uuid: 'user-uuid',
        agent: 'false',
        agent_surface: 'forged',
        agent_client: 'forged',
        agent_uuid: 'forged',
    };

    test('adds the agent uuid from the claim and keeps the user uuid', () => {
        const claim = buildAgentIdentityClaim({
            subject: { type: 'user', uuid: 'user-uuid' },
            surface: AgentActorSurface.MCP,
            clientId: 'oauth-client',
            agentUuid: 'agent-uuid',
        });
        expect(trustedAgentQueryTags(forged, claim)).toEqual({
            user_uuid: 'user-uuid',
            agent: 'true',
            agent_surface: 'mcp',
            agent_client: getAgentClientLabel('oauth-client'),
            agent_uuid: 'agent-uuid',
        });
    });

    test('drops a forged agent uuid when the claim names no agent', () => {
        const claim = buildAgentIdentityClaim({
            subject: { type: 'user', uuid: 'user-uuid' },
            surface: AgentActorSurface.MCP,
            clientId: 'oauth-client',
        });
        expect(trustedAgentQueryTags(forged, claim)).not.toHaveProperty(
            'agent_uuid',
        );
    });

    test('drops agent tags without a claim', () => {
        expect(trustedAgentQueryTags(forged, null)).toEqual({
            user_uuid: 'user-uuid',
        });
    });
});
