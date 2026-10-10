import {
    normalizeAgentIdentityClaim,
    type AgentIdentityClaim,
} from '@lightdash/common';

export const withVersionAgentIdentity = <
    T extends { agentIdentity?: AgentIdentityClaim | null },
>(
    version: T,
    enabled: boolean,
): T => {
    const { agentIdentity, ...rest } = version;
    return {
        ...rest,
        ...(enabled
            ? {
                  agentIdentity: normalizeAgentIdentityClaim(
                      agentIdentity ?? null,
                  ),
              }
            : {}),
    } as T;
};
