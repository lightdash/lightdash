type DashboardUrlIdentifierArgs = {
    routeDashboardUuidOrSlug: string | undefined;
    dashboardSlug: string | undefined;
};

// Tab navigation stays inside one dashboard, so it must not change the
// identifier form: the page keys its provider on the route param.
export const getDashboardUrlIdentifier = ({
    routeDashboardUuidOrSlug,
    dashboardSlug,
}: DashboardUrlIdentifierArgs): string | undefined =>
    routeDashboardUuidOrSlug ?? dashboardSlug;

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
