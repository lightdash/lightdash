import { subject } from '@casl/ability';
import { OrganizationMemberRole } from '../types/organizationMemberProfile';
import { ProjectMemberRole } from '../types/projectMemberRole';
import { ProjectType } from '../types/projects';
import { getUserAbilityBuilder, type ProjectAbilityProfile } from './index';

const ORG_UUID = 'org-a';
const OTHER_ORG_UUID = 'org-b';
const CREATOR_UUID = 'creator-user';
const OTHER_USER_UUID = 'other-user';
const UPSTREAM_UUID = 'upstream-project';
const OTHER_UPSTREAM_UUID = 'other-upstream-project';
const PREVIEW_UUID = 'preview-project';
const SELF_ROLE_UUID = '44444444-4444-4444-a444-444444444444';

const PERMISSIONS_CONFIG = {
    pat: { enabled: false, allowedOrgRoles: [] },
};

const SELF_PREVIEW_SCOPES = [
    'view:Project',
    'create:Job',
    'manage:CompileProject',
    'create:Project@preview',
    'update:Project@self',
];

type PreviewSubject = {
    organizationUuid?: string;
    upstreamProjectUuid?: string;
    createdByUserUuid?: string;
};

const previewSubject = ({
    organizationUuid = ORG_UUID,
    upstreamProjectUuid = UPSTREAM_UUID,
    createdByUserUuid = CREATOR_UUID,
}: PreviewSubject = {}) =>
    subject('Project', {
        organizationUuid,
        projectUuid: PREVIEW_UUID,
        type: ProjectType.PREVIEW,
        upstreamProjectUuid,
        createdByUserUuid,
    });

const uuidOnlySubject = () =>
    subject('Project', {
        organizationUuid: ORG_UUID,
        projectUuid: PREVIEW_UUID,
    });

const buildAbility = ({
    userUuid = CREATOR_UUID,
    role = OrganizationMemberRole.MEMBER,
    roleUuid,
    projectProfiles = [],
}: {
    userUuid?: string;
    role?: OrganizationMemberRole;
    roleUuid?: string;
    projectProfiles?: (Omit<ProjectAbilityProfile, 'userUuid' | 'roleUuid'> & {
        roleUuid?: string;
    })[];
}) =>
    getUserAbilityBuilder({
        user: {
            role,
            organizationUuid: ORG_UUID,
            userUuid,
            roleUuid,
        },
        projectProfiles: projectProfiles.map((profile) => ({
            ...profile,
            roleUuid: profile.roleUuid,
            userUuid,
        })),
        permissionsConfig: PERMISSIONS_CONFIG,
        customRoleScopes: { [SELF_ROLE_UUID]: SELF_PREVIEW_SCOPES },
        customRolesEnabled: true,
    }).builder.build();

const upstreamSelfRole = (projectUuid = UPSTREAM_UUID) => ({
    projectUuid,
    role: ProjectMemberRole.VIEWER,
    roleUuid: SELF_ROLE_UUID,
});

const previewSelfRole = (createdBy = CREATOR_UUID) => ({
    projectUuid: PREVIEW_UUID,
    role: ProjectMemberRole.VIEWER,
    roleUuid: SELF_ROLE_UUID,
    projectType: ProjectType.PREVIEW,
    projectCreatedByUserUuid: createdBy,
});

describe('update:Project on a preview (preview refresh)', () => {
    describe('custom role with update:Project@self', () => {
        it.each([
            ['org-level', { roleUuid: SELF_ROLE_UUID }],
            ['upstream project', { projectProfiles: [upstreamSelfRole()] }],
            [
                'copied preview membership',
                { projectProfiles: [previewSelfRole()] },
            ],
        ])('lets the creator update their preview (%s)', (_, args) => {
            const ability = buildAbility(args);
            expect(ability.can('update', previewSubject())).toBe(true);
        });

        it.each([
            ['org-level', { roleUuid: SELF_ROLE_UUID }],
            ['upstream project', { projectProfiles: [upstreamSelfRole()] }],
            [
                'copied preview membership',
                { projectProfiles: [previewSelfRole()] },
            ],
        ])(
            'cannot match a subject without type and creator (%s)',
            (_, args) => {
                const ability = buildAbility(args);
                expect(ability.can('update', uuidOnlySubject())).toBe(false);
            },
        );

        it.each([
            ['org-level', { roleUuid: SELF_ROLE_UUID }],
            ['upstream project', { projectProfiles: [upstreamSelfRole()] }],
            [
                'copied preview membership',
                { projectProfiles: [previewSelfRole(OTHER_USER_UUID)] },
            ],
        ])('denies a preview someone else created (%s)', (_, args) => {
            const ability = buildAbility(args);
            expect(
                ability.can(
                    'update',
                    previewSubject({ createdByUserUuid: OTHER_USER_UUID }),
                ),
            ).toBe(false);
        });

        it('denies a creator-owned preview in another organization', () => {
            const ability = buildAbility({ roleUuid: SELF_ROLE_UUID });
            expect(
                ability.can(
                    'update',
                    previewSubject({ organizationUuid: OTHER_ORG_UUID }),
                ),
            ).toBe(false);
        });

        it('denies a preview of a project outside the role assignment', () => {
            const ability = buildAbility({
                projectProfiles: [upstreamSelfRole(OTHER_UPSTREAM_UUID)],
            });
            expect(ability.can('update', previewSubject())).toBe(false);
        });

        it('does not reach a non-preview project', () => {
            const ability = buildAbility({ roleUuid: SELF_ROLE_UUID });
            expect(
                ability.can(
                    'update',
                    subject('Project', {
                        organizationUuid: ORG_UUID,
                        projectUuid: UPSTREAM_UUID,
                        type: ProjectType.DEFAULT,
                        createdByUserUuid: CREATOR_UUID,
                    }),
                ),
            ).toBe(false);
        });
    });

    describe('built-in roles', () => {
        it.each([
            OrganizationMemberRole.ADMIN,
            OrganizationMemberRole.DEVELOPER,
        ])('org %s can update any preview in the org', (role) => {
            const ability = buildAbility({ role, userUuid: OTHER_USER_UUID });
            expect(ability.can('update', previewSubject())).toBe(true);
            expect(
                ability.can(
                    'update',
                    previewSubject({ organizationUuid: OTHER_ORG_UUID }),
                ),
            ).toBe(false);
        });

        it.each([
            OrganizationMemberRole.MEMBER,
            OrganizationMemberRole.VIEWER,
            OrganizationMemberRole.INTERACTIVE_VIEWER,
            OrganizationMemberRole.EDITOR,
        ])('org %s cannot update a preview, even one they created', (role) => {
            const ability = buildAbility({ role });
            expect(ability.can('update', previewSubject())).toBe(false);
        });

        it('project developer on the copied preview membership can update it', () => {
            const ability = buildAbility({
                projectProfiles: [
                    {
                        projectUuid: PREVIEW_UUID,
                        role: ProjectMemberRole.DEVELOPER,
                    },
                ],
            });
            expect(ability.can('update', previewSubject())).toBe(true);
        });

        it.each([
            ProjectMemberRole.VIEWER,
            ProjectMemberRole.INTERACTIVE_VIEWER,
            ProjectMemberRole.EDITOR,
        ])('project %s on the preview cannot update it', (role) => {
            const ability = buildAbility({
                projectProfiles: [{ projectUuid: PREVIEW_UUID, role }],
            });
            expect(ability.can('update', previewSubject())).toBe(false);
        });

        it('project developer on another project cannot update the preview', () => {
            const ability = buildAbility({
                projectProfiles: [
                    {
                        projectUuid: OTHER_UPSTREAM_UUID,
                        role: ProjectMemberRole.DEVELOPER,
                    },
                ],
            });
            expect(ability.can('update', previewSubject())).toBe(false);
        });
    });
});
