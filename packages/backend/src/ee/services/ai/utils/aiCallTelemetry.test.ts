import { describe, expect, it } from 'vitest';
import { getAiCallTelemetry } from './aiCallTelemetry';

describe('getAiCallTelemetry', () => {
    it('reports only allow-listed dimensions to telemetry providers', () => {
        const { telemetry } = getAiCallTelemetry({
            functionId: 'streamAgentResponse',
            feature: 'agent',
            organizationUuid: 'org',
            projectUuid: 'proj',
            keyManagement: 'self-managed',
            extra: { runUuid: 'run', deepResearchPhase: 'plan' },
        });

        // runUuid and deepResearchPhase stay on ai.usage only.
        expect(telemetry.includeRuntimeContext).toEqual({
            feature: true,
            organizationUuid: true,
            projectUuid: true,
            keyManagement: true,
        });
    });

    it('exports an extra key when its name is allow-listed', () => {
        // generateAgentSuggestions attributes org/project/agent only via extra,
        // so this pass-through is load-bearing, not an oversight.
        const { telemetry, runtimeContext } = getAiCallTelemetry({
            functionId: 'generateAgentSuggestions',
            feature: 'agent-suggestions',
            keyManagement: null,
            extra: {
                organizationUuid: 'org-from-extra',
                agentUuid: 'agent-from-extra',
                mode: 'post-response',
            },
        });

        expect(telemetry.includeRuntimeContext).toEqual({
            feature: true,
            organizationUuid: true,
            agentUuid: true,
        });
        expect(runtimeContext.organizationUuid).toBe('org-from-extra');
        expect(runtimeContext.mode).toBe('post-response');
    });

    it('lets extra shadow a typed dimension', () => {
        const { runtimeContext } = getAiCallTelemetry({
            functionId: 'x',
            feature: 'agent',
            organizationUuid: 'typed',
            keyManagement: null,
            extra: { organizationUuid: 'shadowed' },
        });

        expect(runtimeContext.organizationUuid).toBe('shadowed');
    });

    it('keeps prompt and response capture off unless asked', () => {
        const off = getAiCallTelemetry({
            functionId: 'x',
            feature: 'agent',
            keyManagement: null,
        });
        const on = getAiCallTelemetry({
            functionId: 'x',
            feature: 'agent',
            keyManagement: null,
            recordIO: true,
        });

        expect(off.telemetry).toMatchObject({
            recordInputs: false,
            recordOutputs: false,
        });
        expect(on.telemetry).toMatchObject({
            recordInputs: true,
            recordOutputs: true,
        });
    });
});
