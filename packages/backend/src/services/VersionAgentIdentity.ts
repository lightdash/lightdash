import {
    normalizeAgentIdentityClaim,
    type AgentIdentityClaim,
} from '@lightdash/common';
import { storedVersionAgentIdentity } from '../models/ContentVersionIdentity';

export const withVersionAgentIdentity = <
    T extends {
        agentIdentity?: AgentIdentityClaim | null;
        [storedVersionAgentIdentity]?: AgentIdentityClaim | null;
    },
>(
    version: T,
    enabled: boolean,
): Omit<T, 'agentIdentity' | typeof storedVersionAgentIdentity> & {
    agentIdentity?: AgentIdentityClaim | null;
} => {
    const {
        agentIdentity,
        [storedVersionAgentIdentity]: storedIdentity,
        ...rest
    } = version;
    return {
        ...rest,
        ...(enabled
            ? {
                  agentIdentity: normalizeAgentIdentityClaim(
                      storedIdentity ?? agentIdentity ?? null,
                  ),
              }
            : {}),
    };
};
