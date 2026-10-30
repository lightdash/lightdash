import { describe, expect, it } from 'vitest';
import {
    ATTRIBUTION_KEYS,
    getAiCallTelemetry,
    hasBinaryModelInputs,
    type AiCallAttribution,
} from './aiCallTelemetry';

/**
 * Compile-time, not runtime: fails the typecheck if a field is added to
 * `AiCallAttribution` and not listed in `ATTRIBUTION_KEYS`, which would leave
 * that dimension out of every span and every `ai.usage` row. The error names
 * the field, e.g. `Type '"tenantUuid"' does not satisfy the constraint
 * 'never'`.
 */
type AssertNever<T extends never> = T;
export type AttributionKeysAreExhaustive = AssertNever<
    Exclude<keyof AiCallAttribution, (typeof ATTRIBUTION_KEYS)[number]>
>;

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

    it('carries the embedded viewer id for usage but withholds it from telemetry providers', () => {
        const { telemetry, runtimeContext } = getAiCallTelemetry({
            functionId: 'streamAgentResponse',
            feature: 'agent',
            organizationUuid: 'org',
            keyManagement: 'lightdash-managed',
            channel: 'embed',
            externalUserId: 'viewer@customer.example',
        });

        expect(runtimeContext.externalUserId).toBe('viewer@customer.example');
        expect(telemetry.includeRuntimeContext).toEqual({
            feature: true,
            organizationUuid: true,
            keyManagement: true,
            channel: true,
        });
    });

    it('exports the agent loadout to telemetry providers', () => {
        const { telemetry } = getAiCallTelemetry({
            functionId: 'streamAgentResponse',
            feature: 'agent',
            keyManagement: null,
            extra: { loadoutBase: 'composer', loadoutAddOns: 'mcp,skills' },
        });

        expect(telemetry.includeRuntimeContext).toEqual({
            feature: true,
            loadoutBase: true,
            loadoutAddOns: true,
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

    it('withholds binary input content without losing output or cost attribution', () => {
        const messages = [
            {
                role: 'user',
                content: [
                    {
                        type: 'file',
                        data: { type: 'data', data: Buffer.alloc(2048) },
                        mediaType: 'image/png',
                    },
                ],
            },
        ] satisfies import('ai').ModelMessage[];
        const { telemetry, runtimeContext } = getAiCallTelemetry({
            functionId: 'image-chat',
            feature: 'agent',
            keyManagement: 'self-managed',
            organizationUuid: 'org',
            projectUuid: 'project',
            recordIO: true,
            hasBinaryInputs: hasBinaryModelInputs(messages),
        });
        expect(telemetry.recordInputs).toBe(false);
        expect(telemetry.recordOutputs).toBe(true);
        expect(runtimeContext).toMatchObject({
            feature: 'agent',
            organizationUuid: 'org',
            projectUuid: 'project',
            keyManagement: 'self-managed',
        });
        expect(runtimeContext).not.toHaveProperty('hasBinaryInputs');
        expect(
            hasBinaryModelInputs([
                { role: 'user', content: 'text-only prompt' },
            ]),
        ).toBe(false);
        expect(
            hasBinaryModelInputs([
                {
                    role: 'tool',
                    content: [
                        {
                            type: 'tool-result',
                            toolCallId: 'id',
                            toolName: 'tool',
                            output: { type: 'json', value: { answer: 42 } },
                        },
                    ],
                },
            ]),
        ).toBe(false);
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
