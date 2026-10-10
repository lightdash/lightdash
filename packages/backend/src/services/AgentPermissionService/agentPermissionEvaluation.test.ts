import {
    AgentCapability,
    AiAccessRefusalReason,
    getAgentCapabilityName,
} from '@lightdash/common';
import { agentPermissionChecks } from './agentPermissionEvaluation';
import {
    evaluate,
    type AgentPolicyEvaluation,
    type ResolvedAgentPolicy,
} from './AgentPermissionService';

const policy: ResolvedAgentPolicy = {
    mode: 'managed',
    capabilities: new Set(),
    allowedProjectUuids: null,
    allowedUserUuids: null,
    version: 1,
    editableCustomRoleUuid: null,
};
const operation: AgentPolicyEvaluation = {
    requiredCapabilities: [AgentCapability.RawSql],
    projectUuid: 'project',
    mcpAgentsEnabled: true,
    mcpContentWritesEnabled: true,
    warehouseConfirmed: false,
    isOrganizationDiscovery: false,
};

test('shared sequence includes every blocker while evaluate keeps the first', () => {
    const checks = agentPermissionChecks(policy, operation).map((check) =>
        check.evaluate(),
    );
    expect(
        checks
            .filter((check) => check.reason !== null)
            .map((check) => check.reason),
    ).toEqual([
        AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
        AiAccessRefusalReason.AGENT_RAW_SQL_UNCONFIRMED,
    ]);
    expect(evaluate(policy, operation)?.reason).toBe(
        AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
    );
});

test.each(Object.values(AgentCapability))(
    'uses the plain name for %s',
    (capability) => {
        const checks = agentPermissionChecks(policy, {
            ...operation,
            requiredCapabilities: [capability],
        }).map((check) => check.evaluate());
        const row = checks.find((check) => check.kind === 'capability')!;
        expect(row.label).toBe(getAgentCapabilityName(capability));
        expect(row.message).toContain(getAgentCapabilityName(capability));
        if (capability.includes('_'))
            expect(
                JSON.stringify(
                    checks.map(({ label, message }) => ({ label, message })),
                ),
            ).not.toContain(capability);
    },
);

test.each([
    [null, null, false, true],
    [[], 'project', false, false],
    [['project'], 'project', false, true],
    [[], null, true, true],
    [[], null, false, false],
] as const)(
    'project scope %j / %s / discovery %s',
    (allowedProjectUuids, projectUuid, isOrganizationDiscovery, allowed) => {
        const result = evaluate(
            {
                ...policy,
                capabilities: new Set([AgentCapability.ReadDiscover]),
                allowedProjectUuids:
                    allowedProjectUuids === null
                        ? null
                        : [...allowedProjectUuids],
            },
            {
                ...operation,
                requiredCapabilities: [AgentCapability.ReadDiscover],
                projectUuid,
                isOrganizationDiscovery,
            },
        );
        expect(result?.reason ?? null).toBe(
            allowed ? null : AiAccessRefusalReason.AGENT_PROJECT_DENIED,
        );
    },
);

test('checks a known project independently of an unknown action mapping', () => {
    const checks = agentPermissionChecks(
        { ...policy, allowedProjectUuids: [] },
        { ...operation, requiredCapabilities: null },
    ).map((step) => step.evaluate());
    expect(
        checks
            .filter((check) => check.reason !== null)
            .map((check) => check.reason),
    ).toEqual([
        AiAccessRefusalReason.AGENT_OPERATION_UNMAPPED,
        AiAccessRefusalReason.AGENT_PROJECT_DENIED,
    ]);
});
