import {
    ProjectMemberRole,
    ProjectMemberRoleLabels,
    ServiceAccountScope,
} from '@lightdash/common';
import { type TFunction } from 'i18next';

// One project-access row. The role is a tagged selection parsed at submit time:
// `system:<ProjectMemberRole>` → { role } or `role:<roleUuid>` → { roleUuid }.
export type ProjectRoleRow = {
    projectUuid: string;
    roleSelection: string;
};

// Project-mode system role options. Mirrors the org-mode `scope:` / `role:`
// convention so the two pickers feel symmetric.
export const SYSTEM_PROJECT_ROLE_OPTIONS = [
    ProjectMemberRole.VIEWER,
    ProjectMemberRole.INTERACTIVE_VIEWER,
    ProjectMemberRole.EDITOR,
    ProjectMemberRole.DEVELOPER,
    ProjectMemberRole.ADMIN,
].map((role) => ({
    value: `system:${role}`,
    label: ProjectMemberRoleLabels[role],
}));

export const DEFAULT_PROJECT_ROLE_SELECTION = `system:${ProjectMemberRole.VIEWER}`;

// Organization-mode role options. `Member` is intentionally hidden — it's the
// backend marker for "Project-scope SA", never a user-selectable org role.
export const getSystemRoleOptions = (
    t: TFunction,
): { value: string; label: string }[] => [
    {
        value: `scope:${ServiceAccountScope.SYSTEM_VIEWER}`,
        label: t('roles.viewer'),
    },
    {
        value: `scope:${ServiceAccountScope.SYSTEM_INTERACTIVE_VIEWER}`,
        label: t('roles.interactiveViewer'),
    },
    {
        value: `scope:${ServiceAccountScope.SYSTEM_EDITOR}`,
        label: t('roles.editor'),
    },
    {
        value: `scope:${ServiceAccountScope.SYSTEM_DEVELOPER}`,
        label: t('roles.developer'),
    },
    {
        value: `scope:${ServiceAccountScope.SYSTEM_ADMIN}`,
        label: t('roles.admin'),
    },
];
