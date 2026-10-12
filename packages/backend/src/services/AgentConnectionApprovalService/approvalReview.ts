import {
    AgentCapability,
    AiAccessRefusalReason,
    QuerySourceType,
    type AgentConnectionApprovalCapability,
    type AgentConnectionApprovalProject,
    type AgentPermissionCheck,
} from '@lightdash/common';
import {
    GRANT_OPERATION_CONTRACTS,
    sourceEffectCapabilities,
    supportsAgentConnectionCapability,
    uploadEffectCapabilities,
} from '../../auth/agentConnectionGrants/operationContracts';
import { parseGrantResourceConstraints } from '../../auth/agentConnectionGrants/resourceConstraints';
import { getRequiredAgentCapabilities } from '../../auth/agentPermissions/capabilityMap';
import { type ApprovalSelection } from '../../database/entities/agentConnectionApprovalRequests';
import { type AgentPermissionBulkArgs } from '../AgentPermissionService/agentPermissionBulkEvaluation';
import { AgentConnectionApprovalError } from './AgentConnectionApprovalError';

export type ApprovalCapability = AgentConnectionApprovalCapability;
export type ApprovalProject = AgentConnectionApprovalProject;

export const approvalOperationCatalogue = Object.entries(
    GRANT_OPERATION_CONTRACTS,
).flatMap(([key, contract]) => {
    const required = getRequiredAgentCapabilities('rest', key);
    const base = [
        ...new Set([
            ...(required ?? []),
            ...(contract.kind === 'content_upload'
                ? [AgentCapability.DeployUpload]
                : []),
        ]),
    ];
    let effects: AgentCapability[] = [];
    if (contract.kind === 'content_upload') {
        effects = uploadEffectCapabilities({ verified: true });
    } else if (
        contract.kind === 'source_queries' ||
        contract.kind === 'source_schema'
    ) {
        effects = sourceEffectCapabilities(Object.values(QuerySourceType));
    }
    return [
        { key, capabilities: base, mapped: required !== null },
        ...(effects.length
            ? [
                  {
                      key,
                      capabilities: [...new Set([...base, ...effects])],
                      mapped: required !== null,
                  },
              ]
            : []),
    ];
});

export const scheduledRefreshCapabilities = [AgentCapability.DeployUpload];

const reasons = {
    unsupported: 'This action is not available for connections.',
    unavailable: 'The available permissions could not be checked.',
    role_denied: 'Your role in this project does not allow this action.',
    person_permission:
        'Your permissions in this project do not allow this action.',
    agents_disabled: 'Agents are turned off for this organisation.',
    project_denied: 'Agents are turned off for this project.',
    person_not_admitted: 'This person is not allowed to use agents.',
    action_disabled: 'This action is turned off for agents.',
    scheduled_pre_aggregate_refresh:
        'Not available while this project has a scheduled pre-aggregate refresh.',
} as const;

type ReasonCode = keyof typeof reasons;
const refusalCode = (check: AgentPermissionCheck | undefined): ReasonCode => {
    switch (check?.reason) {
        case AiAccessRefusalReason.AGENT_USER_NOT_ALLOWED:
            return 'person_not_admitted';
        case AiAccessRefusalReason.AGENT_ACCESS_DISABLED:
            return 'agents_disabled';
        case AiAccessRefusalReason.AGENT_PROJECT_DENIED:
            return 'project_denied';
        case AiAccessRefusalReason.AGENT_SETTING_DENIED:
            return 'action_disabled';
        case AiAccessRefusalReason.AGENT_CAPABILITY_DENIED:
            return check.policyLayer === 'org_ceiling'
                ? 'role_denied'
                : 'action_disabled';
        default:
            return 'unavailable';
    }
};

export const reviewOperations = (
    projectUuid: string,
): AgentPermissionBulkArgs['operations'] => [
    { projectUuid, kind: 'agent_turn', key: 'agent_turn' },
    ...Object.values(AgentCapability)
        .filter(supportsAgentConnectionCapability)
        .map((key) => ({ projectUuid, kind: 'capability' as const, key })),
];

export const mapApprovalProject = ({
    project,
    requested,
    operations,
    checks,
    scheduledRefresh,
    personAllows,
}: {
    project: Pick<ApprovalProject, 'projectUuid' | 'name'>;
    requested: AgentCapability[];
    operations: AgentPermissionBulkArgs['operations'];
    checks: (AgentPermissionCheck | null | undefined)[];
    scheduledRefresh: boolean | null;
    personAllows: (capability: AgentCapability) => boolean;
}): ApprovalProject => {
    const read = (kind: string, key: string) =>
        checks[
            operations.findIndex((op) => op.kind === kind && op.key === key)
        ];
    const admission = read('agent_turn', 'agent_turn');
    const admissionCode = admission ? refusalCode(admission) : null;
    const structural =
        admissionCode !== null &&
        ['agents_disabled', 'project_denied', 'person_not_admitted'].includes(
            admissionCode,
        );
    return {
        ...project,
        selectable: !structural,
        reason: structural ? reasons[admissionCode] : null,
        capabilities: requested.map((capability) => {
            const entry = (
                visibility: ApprovalCapability['visibility'],
                reasonCode: ReasonCode | null,
            ): ApprovalCapability => ({
                capability,
                visibility,
                reasonCode,
                reason: reasonCode === null ? null : reasons[reasonCode],
            });
            if (!supportsAgentConnectionCapability(capability))
                return entry('hidden', 'unsupported');
            if (!personAllows(capability))
                return entry('blocked', 'person_permission');
            if (
                scheduledRefreshCapabilities.includes(capability) &&
                scheduledRefresh !== false
            )
                return entry(
                    'blocked',
                    scheduledRefresh === true
                        ? 'scheduled_pre_aggregate_refresh'
                        : 'unavailable',
                );
            const check = read('capability', capability);
            if (check === null) return entry('offered', null);
            return entry('blocked', refusalCode(check));
        }),
    };
};

export const sealSelection = ({
    requested,
    displayed,
    current,
    selectedProjects,
    selectedCapabilities,
}: {
    requested: { projects: string[] | null; capabilities: AgentCapability[] };
    displayed: ApprovalProject[];
    current: ApprovalProject[];
    selectedProjects: string[];
    selectedCapabilities: AgentCapability[];
}): { changed: boolean; selection: ApprovalSelection | null } => {
    const offered = (project: ApprovalProject, capability: AgentCapability) =>
        project.capabilities.some(
            (c) => c.capability === capability && c.visibility === 'offered',
        );
    if (
        selectedProjects.length === 0 ||
        new Set(selectedProjects).size !== selectedProjects.length ||
        new Set(selectedCapabilities).size !== selectedCapabilities.length ||
        selectedProjects.some(
            (uuid) =>
                (requested.projects !== null &&
                    !requested.projects.includes(uuid)) ||
                !displayed.some((p) => p.projectUuid === uuid && p.selectable),
        ) ||
        selectedCapabilities.some(
            (capability) =>
                !requested.capabilities.includes(capability) ||
                !displayed.some(
                    (p) =>
                        selectedProjects.includes(p.projectUuid) &&
                        offered(p, capability),
                ),
        )
    )
        throw new AgentConnectionApprovalError('invalid_approval_request');
    if (
        selectedProjects.some(
            (uuid) =>
                !current.some((p) => p.projectUuid === uuid && p.selectable),
        )
    )
        return { changed: true, selection: null };
    let changed = false;
    const projectCapabilities = Object.fromEntries(
        selectedProjects.map((uuid) => {
            const before = displayed.find((p) => p.projectUuid === uuid)!;
            const now = current.find((p) => p.projectUuid === uuid)!;
            if (
                before.capabilities.some(
                    (c) =>
                        c.visibility === 'offered' &&
                        requested.capabilities.includes(c.capability) &&
                        !offered(now, c.capability),
                )
            )
                changed = true;
            return [
                uuid,
                selectedCapabilities.filter(
                    (c) =>
                        requested.capabilities.includes(c) &&
                        offered(before, c) &&
                        offered(now, c),
                ),
            ];
        }),
    );
    const selection: ApprovalSelection = {
        approvedProjectUuids: [...selectedProjects],
        approvedCapabilities: [
            ...new Set(Object.values(projectCapabilities).flat()),
        ],
        resourceConstraints: { version: 2, projectCapabilities },
    };
    const parsed = parseGrantResourceConstraints(selection);
    if (parsed?.version !== 2)
        throw new AgentConnectionApprovalError('invalid_approval_request');
    return {
        changed,
        selection: { ...selection, resourceConstraints: parsed },
    };
};
