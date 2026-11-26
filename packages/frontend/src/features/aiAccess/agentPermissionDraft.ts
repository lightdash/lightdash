import {
    AgentCapability,
    assertUnreachable,
    type AgentCapabilityPolicy,
    type AgentCapabilityCeiling,
} from '@lightdash/common';

export type AgentPermissionChoice = 'person' | 'custom';
export interface AgentPermissionDraft extends Omit<
    AgentCapabilityPolicy,
    'allowedCapabilities'
> {
    /** False means agents have no restrictions and the switches are unused. */
    restricted: boolean;
    allowedCapabilities: AgentCapability[];
}
const allCapabilities = Object.values(AgentCapability);
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
export const policyToDraft = (
    policy: AgentCapabilityPolicy,
): AgentPermissionDraft => ({
    restricted: policy.allowedCapabilities !== null,
    version: policy.version,
    allowedCapabilities: [...(policy.allowedCapabilities ?? allCapabilities)],
    allowedGroupUuids:
        policy.allowedGroupUuids === null
            ? null
            : [...policy.allowedGroupUuids],
});
export const sameAgentPermissionDraft = (
    a: AgentPermissionDraft,
    b: AgentPermissionDraft,
): boolean =>
    a.restricted === b.restricted &&
    sameSet(a.allowedCapabilities, b.allowedCapabilities) &&
    sameSet(a.allowedGroupUuids, b.allowedGroupUuids);
export const getAgentPermissionChoice = (
    draft: AgentPermissionDraft,
): AgentPermissionChoice => {
    return draft.restricted ? 'custom' : 'person';
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
                restricted: false,
                allowedCapabilities: [...allCapabilities],
            };
        case 'custom':
            return getAgentPermissionChoice(draft) === 'custom'
                ? draft
                : {
                      ...draft,
                      restricted: true,
                      allowedCapabilities: [
                          ...(getAgentPermissionChoice(baseline) === 'custom'
                              ? baseline.allowedCapabilities
                              : allCapabilities),
                      ],
                  };
        default:
            return assertUnreachable(choice, 'Unknown agent permission choice');
    }
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
    };
};
export const draftToPolicyRequest = (
    baseline: AgentPermissionDraft,
    draft: AgentPermissionDraft,
): AgentCapabilityCeiling => ({
    version: baseline.version,
    allowedCapabilities: draft.restricted ? draft.allowedCapabilities : null,
    ...(!sameSet(baseline.allowedGroupUuids, draft.allowedGroupUuids)
        ? { allowedGroupUuids: draft.allowedGroupUuids }
        : {}),
});
export interface AgentPermissionChanges {
    stops: AgentCapability[];
    allows: AgentCapability[];
    groups: { allowedGroupUuids: string[] | null } | null;
    /** Whether restrictions were turned on or off; null when unchanged. */
    restricted: boolean | null;
    turnedOff: boolean;
}
export const getAgentPermissionChanges = (
    baseline: AgentPermissionDraft,
    draft: AgentPermissionDraft,
): AgentPermissionChanges => {
    const before = new Set(
        baseline.restricted ? baseline.allowedCapabilities : allCapabilities,
    );
    const after = new Set(
        draft.restricted ? draft.allowedCapabilities : allCapabilities,
    );
    const stops = allCapabilities.filter(
        (cap) => before.has(cap) && !after.has(cap),
    );
    const allows = allCapabilities.filter(
        (cap) => !before.has(cap) && after.has(cap),
    );
    return {
        stops,
        allows,
        groups: sameSet(baseline.allowedGroupUuids, draft.allowedGroupUuids)
            ? null
            : { allowedGroupUuids: draft.allowedGroupUuids },
        restricted:
            baseline.restricted === draft.restricted ? null : draft.restricted,
        turnedOff: draft.restricted && after.size === 0,
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
        Number(changes.restricted !== null) +
        Number(changes.groups !== null)
    );
};
