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
    allowedCapabilities: null,
    allowedGroupUuids: null,
    version: 1,
    editableCustomRoleUuid: null,
};
const operation: AgentPolicyEvaluation = {
    requiredCapabilities: [AgentCapability.RawSql],
    projectUuid: 'project',
};

test('shared sequence includes every blocker while evaluate keeps the first', () => {
    const checks = agentPermissionChecks(policy, operation).map((check) =>
        check.evaluate(),
    );
    expect(checks.map((check) => check.kind)).toEqual([
        'agent_admission',
        'human_only',
        'agent_enabled',
        'operation_mapping',
        'capability',
    ]);
    expect(
        checks
            .filter((check) => check.reason !== null)
            .map((check) => check.reason),
    ).toEqual([AiAccessRefusalReason.AGENT_CAPABILITY_DENIED]);
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

test.each([null, [AgentCapability.Query]])(
    'a nonempty or absent list admits a turn: %j',
    (allowedCapabilities) => {
        expect(
            evaluate(
                { ...policy, allowedCapabilities },
                { ...operation, requiredCapabilities: [] },
            ),
        ).toBeNull();
    },
);

test('an empty list refuses a turn before mapping with the organization remedy', () => {
    expect(
        evaluate(
            { ...policy, allowedCapabilities: [] },
            { ...operation, requiredCapabilities: [] },
        ),
    ).toEqual({
        reason: AiAccessRefusalReason.AGENT_ACCESS_DISABLED,
        capability: null,
        policyLayer: 'organization_setting',
        settingsUrl: '/generalSettings/agentIdentity',
    });
});

test('the organization list takes precedence over a custom role grant and its remedy', () => {
    expect(
        evaluate(
            {
                ...policy,
                allowedCapabilities: [AgentCapability.Query],
                capabilities: new Set([AgentCapability.RawSql]),
                editableCustomRoleUuid: 'custom',
            },
            operation,
        ),
    ).toEqual({
        reason: AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
        capability: AgentCapability.RawSql,
        policyLayer: 'organization_setting',
        settingsUrl: '/generalSettings/agentIdentity',
    });
});

test('a missing role grant within the list retains the custom role remedy', () => {
    expect(
        evaluate(
            {
                ...policy,
                allowedCapabilities: [AgentCapability.RawSql],
                editableCustomRoleUuid: 'custom',
            },
            operation,
        )?.settingsUrl,
    ).toBe('/generalSettings/customRoles/custom');
});

test('legacy restriction evaluates only admission, even for unmapped human-only operations', () => {
    const checks = agentPermissionChecks(
        {
            ...policy,
            mode: 'legacy',
            allowedGroupUuids: ['group'],
        },
        {
            ...operation,
            userUuid: 'user',
            groupMember: false,
            humanOnly: true,
            requiredCapabilities: null,
        },
    ).map((step) => step.evaluate());
    expect(checks).toEqual([
        expect.objectContaining({
            kind: 'agent_admission',
            reason: AiAccessRefusalReason.AGENT_USER_NOT_ALLOWED,
        }),
    ]);
});

test.each([true, false])(
    'legacy membership %s determines admission without capabilities',
    (groupMember) => {
        expect(
            evaluate(
                { ...policy, mode: 'legacy', allowedGroupUuids: ['group'] },
                { ...operation, userUuid: 'user', groupMember },
            )?.reason ?? null,
        ).toBe(
            groupMember ? null : AiAccessRefusalReason.AGENT_USER_NOT_ALLOWED,
        );
    },
);

test('an empty group restriction never passes, even with a stale membership result', () => {
    expect(
        evaluate(
            { ...policy, mode: 'legacy', allowedGroupUuids: [] },
            { ...operation, userUuid: 'user', groupMember: true },
        )?.reason,
    ).toBe(AiAccessRefusalReason.AGENT_USER_NOT_ALLOWED);
});

test('group admission fails closed without a person', () => {
    expect(
        evaluate(
            { ...policy, mode: 'legacy', allowedGroupUuids: ['group'] },
            operation,
        )?.reason,
    ).toBe(AiAccessRefusalReason.AGENT_USER_NOT_ALLOWED);
});
