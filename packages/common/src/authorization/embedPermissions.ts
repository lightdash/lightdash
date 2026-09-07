import { subject } from '@casl/ability';
import {
    FilterInteractivityValues,
    type CreateEmbedJwt,
    type EffectiveEmbedPermissions,
} from '../ee';
import type { OssEmbed } from '../types/auth';
import assertUnreachable from '../utils/assertUnreachable';
import type { EmbedPermission, MemberAbility } from './types';

type EmbedPermissionContext = {
    embed: Pick<OssEmbed, 'organization' | 'projectUuid'>;
    embedWriteUserAbility?: MemberAbility;
};

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
            subject('Embed', {
                organizationUuid: embed.organization.organizationUuid,
                projectUuid: embed.projectUuid,
                permission,
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
