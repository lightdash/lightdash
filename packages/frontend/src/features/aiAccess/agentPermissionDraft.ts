import {
    AgentCapability,
    OrganizationMemberRole,
    assertUnreachable,
    type AgentCapabilityPolicy,
    type AgentCapabilityCeiling,
    type AgentSystemRoleMatrix,
} from '@lightdash/common';

export type AgentPermissionChoice = 'person' | 'read' | 'custom';
export interface AgentPermissionDraft extends Omit<
    AgentCapabilityPolicy,
    'allowedCapabilities'
> {
    allowedCapabilities: AgentCapability[];
}
const allCapabilities = Object.values(AgentCapability);
const roles = Object.values(OrganizationMemberRole);
export const readAndQueryCapabilities = [
    AgentCapability.ReadDiscover,
    AgentCapability.Query,
    AgentCapability.Export,
    AgentCapability.RawSql,
];
const sameSet = <T>(a: T[] | null, b: T[] | null) => {
    if (a === null || b === null) return a === b;
    const left = new Set(a);
    const right = new Set(b);
    return (
        left.size === right.size && [...left].every((value) => right.has(value))
    );
};
const matrixWith = (capabilities: AgentCapability[]): AgentSystemRoleMatrix =>
    Object.fromEntries(
        roles.map((role) => [role, [...capabilities]]),
    ) as AgentSystemRoleMatrix;

export const policyToDraft = (
    policy: AgentCapabilityPolicy,
): AgentPermissionDraft => ({
    mode: policy.mode,
    version: policy.version,
    allowedCapabilities: [
        ...(policy.mode === 'legacy'
            ? allCapabilities
            : (policy.allowedCapabilities ?? allCapabilities)),
    ],
    allowedGroupUuids:
        policy.allowedGroupUuids === null
            ? null
            : [...policy.allowedGroupUuids],
    systemRoleMatrix: Object.fromEntries(
        roles.map((role) => [role, [...policy.systemRoleMatrix[role]]]),
    ) as AgentSystemRoleMatrix,
});
export const sameAgentPermissionDraft = (
    a: AgentPermissionDraft,
    b: AgentPermissionDraft,
): boolean =>
    a.mode === b.mode &&
    sameSet(a.allowedCapabilities, b.allowedCapabilities) &&
    sameSet(a.allowedGroupUuids, b.allowedGroupUuids) &&
    roles.every((role) =>
        sameSet(a.systemRoleMatrix[role], b.systemRoleMatrix[role]),
    );
export const getAgentPermissionChoice = (
    draft: AgentPermissionDraft,
): AgentPermissionChoice => {
    if (draft.mode === 'legacy') return 'person';
    return sameSet(draft.allowedCapabilities, readAndQueryCapabilities) &&
        roles.every((role) =>
            sameSet(draft.systemRoleMatrix[role], readAndQueryCapabilities),
        )
        ? 'read'
        : 'custom';
};
export const chooseAgentPermission = (
    draft: AgentPermissionDraft,
    choice: AgentPermissionChoice,
    baseline: AgentPermissionDraft,
): AgentPermissionDraft => {
    switch (choice) {
        case 'person':
            return {
                ...draft,
                mode: 'legacy',
                allowedCapabilities: [...allCapabilities],
            };
        case 'read':
            return {
                ...draft,
                mode: 'managed',
                allowedCapabilities: [...readAndQueryCapabilities],
                systemRoleMatrix: matrixWith(readAndQueryCapabilities),
            };
        case 'custom':
            return getAgentPermissionChoice(draft) === 'custom'
                ? draft
                : {
                      ...draft,
                      mode: 'managed',
                      allowedCapabilities: [
                          ...(getAgentPermissionChoice(baseline) === 'custom'
                              ? baseline.allowedCapabilities
                              : allCapabilities),
                      ],
                      systemRoleMatrix:
                          getAgentPermissionChoice(baseline) === 'custom'
                              ? baseline.systemRoleMatrix
                              : matrixWith(allCapabilities),
                  };
        default:
            return assertUnreachable(choice, 'Unknown agent permission choice');
    }
};
export const normaliseAgentPermissionDraft = (
    draft: AgentPermissionDraft,
): AgentPermissionDraft => {
    const allowed = new Set(draft.allowedCapabilities);
    return {
        ...draft,
        systemRoleMatrix: Object.fromEntries(
            roles.map((role) => [
                role,
                draft.systemRoleMatrix[role].filter((cap) => allowed.has(cap)),
            ]),
        ) as AgentSystemRoleMatrix,
    };
};
export const toggleAgentCapability = (
    draft: AgentPermissionDraft,
    capability: AgentCapability,
): AgentPermissionDraft => {
    const allowed = new Set(draft.allowedCapabilities);
    const enabled = !allowed.has(capability);
    return {
        ...draft,
        allowedCapabilities: allCapabilities.filter((cap) =>
            cap === capability ? enabled : allowed.has(cap),
        ),
        systemRoleMatrix: Object.fromEntries(
            roles.map((role) => {
                const row = new Set(draft.systemRoleMatrix[role]);
                return [
                    role,
                    allCapabilities.filter((cap) =>
                        cap === capability ? enabled : row.has(cap),
                    ),
                ];
            }),
        ) as AgentSystemRoleMatrix,
    };
};
export const draftToPolicyRequest = (
    baseline: AgentPermissionDraft,
    draft: AgentPermissionDraft,
): AgentCapabilityCeiling => ({
    version: baseline.version,
    mode: draft.mode,
    allowedCapabilities:
        draft.mode === 'legacy' ? null : draft.allowedCapabilities,
    systemRoleMatrix: normaliseAgentPermissionDraft(draft).systemRoleMatrix,
    ...(!sameSet(baseline.allowedGroupUuids, draft.allowedGroupUuids)
        ? { allowedGroupUuids: draft.allowedGroupUuids }
        : {}),
});
export interface AgentPermissionChanges {
    stops: AgentCapability[];
    allows: AgentCapability[];
    roles: {
        role: OrganizationMemberRole;
        stops: AgentCapability[];
        allows: AgentCapability[];
    }[];
    groups: { allowedGroupUuids: string[] | null } | null;
    mode: AgentCapabilityPolicy['mode'] | null;
    turnedOff: boolean;
}
export const getAgentPermissionChanges = (
    baseline: AgentPermissionDraft,
    draft: AgentPermissionDraft,
): AgentPermissionChanges => {
    const before = new Set(
        baseline.mode === 'legacy'
            ? allCapabilities
            : baseline.allowedCapabilities,
    );
    const after = new Set(
        draft.mode === 'legacy' ? allCapabilities : draft.allowedCapabilities,
    );
    const stops = allCapabilities.filter(
        (cap) => before.has(cap) && !after.has(cap),
    );
    const allows = allCapabilities.filter(
        (cap) => !before.has(cap) && after.has(cap),
    );
    const unchanged = allCapabilities.filter(
        (cap) => before.has(cap) && after.has(cap),
    );
    const roleChanges = roles
        .map((role) => {
            const oldRow = new Set(
                baseline.mode === 'legacy'
                    ? allCapabilities
                    : baseline.systemRoleMatrix[role],
            );
            const newRow = new Set(
                draft.mode === 'legacy'
                    ? allCapabilities
                    : draft.systemRoleMatrix[role],
            );
            return {
                role,
                stops: unchanged.filter(
                    (cap) => oldRow.has(cap) && !newRow.has(cap),
                ),
                allows: unchanged.filter(
                    (cap) => !oldRow.has(cap) && newRow.has(cap),
                ),
            };
        })
        .filter((row) => row.stops.length > 0 || row.allows.length > 0);
    return {
        stops,
        allows,
        roles: roleChanges,
        groups: sameSet(baseline.allowedGroupUuids, draft.allowedGroupUuids)
            ? null
            : { allowedGroupUuids: draft.allowedGroupUuids },
        mode: baseline.mode === draft.mode ? null : draft.mode,
        turnedOff: draft.mode === 'managed' && after.size === 0,
    };
};
export const countAgentPermissionChanges = (
    changes: AgentPermissionChanges,
    baseline: AgentPermissionDraft,
    draft: AgentPermissionDraft,
): number => {
    const choice = getAgentPermissionChoice(draft);
    if (choice !== 'custom' && choice !== getAgentPermissionChoice(baseline))
        return 1 + Number(changes.groups !== null);
    return (
        changes.stops.length +
        changes.allows.length +
        changes.roles.reduce(
            (count, row) => count + row.stops.length + row.allows.length,
            0,
        ) +
        Number(changes.mode !== null) +
        Number(changes.groups !== null)
    );
};
