import {
    isScopeAssignableAtLevel,
    AGENT_CAPABILITY_DEFAULTS,
    AGENT_CAPABILITY_SCOPES,
    type RoleLevel,
    type RolePreset,
    type ScopeName,
} from '@lightdash/common';
import { getScopeNamesWithDependencies } from './scopeUtils';

export const getRolePresetScopes = (
    preset: RolePreset,
    level: RoleLevel,
    agentCapabilitiesEnabled = false,
): ScopeName[] => [
    ...new Set(
        [...preset.scopes, ...getNewRoleAgentScopes(agentCapabilitiesEnabled)]
            .flatMap(getScopeNamesWithDependencies)
            .filter((scope) => isScopeAssignableAtLevel(scope, level)),
    ),
];

export const getNewRoleAgentScopes = (enabled: boolean): ScopeName[] =>
    enabled
        ? AGENT_CAPABILITY_DEFAULTS.map(
              (capability) => AGENT_CAPABILITY_SCOPES[capability],
          )
        : [];
