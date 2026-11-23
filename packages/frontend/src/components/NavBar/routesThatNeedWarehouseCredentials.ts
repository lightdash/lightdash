import { matchPath, matchRoutes, type Location } from 'react-router';

const routesThatNeedWarehouseCredentials = [
    '/projects/:projectUuid/tables/:tableId',
    '/projects/:projectUuid/saved/:savedQueryUuid/:mode?',
    '/projects/:projectUuid/dashboards/:dashboardUuid/view?',
    '/projects/:projectUuid/dashboards/:dashboardUuid/view/tabs/:tabUuid?',
    '/projects/:projectUuid/sqlRunner',
    '/projects/:projectUuid/apps/:appUuid',
    '/projects/:projectUuid/apps/:appUuid/view',
    '/projects/:projectUuid/apps/:appUuid/versions/:version/view',
];

// These prompt without reloading on save: home runs no warehouse queries, and
// a reload would discard unsaved dashboard edits
const routesThatPromptForWarehouseCredentials = [
    ...routesThatNeedWarehouseCredentials,
    '/projects/:projectUuid/dashboards/:dashboardUuid/edit',
    '/projects/:projectUuid/dashboards/:dashboardUuid/edit/tabs/:tabUuid?',
    '/projects/:projectUuid/home',
];

// The new-app composer matches apps/:appUuid but runs no queries, and a
// reload there would discard the unsent prompt
const APP_COMPOSER_ROUTE = '/projects/:projectUuid/apps/generate';

const matchesAny = (paths: string[], location: Location) =>
    !matchPath(APP_COMPOSER_ROUTE, location.pathname) &&
    !!matchRoutes(
        paths.map((path) => ({ path })),
        location,
    );

export const isRouteThatNeedsWarehouseCredentials = (location: Location) =>
    matchesAny(routesThatNeedWarehouseCredentials, location);

export const isRouteThatPromptsForWarehouseCredentials = (location: Location) =>
    matchesAny(routesThatPromptForWarehouseCredentials, location);
