import { Ability, AbilityBuilder, subject } from '@casl/ability';
import { type CreateEmbedJwt } from '../ee';
import { ScopeGroup, type ScopeContext } from '../types/scopes';
import { applyEmbedScopeAbilities } from './embedPermissions';
import { applyEmbeddedAbility } from './jwtAbility';
import { ORGANIZATION_EDITOR } from './organizationMemberAbility.mock';
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

describe('legacy flags OR embed scopes', () => {
    it.each([
        ['canExplore', 'EmbedExplore', 'view', 'Explore'],
        [
            'canViewUnderlyingData',
            'EmbedUnderlyingData',
            'view',
            'UnderlyingData',
        ],
        ['canExportCsv', 'EmbedCsvExport', 'export', 'Dashboard'],
        ['canExportImages', 'EmbedImageExport', 'export', 'Dashboard'],
        ['canExportPagePdf', 'EmbedPagePdfExport', 'export', 'Dashboard'],
        [
            'canExportDashboardCsv',
            'EmbedDashboardCsvExport',
            'manage',
            'ExportCsv',
        ],
        ['canDateZoom', 'EmbedDateZoom', 'view', 'Dashboard'],
        ['canViewDataApps', 'EmbedDataApps', 'view', 'DataApp'],
    ] as const)(
        '%s preserves legacy grants and accepts actor scopes',
        (flag, scope, action, resource) => {
            for (const legacy of [undefined, false, true]) {
                for (const hasActor of [false, true]) {
                    for (const granted of [false, true]) {
                        const actor = new AbilityBuilder<MemberAbility>(
                            Ability,
                        );
                        if (granted)
                            actor.can('view', scope, {
                                projectUuid: embed.projectUuid,
                            });
                        const builder = new AbilityBuilder<MemberAbility>(
                            Ability,
                        );
                        const token: CreateEmbedJwt = {
                            content: { ...dashboard, [flag]: legacy },
                            ...(hasActor ? { writeActions } : {}),
                        };
                        const original = structuredClone(token);
                        applyEmbedScopeAbilities({
                            embedUser: token,
                            embed,
                            embedWriteUserAbility: actor.build(),
                            builder,
                        });
                        const embedContent = {
                            type: 'dashboard',
                            dashboardUuid: 'dashboard',
                            chartUuids: [],
                            explores: [],
                        } as const;
                        applyEmbeddedAbility(
                            token,
                            { ...embedContent, chartUuids: [], explores: [] },
                            {
                                ...embed,
                                encodedSecret: '',
                                dashboardUuids: [],
                                chartUuids: [],
                                appUuids: [],
                                allowAllApps: false,
                                allowAllCharts: false,
                                allowAllDashboards: false,
                                createdAt: '',
                                user: {
                                    userUuid: 'creator',
                                    firstName: '',
                                    lastName: '',
                                },
                            },
                            'external',
                            builder,
                        );
                        expect(
                            builder.build().can(
                                action,
                                subject(resource, {
                                    projectUuid: embed.projectUuid,
                                    organizationUuid:
                                        embed.organization.organizationUuid,
                                    type: {
                                        canExportCsv: 'csv',
                                        canExportImages: 'images',
                                        canExportPagePdf: 'pdf',
                                    }[
                                        flag as
                                            | 'canExportCsv'
                                            | 'canExportImages'
                                            | 'canExportPagePdf'
                                    ],
                                    dateZoom: true,
                                    metadata: { dashboardUuid: 'dashboard' },
                                }),
                            ),
                        ).toBe(legacy === true || (hasActor && granted));
                        expect(token).toEqual(original);
                    }
                }
            }
        },
    );
});
