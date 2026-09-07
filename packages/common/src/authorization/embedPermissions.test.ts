import { Ability, AbilityBuilder, subject } from '@casl/ability';
import {
    FilterInteractivityValues,
    type CreateEmbedJwt,
    type EffectiveEmbedPermissions,
} from '../ee';
import { ScopeGroup, type ScopeContext } from '../types/scopes';
import {
    applyEmbedScopeAbilities,
    getEffectiveEmbedPermissions,
} from './embedPermissions';
import { applyOrganizationMemberStaticAbilities } from './organizationMemberAbility';
import { ORGANIZATION_EDITOR } from './organizationMemberAbility.mock';
import { projectMemberAbilities } from './projectMemberAbility';
import { PROJECT_EDITOR } from './projectMemberAbility.mock';
import { buildAbilityFromScopes } from './scopeAbilityBuilder';
import * as scopeRegistry from './scopes';
import {
    EMBED_PERMISSION_SUBJECTS,
    EMBED_PERMISSIONS,
    type EmbedPermission,
    type MemberAbility,
} from './types';

const embed = {
    projectUuid: PROJECT_EDITOR.projectUuid,
    organization: {
        organizationUuid: ORGANIZATION_EDITOR.organizationUuid,
        name: 'Test',
    },
};
const writeActions = { userUuid: 'actor', spaceUuid: 'space' };
const dashboard = { type: 'dashboard', dashboardUuid: 'dashboard' } as const;
const customAbility = (
    permissions: readonly EmbedPermission[],
    context: Pick<ScopeContext, 'organizationUuid' | 'projectUuid'> = {
        projectUuid: embed.projectUuid,
    },
    isEnterprise = true,
) => {
    const builder = new AbilityBuilder<MemberAbility>(Ability);
    buildAbilityFromScopes(
        {
            userUuid: 'actor',
            scopes: permissions.map(
                (permission) => `view:${EMBED_PERMISSION_SUBJECTS[permission]}`,
            ),
            isEnterprise,
            ...(context.organizationUuid
                ? { organizationUuid: context.organizationUuid }
                : { projectUuid: context.projectUuid! }),
        },
        builder,
    );
    return builder.build();
};
const valueFor = (
    permissions: EffectiveEmbedPermissions,
    permission: EmbedPermission,
) => {
    switch (permission) {
        case 'dashboardFiltersInteractivity':
            return permissions.dashboardFiltersInteractivity?.enabled;
        case 'canAddFilters':
            return permissions.dashboardFiltersInteractivity?.canAddFilters;
        case 'parameterInteractivity':
            return permissions.parameterInteractivity?.enabled;
        default:
            return permissions[permission];
    }
};

describe('embed scope abilities', () => {
    const projectScopes = (
        actor: MemberAbility,
        embedUser: CreateEmbedJwt = { content: dashboard, writeActions },
    ) => {
        const builder = new AbilityBuilder<MemberAbility>(Ability);
        applyEmbedScopeAbilities({
            embedUser,
            embed,
            embedWriteUserAbility: actor,
            builder,
        });
        return builder.build();
    };

    it('exposes actor scopes on the embed ability without granting regular-app access', () => {
        const ability = projectScopes(customAbility(EMBED_PERMISSIONS));
        expect(ability.rules).toHaveLength(EMBED_PERMISSIONS.length);
        expect(
            ability.can(
                'view',
                subject('EmbedExplore', {
                    projectUuid: embed.projectUuid,
                    organizationUuid: embed.organization.organizationUuid,
                }),
            ),
        ).toBe(true);
        expect(ability.can('view', 'Explore')).toBe(false);
        expect(ability.can('manage', 'Organization')).toBe(false);
    });

    it.each([
        { projectUuid: 'another-project' },
        { organizationUuid: 'another-org' },
    ])('does not import grants from another target: %j', (context) => {
        expect(
            projectScopes(customAbility(EMBED_PERMISSIONS, context)).rules,
        ).toEqual([]);
    });

    it('narrows organization grants to the embed project', () => {
        const ability = projectScopes(
            customAbility(['canExplore'], {
                organizationUuid: embed.organization.organizationUuid,
            }),
        );
        expect(
            ability.can(
                'view',
                subject('EmbedExplore', {
                    organizationUuid: embed.organization.organizationUuid,
                    projectUuid: 'another-project',
                }),
            ),
        ).toBe(false);
    });

    it('ignores actor scopes without writeActions', () => {
        expect(
            projectScopes(customAbility(EMBED_PERMISSIONS), {
                content: dashboard,
            }).rules,
        ).toEqual([]);
    });

    it('does not grant scopes for an unresolved write actor', () => {
        const builder = new AbilityBuilder<MemberAbility>(Ability);
        applyEmbedScopeAbilities({
            embedUser: { content: dashboard, writeActions },
            embed,
            builder,
        });
        expect(builder.rules).toEqual([]);
    });

    it('discovers a new action from the scope registry without a JWT mapping', () => {
        const scopes = scopeRegistry.getScopes({ isEnterprise: true });
        const registry = vi.spyOn(scopeRegistry, 'getScopes').mockReturnValue([
            ...scopes,
            {
                name: 'manage:EmbedExplore',
                description: 'Scope-only capability',
                isEnterprise: true,
                group: ScopeGroup.EMBED,
                dependencies: [],
                getConditions: () => [{ projectUuid: embed.projectUuid }],
            },
        ]);
        try {
            const actor = new AbilityBuilder<MemberAbility>(Ability);
            actor.can('manage', 'EmbedExplore', {
                projectUuid: embed.projectUuid,
            });
            const ability = projectScopes(actor.build());
            expect(
                ability.can(
                    'manage',
                    subject('EmbedExplore', {
                        projectUuid: embed.projectUuid,
                        organizationUuid: embed.organization.organizationUuid,
                    }),
                ),
            ).toBe(true);
        } finally {
            registry.mockRestore();
        }
    });
});

describe('effective embed permissions', () => {
    it('builds independent embed subjects using only standard project conditions', () => {
        const ability = customAbility(EMBED_PERMISSIONS);
        expect(ability.rules).toHaveLength(EMBED_PERMISSIONS.length);
        EMBED_PERMISSIONS.forEach((permission) => {
            expect(ability.rules).toContainEqual({
                action: 'view',
                subject: EMBED_PERMISSION_SUBJECTS[permission],
                conditions: { projectUuid: embed.projectUuid },
            });
        });
    });

    it('does not grant regular-app permissions through embed capability scopes', () => {
        const ability = customAbility(EMBED_PERMISSIONS);
        [
            'Explore',
            'ExportCsv',
            'UnderlyingData',
            'Dashboard',
            'SavedChart',
            'DataApp',
        ].forEach((name) => {
            const resource = subject(name, {
                projectUuid: embed.projectUuid,
                organizationUuid: embed.organization.organizationUuid,
            });
            expect(ability.can('view', resource)).toBe(false);
            expect(ability.can('manage', resource)).toBe(false);
        });
    });

    it('does not infer embed capabilities from regular-app custom scopes', () => {
        const builder = new AbilityBuilder<MemberAbility>(Ability);
        buildAbilityFromScopes(
            {
                userUuid: 'actor',
                projectUuid: embed.projectUuid,
                scopes: [
                    'manage:Explore',
                    'manage:ExportCsv',
                    'view:UnderlyingData',
                ],
                isEnterprise: true,
            },
            builder,
        );
        const result = getEffectiveEmbedPermissions({
            embedUser: { content: dashboard, writeActions },
            embed,
            embedWriteUserAbility: builder.build(),
        });
        EMBED_PERMISSIONS.forEach((permission) =>
            expect(valueFor(result, permission)).toBeUndefined(),
        );
    });

    it.each([undefined, false, true])(
        'preserves legacy direct flags set to %s without an actor',
        (flag) => {
            const content = {
                ...dashboard,
                canExportCsv: flag,
                canExportDashboardCsv: flag,
                canExportImages: flag,
                canExportPagePdf: flag,
                canDateZoom: flag,
                canExplore: flag,
                canViewUnderlyingData: flag,
                canViewDataApps: flag,
            };
            const result = getEffectiveEmbedPermissions({
                embedUser: { content },
                embed,
            });
            const { type, dashboardUuid, ...expected } = content;
            expect(result).toMatchObject(expected);
        },
    );

    it.each([true, false, ...Object.values(FilterInteractivityValues)])(
        'preserves legacy filter mode %s and restrictions without adding defaults',
        (enabled) => {
            const filters = {
                enabled,
                allowedFilters: ['region'],
                hidden: true,
            };
            const parameters = { enabled: false };
            const result = getEffectiveEmbedPermissions({
                embedUser: {
                    content: {
                        ...dashboard,
                        dashboardFiltersInteractivity: filters,
                        parameterInteractivity: parameters,
                    },
                },
                embed,
            });
            expect(result.dashboardFiltersInteractivity).toEqual(filters);
            expect(result.dashboardFiltersInteractivity).not.toHaveProperty(
                'canAddFilters',
            );
            expect(result.parameterInteractivity).toEqual(parameters);
        },
    );

    it('leaves omitted options undefined, including the legacy PDF default', () => {
        const result = getEffectiveEmbedPermissions({
            embedUser: { content: dashboard },
            embed,
        });
        EMBED_PERMISSIONS.forEach((permission) =>
            expect(valueFor(result, permission)).toBeUndefined(),
        );
        expect(result.canExportPagePdf ?? true).toBe(true);
    });

    it('ignores supplied actor abilities when the JWT has no writeActions', () => {
        const result = getEffectiveEmbedPermissions({
            embedUser: { content: { ...dashboard, canExplore: false } },
            embed,
            embedWriteUserAbility: customAbility(EMBED_PERMISSIONS),
        });
        expect(result.canExplore).toBe(false);
        expect(result.canExportCsv).toBeUndefined();
        expect(result.dashboardFiltersInteractivity).toBeUndefined();
    });

    it('does not grant scopes for an unresolved write actor', () => {
        const result = getEffectiveEmbedPermissions({
            embedUser: { content: dashboard, writeActions },
            embed,
        });
        EMBED_PERMISSIONS.forEach((permission) =>
            expect(valueFor(result, permission)).toBeUndefined(),
        );
    });

    it.each(EMBED_PERMISSIONS)(
        'grants only the selected custom scope: %s',
        (permission) => {
            const result = getEffectiveEmbedPermissions({
                embedUser: { content: dashboard, writeActions },
                embed,
                embedWriteUserAbility: customAbility([permission]),
            });
            EMBED_PERMISSIONS.forEach((other) =>
                expect(Boolean(valueFor(result, other))).toBe(
                    other === permission,
                ),
            );
        },
    );

    it.each([
        { jwt: false, scope: false, expected: false },
        { jwt: true, scope: false, expected: true },
        { jwt: false, scope: true, expected: true },
        { jwt: true, scope: true, expected: true },
        { jwt: undefined, scope: false, expected: undefined },
        { jwt: undefined, scope: true, expected: true },
    ])(
        'combines JWT $jwt and scope $scope with OR',
        ({ jwt, scope, expected }) => {
            const result = getEffectiveEmbedPermissions({
                embedUser: {
                    content: { ...dashboard, canExplore: jwt },
                    writeActions,
                },
                embed,
                embedWriteUserAbility: customAbility(
                    scope ? ['canExplore'] : [],
                ),
            });
            expect(result.canExplore).toBe(expected);
        },
    );

    it('upgrades structured flags without mutating the JWT or hiding configuration', () => {
        const content = {
            ...dashboard,
            dashboardFiltersInteractivity: {
                enabled: false,
                canAddFilters: false,
                hidden: true,
                allowedFilters: null,
            },
            parameterInteractivity: { enabled: false },
        };
        const original = structuredClone(content);
        const result = getEffectiveEmbedPermissions({
            embedUser: { content, writeActions },
            embed,
            embedWriteUserAbility: customAbility([
                'dashboardFiltersInteractivity',
                'canAddFilters',
                'parameterInteractivity',
            ]),
        });
        expect(result.dashboardFiltersInteractivity).toEqual({
            ...content.dashboardFiltersInteractivity,
            enabled: FilterInteractivityValues.all,
            canAddFilters: true,
        });
        expect(result.parameterInteractivity).toEqual({ enabled: true });
        expect(content).toEqual(original);
    });

    it.each([
        { projectUuid: 'another-project' },
        { organizationUuid: 'another-org' },
    ])(
        'rejects a grant scoped outside the embedded resource: %j',
        (context) => {
            const result = getEffectiveEmbedPermissions({
                embedUser: {
                    content: { ...dashboard, canExplore: false },
                    writeActions,
                },
                embed,
                embedWriteUserAbility: customAbility(['canExplore'], context),
            });
            expect(result.canExplore).toBe(false);
        },
    );

    it('accepts an organization-scoped custom grant', () => {
        expect(
            getEffectiveEmbedPermissions({
                embedUser: { content: dashboard, writeActions },
                embed,
                embedWriteUserAbility: customAbility(['canExplore'], {
                    organizationUuid: embed.organization.organizationUuid,
                }),
            }).canExplore,
        ).toBe(true);
    });

    it('filters enterprise-only scopes out of unlicensed custom abilities', () => {
        expect(
            getEffectiveEmbedPermissions({
                embedUser: { content: dashboard, writeActions },
                embed,
                embedWriteUserAbility: customAbility(
                    ['canExplore'],
                    { projectUuid: embed.projectUuid },
                    false,
                ),
            }).canExplore,
        ).toBeUndefined();
    });

    it.each(['project', 'organization'] as const)(
        'grants editor defaults from the %s layer',
        (layer) => {
            const builder = new AbilityBuilder<MemberAbility>(Ability);
            if (layer === 'project')
                projectMemberAbilities.editor(PROJECT_EDITOR, builder);
            else
                applyOrganizationMemberStaticAbilities.editor(
                    ORGANIZATION_EDITOR,
                    builder,
                );
            const result = getEffectiveEmbedPermissions({
                embedUser: { content: dashboard, writeActions },
                embed,
                embedWriteUserAbility: builder.build(),
            });
            EMBED_PERMISSIONS.forEach((permission) =>
                expect(Boolean(valueFor(result, permission))).toBe(true),
            );
        },
    );

    it.each([
        {
            type: 'chart',
            contentId: 'chart',
            canExportCsv: true,
            canExportImages: false,
            canViewUnderlyingData: true,
        },
        { type: 'aiAgent', agentUuid: 'agent', canExplore: true },
        { type: 'metricsCatalog', canExplore: true },
    ] satisfies CreateEmbedJwt['content'][])(
        'preserves legacy $type flags',
        (content) => {
            const result = getEffectiveEmbedPermissions({
                embedUser: { content },
                embed,
            });
            Object.entries(result).forEach(([key, value]) =>
                expect(value).toBe(content[key as keyof typeof content]),
            );
        },
    );
});
