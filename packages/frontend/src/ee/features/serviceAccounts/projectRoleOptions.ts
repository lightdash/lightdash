import { ProjectMemberRole, ProjectMemberRoleLabels } from '@lightdash/common';

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
