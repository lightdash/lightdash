import { subject, type AbilityBuilder } from '@casl/ability';
import {
    FilterInteractivityValues,
    type CreateEmbedJwt,
    type EffectiveEmbedPermissions,
} from '../ee';
import type { OssEmbed } from '../types/auth';
import { ScopeGroup } from '../types/scopes';
import assertUnreachable from '../utils/assertUnreachable';
import { parseScope } from './parseScopes';
import { getScopes } from './scopes';
import {
    EMBED_PERMISSION_SUBJECTS,
    type EmbedPermission,
    type MemberAbility,
} from './types';

type EmbedPermissionContext = {
    embed: Pick<OssEmbed, 'organization' | 'projectUuid'>;
    embedWriteUserAbility?: MemberAbility;
};

/** Project only embed capabilities, never the actor's regular-app abilities. */
export const applyEmbedScopeAbilities = ({
    embedUser,
    embed,
    embedWriteUserAbility,
    builder,
}: EmbedPermissionContext & {
    embedUser: CreateEmbedJwt;
    builder: Pick<AbilityBuilder<MemberAbility>, 'can'>;
}): void => {
    if (!embedUser.writeActions || !embedWriteUserAbility) return;

    const target = {
        organizationUuid: embed.organization.organizationUuid,
        projectUuid: embed.projectUuid,
    };

    getScopes({ isEnterprise: true })
        .filter((scope) => scope.group === ScopeGroup.EMBED)
        .forEach((scope) => {
            const [action, resource] = parseScope(scope.name);
            if (
                embedWriteUserAbility.can(
                    action,
                    subject(resource, { ...target }),
                )
            ) {
                builder.can(action, resource, target);
            }
        });
};

/**
 * @deprecated Compatibility adapter for existing JWT options and flag consumers.
 * New capabilities use the embed account's CASL ability, not this mapping.
 */
export const getEffectiveEmbedPermissions = ({
    embedUser,
    embed,
    embedWriteUserAbility,
}: EmbedPermissionContext & {
    embedUser: CreateEmbedJwt;
}): EffectiveEmbedPermissions => {
    const { content } = embedUser;
    const hasEmbedScope = (permission: EmbedPermission): boolean =>
        !!embedUser.writeActions &&
        embedWriteUserAbility?.can(
            'view',
            subject(EMBED_PERMISSION_SUBJECTS[permission], {
                organizationUuid: embed.organization.organizationUuid,
                projectUuid: embed.projectUuid,
            }),
        ) === true;
    const isGranted = (
        permission: EmbedPermission,
        jwtValue: boolean | undefined,
    ) => (hasEmbedScope(permission) ? true : jwtValue);

    switch (content.type) {
        case 'dashboard': {
            const filterInteractivityFromScope = hasEmbedScope(
                'dashboardFiltersInteractivity',
            );
            const addFiltersFromScope = hasEmbedScope('canAddFilters');
            const dashboardFiltersInteractivity =
                filterInteractivityFromScope || addFiltersFromScope
                    ? {
                          ...content.dashboardFiltersInteractivity,
                          enabled: filterInteractivityFromScope
                              ? FilterInteractivityValues.all
                              : (content.dashboardFiltersInteractivity
                                    ?.enabled ?? false),
                          canAddFilters: isGranted(
                              'canAddFilters',
                              content.dashboardFiltersInteractivity
                                  ?.canAddFilters,
                          ),
                      }
                    : content.dashboardFiltersInteractivity;

            return {
                dashboardFiltersInteractivity,
                parameterInteractivity: hasEmbedScope('parameterInteractivity')
                    ? { enabled: true }
                    : content.parameterInteractivity,
                canExportCsv: isGranted('canExportCsv', content.canExportCsv),
                canExportDashboardCsv: isGranted(
                    'canExportDashboardCsv',
                    content.canExportDashboardCsv,
                ),
                canExportImages: isGranted(
                    'canExportImages',
                    content.canExportImages,
                ),
                canExportPagePdf: isGranted(
                    'canExportPagePdf',
                    content.canExportPagePdf,
                ),
                canDateZoom: isGranted('canDateZoom', content.canDateZoom),
                canExplore: isGranted('canExplore', content.canExplore),
                canViewUnderlyingData: isGranted(
                    'canViewUnderlyingData',
                    content.canViewUnderlyingData,
                ),
                canViewDataApps: isGranted(
                    'canViewDataApps',
                    content.canViewDataApps,
                ),
            };
        }
        case 'chart':
            return {
                canExportCsv: isGranted('canExportCsv', content.canExportCsv),
                canExportImages: isGranted(
                    'canExportImages',
                    content.canExportImages,
                ),
                canViewUnderlyingData: isGranted(
                    'canViewUnderlyingData',
                    content.canViewUnderlyingData,
                ),
            };
        case 'aiAgent':
        case 'metricsCatalog':
            return {
                canExplore: isGranted('canExplore', content.canExplore),
            };
        case 'dataApp':
        case 'apiAccess':
            return {};
        default:
            return assertUnreachable(
                content,
                'Unknown embed content type when resolving permissions',
            );
    }
};
