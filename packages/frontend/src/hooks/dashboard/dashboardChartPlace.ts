import { matchPath } from 'react-router';

export type DashboardChartPlace =
    | 'savedChart'
    | 'newChart'
    | 'dashboard'
    | 'elsewhere';

const matches = (path: string, pathname: string) =>
    matchPath({ path, end: false }, pathname) !== null;

/** Whether a path is this saved chart's page, or a page below it. */
export const isSavedChartPath = (
    pathname: string,
    projectIdentifier: string | undefined,
    chartIdentifier: string | undefined,
) => {
    if (!projectIdentifier || !chartIdentifier) return false;

    const chartPath = `/projects/${projectIdentifier}/saved/${chartIdentifier}`;
    return pathname.endsWith(chartPath) || pathname.includes(`${chartPath}/`);
};

export const getDashboardChartPlace = (
    pathname: string,
): DashboardChartPlace => {
    if (matches('/projects/:projectUuid/saved/:savedQueryUuid', pathname)) {
        return 'savedChart';
    }
    if (matches('/projects/:projectUuid/tables', pathname)) {
        return 'newChart';
    }
    if (matches('/projects/:projectUuid/dashboards/:dashboardUuid', pathname)) {
        return 'dashboard';
    }
    return 'elsewhere';
};

/** A chart task handed over by a dashboard ends once the user walks away from it. */
export const hasLeftDashboardChart = (
    previous: DashboardChartPlace,
    current: DashboardChartPlace,
) =>
    current === 'elsewhere' ||
    (previous === 'savedChart' && current === 'newChart') ||
    (previous === 'newChart' && current === 'savedChart');

type DroppingDashboardChangesArgs = {
    currentPathname: string;
    nextPathname: string;
    isEditingDashboardChart: boolean;
    hasDashboardChanges: boolean;
    /** Another saved chart is a way out too, and only the page knows its own. */
    isNextTheSameSavedChart: boolean;
};

/** Walking away ends the task, and the dashboard's unsaved edits go with it. */
export const isDroppingDashboardChanges = ({
    currentPathname,
    nextPathname,
    isEditingDashboardChart,
    hasDashboardChanges,
    isNextTheSameSavedChart,
}: DroppingDashboardChangesArgs) => {
    if (!isEditingDashboardChart || !hasDashboardChanges) return false;
    if (currentPathname === nextPathname) return false;
    const current = getDashboardChartPlace(currentPathname);
    const next = getDashboardChartPlace(nextPathname);
    return (
        hasLeftDashboardChart(current, next) ||
        (current === 'savedChart' &&
            next === 'savedChart' &&
            !isNextTheSameSavedChart)
    );
};
