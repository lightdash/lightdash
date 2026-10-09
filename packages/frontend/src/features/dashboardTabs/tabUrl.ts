type DashboardUrlIdentifierArgs = {
    routeDashboardUuidOrSlug: string | undefined;
    dashboardSlug: string | undefined;
    isEditMode: boolean;
};

// The page keys its provider on the route param, so a tab click in edit mode
// must keep its form or unsaved edits are lost. View mode links use the slug.
export const getDashboardUrlIdentifier = ({
    routeDashboardUuidOrSlug,
    dashboardSlug,
    isEditMode,
}: DashboardUrlIdentifierArgs): string | undefined =>
    isEditMode ? (routeDashboardUuidOrSlug ?? dashboardSlug) : dashboardSlug;

type DashboardTabPathArgs = {
    projectUrlIdentifier: string | undefined;
    dashboardUrlIdentifier: string | undefined;
    isEditMode: boolean;
    tabUuid: string | undefined;
};

export const getDashboardTabPath = ({
    projectUrlIdentifier,
    dashboardUrlIdentifier,
    isEditMode,
    tabUuid,
}: DashboardTabPathArgs): string =>
    `/projects/${projectUrlIdentifier}/dashboards/${dashboardUrlIdentifier}/${
        isEditMode ? 'edit' : 'view'
    }/tabs/${tabUuid}`;
