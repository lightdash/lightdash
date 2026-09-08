import {
    getAllScopesForRole,
    ProjectMemberRole,
    type ApiError,
    type LearnRole,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../api';

/**
 * A role the library can be viewed as: the five system roles, and the org's
 * own custom roles (CS-267). A view is its label and the set of features it
 * holds, so the library filters and annotates by scope membership rather
 * than by where a role sits on the system ladder, which a custom role has
 * no place on.
 */
export type LearnRoleView = {
    /** A system role's name, or a custom role's uuid. */
    key: string;
    label: string;
    custom: boolean;
    /** The base scopes the role holds, modifier variants resolved. */
    held: Set<string>;
};

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
const heldScopes = (scopes: string[], holdsSpaceVariants: boolean) =>
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
 * The system roles, the same on every instance. Editors and above edit
 * public spaces by default, so they hold the space variants; an interactive
 * viewer only carries them in case a space grants access.
 */
export const SYSTEM_ROLE_VIEWS: LearnRoleView[] = ROLE_ORDER.map(
    (role, rank) => ({
        key: role,
        label: ROLE_LABELS[role],
        custom: false,
        held: heldScopes(
            getAllScopesForRole(role),
            rank >= ROLE_ORDER.indexOf(ProjectMemberRole.EDITOR),
        ),
    }),
);

/** One system role's view, by role. */
export const systemRoleView = (role: ProjectMemberRole): LearnRoleView =>
    SYSTEM_ROLE_VIEWS[ROLE_ORDER.indexOf(role)];

/**
 * A custom role holds every variant it was given: unlike a system role, a
 * `@space` scope in a custom role is a deliberate grant rather than a
 * ladder's leftover.
 */
export const customRoleView = (role: LearnRole): LearnRoleView => ({
    key: role.roleUuid,
    label: role.name,
    custom: true,
    held: heldScopes(role.scopes, true),
});

/** The system roles in rank order, then the org's own, alphabetical. */
export const buildRoleViews = (
    customRoles: LearnRole[] | undefined,
): LearnRoleView[] => [
    ...SYSTEM_ROLE_VIEWS,
    ...(customRoles ?? [])
        .map(customRoleView)
        .sort((a, b) => a.label.localeCompare(b.label)),
];

/**
 * The view that is the learner's own role: their custom role when they hold
 * one, else the system role their organization role matches. Null when the
 * organization role is one the library has no view for (a member with no
 * custom role), so nothing is marked as theirs.
 */
export const ownRoleView = (
    views: LearnRoleView[],
    user: { role?: string; roleUuid?: string } | undefined,
): LearnRoleView | null =>
    views.find((view) => view.custom && view.key === user?.roleUuid) ??
    views.find((view) => !view.custom && view.key === user?.role) ??
    null;

/**
 * The view the library opens on: the learner's own role, else viewer, which
 * is what everyone in an organization can at least do.
 */
export const defaultRoleView = (
    views: LearnRoleView[],
    user: { role?: string; roleUuid?: string } | undefined,
): LearnRoleView => ownRoleView(views, user) ?? views[0];

/**
 * The org's custom roles, as views. An org admin gets all of them; every
 * other learner gets the one they hold. An instance without custom roles
 * answers with none, and the library shows the system roles alone.
 */
export const useLearnRoles = () =>
    useQuery<LearnRole[], ApiError>({
        queryKey: ['learn_roles'],
        queryFn: () =>
            lightdashApi<LearnRole[]>({
                url: '/org/training-project/roles',
                method: 'GET',
                body: undefined,
            }),
    });
