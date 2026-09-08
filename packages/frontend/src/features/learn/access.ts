import {
    getAllScopesForRole,
    ProjectMemberRole,
    type ApiError,
    type LearnAccess,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../api';

export const ROLE_ORDER: ProjectMemberRole[] = [
    ProjectMemberRole.VIEWER,
    ProjectMemberRole.INTERACTIVE_VIEWER,
    ProjectMemberRole.EDITOR,
    ProjectMemberRole.DEVELOPER,
    ProjectMemberRole.ADMIN,
];

export const ROLE_LABELS: Record<ProjectMemberRole, string> = {
    [ProjectMemberRole.VIEWER]: 'Viewer',
    [ProjectMemberRole.INTERACTIVE_VIEWER]: 'Interactive viewer',
    [ProjectMemberRole.EDITOR]: 'Editor',
    [ProjectMemberRole.DEVELOPER]: 'Developer',
    [ProjectMemberRole.ADMIN]: 'Admin',
};

/**
 * A role holds a feature when it holds the base scope or a variant it can
 * use without a further grant: `@public` (public spaces) for any role that
 * carries it, and `@space` / `@assigned` (via space access) where the role
 * uses them by default. `@self` (own content only) never makes a role hold
 * the feature.
 */
export const heldScopes = (scopes: string[], holdsSpaceVariants: boolean) =>
    new Set(
        scopes
            .filter((name) => {
                const modifier = name.split('@')[1];
                if (!modifier || modifier === 'public') return true;
                if (modifier === 'self') return false;
                return holdsSpaceVariants;
            })
            .map((name) => name.split('@')[0]),
    );

/**
 * What each system role holds, used to tell a learner what a module they
 * cannot practise yet would take. Editors and above edit public spaces by
 * default, so they hold the space variants; an interactive viewer only
 * carries them in case a space grants access.
 */
export const SYSTEM_ROLE_SCOPES: {
    role: ProjectMemberRole;
    held: Set<string>;
}[] = ROLE_ORDER.map((role, rank) => ({
    role,
    held: heldScopes(
        getAllScopesForRole(role),
        rank >= ROLE_ORDER.indexOf(ProjectMemberRole.EDITOR),
    ),
}));

/**
 * Everything the learner can do, anywhere: their organization role, any
 * organization-level custom roles, and every project role they hold
 * directly or through a group. A grant is a deliberate one wherever it came
 * from, so every variant it carries counts except `@self`.
 */
export const useLearnAccess = () => {
    const query = useQuery<LearnAccess, ApiError>({
        queryKey: ['learn_access'],
        queryFn: () =>
            lightdashApi<LearnAccess>({
                url: '/org/training-project/access',
                method: 'GET',
                body: undefined,
            }),
    });
    return {
        ...query,
        held: heldScopes(query.data?.scopes ?? [], true),
        // Until the instance answers, the library cannot say what the
        // learner holds; it waits rather than showing them an empty shelf.
        isSettled: !query.isLoading,
    };
};
