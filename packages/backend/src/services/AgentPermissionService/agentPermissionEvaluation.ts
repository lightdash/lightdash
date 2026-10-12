import {
    AgentCapability,
    AiAccessRefusalReason,
    AiAccessRefusedError,
    getAgentCapabilityName,
    getAgentCapabilityRefusalMessage,
    type AgentPermissionBlocker,
    type AgentPermissionCheck,
    type AgentPermissionCheckKind,
} from '@lightdash/common';
import {
    type AgentPolicyDenial,
    type AgentPolicyEvaluation,
    type ResolvedAgentPolicy,
} from './AgentPermissionService';

export interface AgentPermissionEvaluationContext extends AgentPolicyEvaluation {
    userUuid?: string;
    groupMember?: boolean;
    humanOnly?: boolean;
}

const permissionCheck = (
    kind: AgentPermissionCheckKind,
    label: string,
    status: AgentPermissionCheck['status'],
    message: string,
): AgentPermissionCheck => ({
    id: kind,
    kind,
    label,
    status,
    message,
    capability: null,
    reason: null,
    policyLayer: null,
    settingsUrl: null,
});

const refused = (
    kind: AgentPermissionCheckKind,
    label: string,
    reason: AiAccessRefusalReason,
    policyLayer: AgentPolicyDenial['policyLayer'],
    capability: AgentCapability | null = null,
    settingsUrl: string | null = '/generalSettings/agentIdentity',
    message = getAgentCapabilityRefusalMessage(reason, policyLayer, capability),
): AgentPermissionCheck => ({
    ...permissionCheck(kind, label, 'refused', message),
    reason,
    policyLayer,
    capability,
    settingsUrl,
});

export const agentPermissionChecks = (
    policy: ResolvedAgentPolicy,
    operation: AgentPermissionEvaluationContext,
): {
    kind: AgentPermissionCheckKind;
    evaluate: () => AgentPermissionCheck;
}[] => {
    const required = operation.requiredCapabilities;
    const notNeeded = (kind: AgentPermissionCheckKind, label: string) =>
        permissionCheck(
            kind,
            label,
            'not_checked',
            'Not needed for this action.',
        );
    if (
        policy.mode === 'off' ||
        (policy.mode === 'legacy' && policy.allowedGroupUuids === null)
    )
        return [];
    const admission: ReturnType<typeof agentPermissionChecks>[number] = {
        kind: 'agent_admission',
        evaluate: () => {
            if (
                operation.userUuid === undefined &&
                policy.allowedGroupUuids === null
            )
                return notNeeded('agent_admission', 'Who can use agents');
            if (
                policy.allowedGroupUuids !== null &&
                (policy.allowedGroupUuids.length === 0 ||
                    operation.userUuid === undefined ||
                    operation.groupMember !== true)
            )
                return refused(
                    'agent_admission',
                    'Who can use agents',
                    AiAccessRefusalReason.AGENT_USER_NOT_ALLOWED,
                    'organization_setting',
                );
            return permissionCheck(
                'agent_admission',
                'Who can use agents',
                'allowed',
                'This person can use agents.',
            );
        },
    };
    if (policy.mode === 'legacy') return [admission];
    return [
        admission,
        {
            kind: 'human_only',
            evaluate: () =>
                operation.humanOnly
                    ? refused(
                          'human_only',
                          'Actions reserved for people',
                          AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
                          'organization_setting',
                          AgentCapability.Administration,
                          '/generalSettings/agentIdentity',
                          'Only a person can change access grants or identity settings.',
                      )
                    : notNeeded('human_only', 'Actions reserved for people'),
        },
        {
            kind: 'agent_enabled',
            evaluate: () =>
                policy.allowedCapabilities?.length !== 0
                    ? permissionCheck(
                          'agent_enabled',
                          'Agents enabled',
                          'allowed',
                          'Agents are enabled.',
                      )
                    : refused(
                          'agent_enabled',
                          'Agents enabled',
                          AiAccessRefusalReason.AGENT_ACCESS_DISABLED,
                          'organization_setting',
                      ),
        },
        {
            kind: 'operation_mapping',
            evaluate: () =>
                required === null
                    ? refused(
                          'operation_mapping',
                          'Action requirements',
                          AiAccessRefusalReason.AGENT_OPERATION_UNMAPPED,
                          'unmapped',
                          null,
                          null,
                      )
                    : permissionCheck(
                          'operation_mapping',
                          'Action requirements',
                          'allowed',
                          'The requirements for this action are known.',
                      ),
        },
        ...[...new Set(required ?? [])].map((capability) => ({
            kind: 'capability' as const,
            evaluate: (): AgentPermissionCheck => {
                const id = `capability:${capability}`;
                if (
                    policy.allowedCapabilities !== null &&
                    !policy.allowedCapabilities.includes(capability)
                ) {
                    return {
                        ...refused(
                            'capability',
                            getAgentCapabilityName(capability),
                            AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
                            'organization_setting',
                            capability,
                        ),
                        id,
                    };
                }
                if (policy.capabilities?.has(capability)) {
                    return {
                        ...permissionCheck(
                            'capability',
                            getAgentCapabilityName(capability),
                            'allowed',
                            `This person's roles grant ${getAgentCapabilityName(capability)} to agents.`,
                        ),
                        capability,
                        id,
                    };
                }
                return {
                    ...refused(
                        'capability',
                        getAgentCapabilityName(capability),
                        AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
                        'org_ceiling',
                        capability,
                        policy.editableCustomRoleUuid
                            ? `/generalSettings/customRoles/${policy.editableCustomRoleUuid}`
                            : '/generalSettings/agentIdentity',
                    ),
                    id,
                };
            },
        })),
    ];
};

export const permissionBlockers = (
    checks: AgentPermissionCheck[],
): AgentPermissionBlocker[] =>
    checks.flatMap((check) =>
        (check.status === 'refused' || check.status === 'setup_needed') &&
        check.reason !== null
            ? [
                  {
                      checkId: check.id,
                      status: check.status,
                      reason: check.reason,
                      capability: check.capability,
                      policyLayer: check.policyLayer,
                      message: check.message,
                      settingsUrl: check.settingsUrl,
                  },
              ]
            : [],
    );

export const permissionRefusal = (
    check: AgentPermissionCheck,
    context: {
        operation: string;
        policyVersion: number;
        projectUuid: string | null;
    },
): AiAccessRefusedError => {
    if (check.reason === null || check.policyLayer === null)
        throw new Error('A refusal requires a failed policy check');
    if (check.kind === 'agent_admission')
        return new AiAccessRefusedError(check.reason, {
            ...context,
            policyLayer: check.policyLayer,
        });
    return new AiAccessRefusedError(check.reason, {
        ...context,
        capability: check.capability,
        policyLayer: check.policyLayer,
        settingsUrl: check.settingsUrl,
        message:
            check.kind === 'human_only'
                ? check.message
                : getAgentCapabilityRefusalMessage(
                      check.reason,
                      check.policyLayer,
                      check.capability,
                  ),
    });
};

export const evaluate = (
    policy: ResolvedAgentPolicy,
    operation: AgentPermissionEvaluationContext,
): AgentPolicyDenial | null => {
    for (const step of agentPermissionChecks(policy, operation)) {
        const check = step.evaluate();
        if (check.reason !== null && check.policyLayer !== null)
            return {
                reason: check.reason,
                capability: check.capability,
                policyLayer: check.policyLayer,
                settingsUrl: check.settingsUrl,
            };
    }
    return null;
};
