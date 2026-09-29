import { subject } from '@casl/ability';
import { type SettingsContext } from './types';

type DataAppsSettingsAccessInput = Pick<
    SettingsContext,
    | 'user'
    | 'organization'
    | 'dataAppsFlag'
    | 'dataAppAnalysisFlag'
    | 'organizationChartTypesFlag'
>;

export type DataAppsSettingsAccess = {
    canManageThemes: boolean;
    canManageOrganizationChartTypes: boolean;
    canViewActivity: boolean;
    canManageAiAnalysis: boolean;
    landingPath: string | null;
};

export const getDataAppsSettingsAccess = ({
    user,
    organization,
    dataAppsFlag,
    dataAppAnalysisFlag,
    organizationChartTypesFlag,
}: DataAppsSettingsAccessInput): DataAppsSettingsAccess | null => {
    if (!dataAppsFlag?.enabled) return null;

    const canManageThemes =
        user?.ability.can('manage', 'OrganizationDesign') ?? false;
    const canViewActivity =
        user?.ability.can('manage', 'Organization') ?? false;
    const canManageAiAnalysis =
        canViewActivity && dataAppAnalysisFlag?.enabled === true;
    const canManageOrganizationChartTypes =
        organizationChartTypesFlag?.enabled === true &&
        (user?.ability.can(
            'manage',
            subject('OrganizationChartType', {
                organizationUuid: organization?.organizationUuid,
            }),
        ) ??
            false);

    // Land on whichever sub-page the user can actually reach.
    const landingPath = canManageThemes
        ? '/generalSettings/dataApps/themes'
        : canManageOrganizationChartTypes
          ? '/generalSettings/dataApps/chartTypes'
          : canViewActivity
            ? '/generalSettings/dataApps/activity'
            : null;

    return {
        canManageThemes,
        canManageOrganizationChartTypes,
        canViewActivity,
        canManageAiAnalysis,
        landingPath,
    };
};
