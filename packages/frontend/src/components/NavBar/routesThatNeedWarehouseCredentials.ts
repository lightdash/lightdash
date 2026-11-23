export const routesThatNeedWarehouseCredentials = [
    '/projects/:projectUuid/tables/:tableId',
    '/projects/:projectUuid/saved/:savedQueryUuid/:mode?',
    '/projects/:projectUuid/dashboards/:dashboardUuid/:mode?',
    '/projects/:projectUuid/sqlRunner',
    '/projects/:projectUuid/apps/:appUuid',
    '/projects/:projectUuid/apps/:appUuid/view',
    '/projects/:projectUuid/apps/:appUuid/versions/:version/view',
];

// Home runs no warehouse queries, so it prompts without reloading on save
export const routesThatPromptForWarehouseCredentials = [
    ...routesThatNeedWarehouseCredentials,
    '/projects/:projectUuid/home',
];
