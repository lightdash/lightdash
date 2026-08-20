import {
    isScopeAssignableAtLevel,
    type RoleLevel,
    type RolePreset,
    type ScopeName,
} from '@lightdash/common';
import { getScopeNamesWithDependencies } from './scopeUtils';

export const getRolePresetScopes = (
    preset: RolePreset,
    level: RoleLevel,
): ScopeName[] => [
    ...new Set(
        preset.scopes
            .flatMap(getScopeNamesWithDependencies)
            .filter((scope) => isScopeAssignableAtLevel(scope, level)),
    ),
];
