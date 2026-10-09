type DashboardUrlIdentifierArgs = {
    routeDashboardUuidOrSlug: string | undefined;
    dashboardSlug: string | undefined;
};

// Tab and mode navigation stays inside one dashboard, so it must not change
// the identifier form: the page keys its provider on the route param.
export const getDashboardUrlIdentifier = ({
    routeDashboardUuidOrSlug,
    dashboardSlug,
}: DashboardUrlIdentifierArgs): string | undefined =>
    routeDashboardUuidOrSlug ?? dashboardSlug;

type DashboardModePathArgs = {
    projectUrlIdentifier: string | undefined;
    dashboardUrlIdentifier: string | undefined;
    isEditMode: boolean;
};

export const getDashboardModePath = ({
    projectUrlIdentifier,
    dashboardUrlIdentifier,
    isEditMode,
}: DashboardModePathArgs): string =>
    `/projects/${projectUrlIdentifier}/dashboards/${dashboardUrlIdentifier}/${
        isEditMode ? 'edit' : 'view'
    }`;

type DashboardTabPathArgs = DashboardModePathArgs & {
    tabUuid: string | undefined;
};

export const getDashboardTabPath = ({
    tabUuid,
    ...modePathArgs
}: DashboardTabPathArgs): string =>
    `${getDashboardModePath(modePathArgs)}/tabs/${tabUuid}`;
