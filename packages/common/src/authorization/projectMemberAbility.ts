import { type AbilityBuilder } from '@casl/ability';
import { type ProjectMemberProfile } from '../types/projectMemberProfile';
import { ProjectMemberRole } from '../types/projectMemberRole';
import { type ProjectType } from '../types/projects';
import { getAllScopesForRole } from './roleToScopeMapping';
import { buildAbilityFromScopes } from './scopeAbilityBuilder';
import { type MemberAbility } from './types';

/**
 * Project membership plus the project metadata needed by `@self` scope
 * conditions (e.g. `manage:ContentAsCode@self` on own preview projects).
 */
export type ProjectAbilityMember = Pick<
    ProjectMemberProfile,
    'role' | 'projectUuid' | 'userUuid'
> & {
    projectType?: ProjectType;
    projectCreatedByUserUuid?: string | null;
};

/**
 * System-role abilities are derived from the same scope vocabulary that
 * powers custom roles (`BASE_ROLE_SCOPES` → `buildAbilityFromScopes`), so
 * `scopes.ts` is the single source of truth for what each role can do.
 * `isEnterprise: true` matches the previous hand-written rules, which always
 * emitted enterprise subjects — enterprise features are license-gated at
 * runtime, not at ability-build time.
 */
const buildProjectRoleAbility =
    (role: ProjectMemberRole) =>
    (
        member: ProjectAbilityMember,
        builder: AbilityBuilder<MemberAbility>,
    ): void => {
        buildAbilityFromScopes(
            {
                projectUuid: member.projectUuid,
                projectType: member.projectType,
                projectCreatedByUserUuid: member.projectCreatedByUserUuid,
                userUuid: member.userUuid,
                scopes: getAllScopesForRole(role),
                isEnterprise: true,
            },
            builder,
        );
    };

// eslint-disable-next-line import/prefer-default-export
export const projectMemberAbilities: Record<
    ProjectMemberRole,
    (
        member: ProjectAbilityMember,
        builder: AbilityBuilder<MemberAbility>,
    ) => void
> = {
    viewer: buildProjectRoleAbility(ProjectMemberRole.VIEWER),
    interactive_viewer: buildProjectRoleAbility(
        ProjectMemberRole.INTERACTIVE_VIEWER,
    ),
    editor: buildProjectRoleAbility(ProjectMemberRole.EDITOR),
    developer: buildProjectRoleAbility(ProjectMemberRole.DEVELOPER),
    admin: buildProjectRoleAbility(ProjectMemberRole.ADMIN),
};
