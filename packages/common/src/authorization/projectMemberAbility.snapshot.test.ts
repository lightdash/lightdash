import { Ability, AbilityBuilder } from '@casl/ability';
import { ProjectMemberRole } from '../types/projectMemberRole';
import { ProjectType } from '../types/projects';
import {
    projectMemberAbilities,
    type ProjectAbilityMember,
} from './projectMemberAbility';
import { type MemberAbility } from './types';

/**
 * Escalation guard: system-role project abilities are derived from
 * `roleToScopeMapping.ts` + `scopes.ts`, so any edit to either file changes
 * the rules every system-role user gets. This snapshot makes that blast
 * radius visible in review — an unexpected diff here means a scope change
 * leaked into system roles.
 */
const PROJECT_UUID = 'project-uuid';
const USER_UUID = 'user-uuid';

const buildRules = (
    role: ProjectMemberRole,
    metadata?: Pick<
        ProjectAbilityMember,
        'projectType' | 'projectCreatedByUserUuid'
    >,
) => {
    const builder = new AbilityBuilder<MemberAbility>(Ability);
    projectMemberAbilities[role](
        { projectUuid: PROJECT_UUID, userUuid: USER_UUID, role, ...metadata },
        builder,
    );
    return builder.rules
        .map((rule) => ({
            action: rule.action,
            subject: rule.subject,
            ...(rule.conditions ? { conditions: rule.conditions } : {}),
        }))
        .sort((a, b) =>
            `${a.subject}:${a.action}`.localeCompare(
                `${b.subject}:${b.action}`,
            ),
        );
};

describe('project system-role rules snapshot', () => {
    it.each(Object.values(ProjectMemberRole))(
        '%s rules match snapshot',
        (role) => {
            expect(buildRules(role)).toMatchSnapshot();
        },
    );

    // Second leg in own-preview context: the `@self` scopes only emit rules
    // when `isSelfPreview` holds, so without this the guard would miss any
    // change to what system-role users get inside previews they created.
    it.each(Object.values(ProjectMemberRole))(
        '%s rules in own preview project match snapshot',
        (role) => {
            expect(
                buildRules(role, {
                    projectType: ProjectType.PREVIEW,
                    projectCreatedByUserUuid: USER_UUID,
                }),
            ).toMatchSnapshot();
        },
    );
});
