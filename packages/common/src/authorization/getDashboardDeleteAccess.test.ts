import { Ability, AbilityBuilder, subject } from '@casl/ability';
import { ProjectMemberRole } from '../types/projectMemberRole';
import { SpaceMemberRole, type SpaceAccess } from '../types/space';
import { getDashboardDeleteAccess } from './getDashboardDeleteAccess';
import { projectMemberAbilities } from './projectMemberAbility';
import { buildAbilityFromScopes } from './scopeAbilityBuilder';
import { type MemberAbility } from './types';

const context = {
    organizationUuid: 'org',
    projectUuid: 'project',
    userUuid: 'user',
};

const editorGrant: Pick<SpaceAccess, 'userUuid' | 'role' | 'grantedVia'> = {
    userUuid: context.userUuid,
    role: SpaceMemberRole.EDITOR,
    grantedVia: 'dashboard',
};

const buildAbility = (scopes?: string[]) => {
    const builder = new AbilityBuilder<MemberAbility>(Ability);
    if (scopes) {
        buildAbilityFromScopes(
            {
                projectUuid: context.projectUuid,
                userUuid: context.userUuid,
                scopes,
                isEnterprise: true,
            },
            builder,
        );
    } else {
        projectMemberAbilities.editor(
            { ...context, role: ProjectMemberRole.EDITOR },
            builder,
        );
    }
    return builder.build();
};

describe.each([
    { name: 'built-in editor', scopes: undefined },
    { name: 'custom space manager', scopes: ['manage:Dashboard@space'] },
])('$name dashboard deletion', ({ scopes }) => {
    const ability = buildAbility(scopes);

    test.each([
        { name: 'direct editor', access: [editorGrant], allowed: false },
        {
            name: 'direct full access',
            access: [{ ...editorGrant, role: SpaceMemberRole.ADMIN }],
            allowed: true,
        },
        {
            name: 'space editor',
            access: [{ ...editorGrant, grantedVia: undefined }],
            allowed: true,
        },
        {
            name: 'direct editor plus space viewer',
            access: [
                editorGrant,
                {
                    ...editorGrant,
                    grantedVia: undefined,
                    role: SpaceMemberRole.VIEWER,
                },
            ],
            allowed: false,
        },
        {
            name: 'direct viewer plus space editor',
            access: [
                { ...editorGrant, role: SpaceMemberRole.VIEWER },
                { ...editorGrant, grantedVia: undefined },
            ],
            allowed: true,
        },
        {
            name: 'direct user editor plus group admin',
            access: [
                editorGrant,
                { ...editorGrant, role: SpaceMemberRole.ADMIN },
            ],
            allowed: true,
        },
        { name: 'no access (including flag off)', access: [], allowed: false },
        {
            name: 'another user full access',
            access: [
                {
                    ...editorGrant,
                    userUuid: 'other',
                    role: SpaceMemberRole.ADMIN,
                },
            ],
            allowed: false,
        },
    ])('$name: allowed=$allowed', ({ access, allowed }) => {
        expect(
            ability.can(
                'delete',
                subject('Dashboard', {
                    ...context,
                    inheritsFromOrgOrProject: false,
                    access: getDashboardDeleteAccess(access),
                }),
            ),
        ).toBe(allowed);
    });

    it('keeps editing authorized by the original grant', () => {
        const access = [editorGrant];
        getDashboardDeleteAccess(access);
        expect(
            ability.can('update', subject('Dashboard', { ...context, access })),
        ).toBe(true);
        expect(access).toEqual([editorGrant]);
    });
});

it('preserves unconditional custom-role deletion rights', () => {
    expect(
        buildAbility(['manage:Dashboard']).can(
            'delete',
            subject('Dashboard', {
                ...context,
                access: getDashboardDeleteAccess([editorGrant]),
            }),
        ),
    ).toBe(true);
});

it('does not supply missing project capabilities to full access', () => {
    expect(
        buildAbility(['view:Dashboard']).can(
            'delete',
            subject('Dashboard', {
                ...context,
                access: getDashboardDeleteAccess([
                    { ...editorGrant, role: SpaceMemberRole.ADMIN },
                ]),
            }),
        ),
    ).toBe(false);
});

it('preserves grants sourced from other content types', () => {
    const access: Pick<SpaceAccess, 'role' | 'grantedVia'>[] = [
        { role: SpaceMemberRole.EDITOR, grantedVia: 'saved_chart' },
        { role: SpaceMemberRole.EDITOR, grantedVia: 'sql_chart' },
        { role: SpaceMemberRole.EDITOR, grantedVia: 'app' },
    ];
    expect(getDashboardDeleteAccess(access)).toEqual(access);
});
