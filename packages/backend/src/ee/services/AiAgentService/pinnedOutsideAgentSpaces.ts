import { type AiPromptContextItem } from '@lightdash/common';

/** Same rule as the agent's tools: no space list means every space. */
export const isOutsideAgentSpaces = (
    spaceAccess: string[],
    spaceUuid: string | null,
): boolean => {
    if (spaceAccess.length === 0) return false;
    return spaceUuid === null || !spaceAccess.includes(spaceUuid);
};

/** The id of a pinned item the agent's space limits apply to, else null. */
export const spaceScopedPinnedUuid = (
    item: AiPromptContextItem,
): string | null => {
    switch (item.type) {
        case 'dashboard':
            return item.dashboardUuid;
        case 'chart':
            return item.chartUuid;
        case 'data_app':
            return item.appUuid;
        default:
            return null;
    }
};

export const OUTSIDE_AGENT_SPACES_NOTE =
    ' — outside the spaces this agent may use, so you cannot read or change it. Do not search for it; tell the user it is outside your spaces and that an agent with access to it can help.';
