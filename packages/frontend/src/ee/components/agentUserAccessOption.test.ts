import {
    OrganizationMemberRole,
    ProjectMemberRole,
    type InheritedRoles,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { type ProjectUserWithRole } from '../../hooks/useProjectUsersWithRoles';
import { getAgentUserAccessOption } from './agentUserAccessOption';

const inherited = (
    organization: ProjectMemberRole | undefined,
    group: ProjectMemberRole | undefined = undefined,
    project: ProjectMemberRole | undefined = undefined,
): InheritedRoles => [
    { type: 'organization', role: organization },
    { type: 'group', role: group },
    { type: 'project', role: project },
];

const user = (
    overrides: Partial<ProjectUserWithRole> = {},
): ProjectUserWithRole =>
    ({
        userUuid: 'user-1',
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        role: ProjectMemberRole.VIEWER,
        finalRole: OrganizationMemberRole.MEMBER,
        projectUuid: 'project-1',
        inheritedRole: inherited(undefined),
        hasCustomRole: false,
        ...overrides,
    }) as ProjectUserWithRole;

describe('getAgentUserAccessOption', () => {
    it('lists interactive viewers and editors with their system role label', () => {
        expect(
            getAgentUserAccessOption(
                user({
                    inheritedRole: inherited(
                        undefined,
                        undefined,
                        ProjectMemberRole.EDITOR,
                    ),
                }),
            ),
        ).toMatchObject({
            userUuid: 'user-1',
            label: 'Ada Lovelace',
            roleLabel: 'Editor',
        });
        expect(
            getAgentUserAccessOption(
                user({
                    inheritedRole: inherited(
                        ProjectMemberRole.INTERACTIVE_VIEWER,
                    ),
                }),
            )?.roleLabel,
        ).toBe('Interactive Viewer');
    });

    it('hides admins and developers because they can always manage agents', () => {
        expect(
            getAgentUserAccessOption(
                user({ inheritedRole: inherited(ProjectMemberRole.ADMIN) }),
            ),
        ).toBeNull();
        expect(
            getAgentUserAccessOption(
                user({
                    inheritedRole: inherited(
                        undefined,
                        ProjectMemberRole.DEVELOPER,
                    ),
                    hasCustomRole: true,
                }),
            ),
        ).toBeNull();
    });

    it('hides viewers and members with no project access', () => {
        expect(
            getAgentUserAccessOption(
                user({ inheritedRole: inherited(ProjectMemberRole.VIEWER) }),
            ),
        ).toBeNull();
        expect(getAgentUserAccessOption(user())).toBeNull();
    });

    it('lists users whose only project access comes from a custom role', () => {
        expect(
            getAgentUserAccessOption(user({ hasCustomRole: true })),
        ).toMatchObject({
            userUuid: 'user-1',
            label: 'Ada Lovelace',
            roleLabel: 'Custom role',
        });
    });

    it('lists a system viewer who also holds a custom role', () => {
        expect(
            getAgentUserAccessOption(
                user({
                    inheritedRole: inherited(ProjectMemberRole.VIEWER),
                    hasCustomRole: true,
                }),
            )?.roleLabel,
        ).toBe('Custom role');
    });

    it('falls back to the email when the user has no name', () => {
        expect(
            getAgentUserAccessOption(
                user({ firstName: '', lastName: '', hasCustomRole: true }),
            )?.label,
        ).toBe('ada@example.com');
    });
});
