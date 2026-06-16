export type CapableAgentRef = { uuid: string; name: string };

export type ContentEditCalloutActions = {
    showEnable: boolean;
    routeAgent: CapableAgentRef | null;
};

// Decides which callout actions to show from real state only — no LLM, no network.
export function getContentEditCalloutActions({
    canManageAgent,
    capableAgent,
}: {
    canManageAgent: boolean;
    capableAgent: CapableAgentRef | null;
}): ContentEditCalloutActions {
    return {
        showEnable: canManageAgent,
        routeAgent: capableAgent,
    };
}

// True when the callout has at least one action to offer.
export function hasContentEditCalloutActions(
    actions: ContentEditCalloutActions,
): boolean {
    return actions.showEnable || actions.routeAgent !== null;
}
