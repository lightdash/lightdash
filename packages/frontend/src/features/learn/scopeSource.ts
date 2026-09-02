import {
    getAllScopeMap,
    getAllScopesForRole,
    type ProjectMemberRole,
} from '@lightdash/common';
import { type Scope, type ScopeSource } from '@lightdash/learn-ui';

/** The in-app ScopeSource: the live RBAC registry from @lightdash/common. */
export const commonScopeSource: ScopeSource = {
    getAllScopeMap: (opts) =>
        getAllScopeMap(opts) as unknown as Record<string, Scope>,
    getAllScopesForRole: (role) =>
        getAllScopesForRole(role as ProjectMemberRole),
};
