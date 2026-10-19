import { AgentCapability, getAgentCapabilityName } from './agentPermissions';
import {
    AiAccessRefusalReason,
    getAgentCapabilityRefusalMessage,
} from './aiPrincipal';
import { AiAccessRefusedError } from './errors';

test.each(Object.values(AgentCapability))(
    'uses the plain capability name: %s',
    (capability) => {
        const message = getAgentCapabilityRefusalMessage(
            AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
            'org_ceiling',
            capability,
        );
        expect(message).toContain(getAgentCapabilityName(capability));
        if (capability.includes('_')) expect(message).not.toContain(capability);
    },
);

test('serializes additive diagnostics without changing old refusal fields', () => {
    const reason = AiAccessRefusalReason.AGENT_CAPABILITY_DENIED;
    const original = new AiAccessRefusedError(reason);
    const diagnostics = {
        requiredCapabilities: [AgentCapability.Query],
        blockers: [],
        blockersComplete: false,
        explanationUrl: '/generalSettings/myAgentConnections',
    };
    const error = new AiAccessRefusedError(reason, diagnostics);
    expect(error.refusal).toEqual({ ...original.refusal, ...diagnostics });
    expect(error.data).toEqual(error.refusal);
});
