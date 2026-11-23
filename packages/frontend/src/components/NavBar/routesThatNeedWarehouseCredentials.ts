import { matchPath, matchRoutes, type Location } from 'react-router';

const routesThatNeedWarehouseCredentials = [
    '/projects/:projectUuid/tables/:tableId',
    '/projects/:projectUuid/saved/:savedQueryUuid/:mode?',
    '/projects/:projectUuid/dashboards/:dashboardUuid/:mode?',
    '/projects/:projectUuid/dashboards/:dashboardUuid/:mode/tabs/:tabUuid?',
    '/projects/:projectUuid/sqlRunner',
    '/projects/:projectUuid/apps/:appUuid',
    '/projects/:projectUuid/apps/:appUuid/view',
    '/projects/:projectUuid/apps/:appUuid/versions/:version/view',
];

// Home runs no warehouse queries, so it prompts without reloading on save
const routesThatPromptForWarehouseCredentials = [
    ...routesThatNeedWarehouseCredentials,
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
