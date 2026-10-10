import {
    AgentCapability,
    AiAccessRefusalReason,
    AiAccessRefusedError,
    getAgentCapabilityName,
    getAgentCapabilityRefusalMessage,
    getProjectAgentIdentitySettingsPath,
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
    humanOnly?: boolean;
    warehouseStale?: boolean;
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
    ...permissionCheck(
        kind,
        label,
        reason === AiAccessRefusalReason.AGENT_RAW_SQL_UNCONFIRMED
            ? 'setup_needed'
            : 'refused',
        message,
    ),
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
    return [
        {
            kind: 'agent_admission',
            evaluate: () => {
                if (operation.userUuid === undefined)
                    return notNeeded('agent_admission', 'Who can use agents');
                if (
                    policy.allowedUserUuids !== null &&
                    !policy.allowedUserUuids.includes(operation.userUuid)
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
        },
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
                operation.mcpAgentsEnabled
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
        {
            kind: 'project_scope',
            evaluate: () => {
                if (
                    required === null &&
                    operation.projectUuid === null &&
                    policy.allowedProjectUuids !== null &&
                    operation.isOrganizationDiscovery
                )
                    return permissionCheck(
                        'project_scope',
                        'Allowed projects',
                        'not_checked',
                        'The requirements for this action are unknown.',
                    );
                return policy.allowedProjectUuids !== null &&
                    (operation.projectUuid === null
                        ? !operation.isOrganizationDiscovery ||
                          (required ?? []).some(
                              (capability) =>
                                  capability !== AgentCapability.ReadDiscover,
                          )
                        : !policy.allowedProjectUuids.includes(
                              operation.projectUuid,
                          ))
                    ? refused(
                          'project_scope',
                          'Allowed projects',
                          AiAccessRefusalReason.AGENT_PROJECT_DENIED,
                          'project_scope',
                      )
                    : permissionCheck(
                          'project_scope',
                          'Allowed projects',
                          'allowed',
                          operation.projectUuid === null
                              ? 'Organization access is allowed for this action.'
                              : 'Agents can use this project.',
                      );
            },
        },
        ...[...new Set(required ?? [])].map((capability) => ({
            kind: 'capability' as const,
            evaluate: (): AgentPermissionCheck => ({
                ...(policy.capabilities?.has(capability)
                    ? {
                          ...permissionCheck(
                              'capability',
                              getAgentCapabilityName(capability),
                              'allowed',
                              `This person's roles grant ${getAgentCapabilityName(capability)} to agents.`,
                          ),
                          capability,
                      }
                    : refused(
                          'capability',
                          getAgentCapabilityName(capability),
                          AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
                          'org_ceiling',
                          capability,
                          policy.editableCustomRoleUuid
                              ? `/generalSettings/customRoles/${policy.editableCustomRoleUuid}`
                              : '/generalSettings/agentIdentity',
                      )),
                id: `capability:${capability}`,
            }),
        })),
        {
            kind: 'content_writes',
            evaluate: () => {
                if (!required?.includes(AgentCapability.ContentWrite))
                    return notNeeded('content_writes', 'Agent content writes');
                if (operation.mcpContentWritesEnabled)
                    return permissionCheck(
                        'content_writes',
                        'Agent content writes',
                        'allowed',
                        'Agent content writes are on.',
                    );
                return refused(
                    'content_writes',
                    'Agent content writes',
                    AiAccessRefusalReason.AGENT_SETTING_DENIED,
                    'organization_setting',
                    AgentCapability.ContentWrite,
                );
            },
        },
        {
            kind: 'warehouse_confirmation',
            evaluate: () => {
                if (!required?.includes(AgentCapability.RawSql))
                    return notNeeded(
                        'warehouse_confirmation',
                        'Raw SQL confirmation',
                    );
                if (operation.warehouseConfirmed)
                    return permissionCheck(
                        'warehouse_confirmation',
                        'Raw SQL confirmation',
                        'allowed',
                        'Restrictions are confirmed for the current connection.',
                    );
                return refused(
                    'warehouse_confirmation',
                    'Raw SQL confirmation',
                    AiAccessRefusalReason.AGENT_RAW_SQL_UNCONFIRMED,
                    'warehouse_identity',
                    AgentCapability.RawSql,
                    operation.projectUuid === null
                        ? '/generalSettings/agentIdentity'
                        : getProjectAgentIdentitySettingsPath(
                              operation.projectUuid,
                          ),
                    operation.warehouseStale
                        ? 'The connection changed since it was confirmed.'
                        : undefined,
                );
            },
        },
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
    operation: AgentPolicyEvaluation,
): AgentPolicyDenial | null => {
    if (policy.mode !== 'managed') return null;
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
