import {
    getUserAbilityBuilder,
    OrganizationMemberRole,
    ProjectMemberRole,
    ProjectType,
} from '@lightdash/common';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCanCreateDataApp } from './useCanCreateDataApp';

const PREVIEW_ROLE = 'preview-role';
const projects: Record<
    string,
    { type: ProjectType; createdByUserUuid: string | null }
> = {
    'own-preview': { type: ProjectType.PREVIEW, createdByUserUuid: 'user' },
    'other-preview': { type: ProjectType.PREVIEW, createdByUserUuid: 'other' },
    production: { type: ProjectType.DEFAULT, createdByUserUuid: 'user' },
};

vi.mock('../../../hooks/useProject', () => ({
    useProject: (projectUuid: string) => ({ data: projects[projectUuid] }),
}));
vi.mock('../../../providers/App/useApp', () => ({
    default: () => ({
        user: { data: { userUuid: 'user', organizationUuid: 'org' } },
    }),
}));
vi.mock('../../../providers/Ability/useAbilityContext', () => ({
    useAbilityContext: () =>
        getUserAbilityBuilder({
            user: {
                role: OrganizationMemberRole.INTERACTIVE_VIEWER,
                organizationUuid: 'org',
                userUuid: 'user',
                roleUuid: undefined,
            },
            projectProfiles: Object.entries(projects).map(
                ([projectUuid, project]) => ({
                    projectUuid,
                    role: ProjectMemberRole.INTERACTIVE_VIEWER,
                    userUuid: 'user',
                    roleUuid: PREVIEW_ROLE,
                    projectType: project.type,
                    projectCreatedByUserUuid: project.createdByUserUuid,
                }),
            ),
            permissionsConfig: { pat: { enabled: false, allowedOrgRoles: [] } },
            customRoleScopes: {
                [PREVIEW_ROLE]: [
                    'view:Project',
                    'create:Project@preview',
                    'create:DataApp@preview',
                    'manage:DataApp@preview',
                ],
            },
            customRolesEnabled: true,
        }).builder.build(),
}));

describe('useCanCreateDataApp with create:DataApp@preview', () => {
    it.each([
        { projectUuid: 'own-preview', expected: true },
        { projectUuid: 'other-preview', expected: false },
        { projectUuid: 'production', expected: false },
    ])('$projectUuid: $expected', ({ projectUuid, expected }) => {
        const { result } = renderHook(() => useCanCreateDataApp(projectUuid));
        expect(result.current).toBe(expected);
    });
});
