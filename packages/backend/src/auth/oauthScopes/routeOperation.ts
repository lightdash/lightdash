import { type Request, type RequestHandler } from 'express';
import { validate as isUuid } from 'uuid';
import { OAUTH_CASL_CHECKED_ROUTES } from './caslCheckedRoutes';
import {
    getOAuthScopeOperation,
    OAUTH_UNCHECKED_OPERATIONS,
} from './unchecked';

const operations = new Set([
    ...OAUTH_CASL_CHECKED_ROUTES,
    ...Object.keys(OAUTH_UNCHECKED_OPERATIONS),
]);
const controllerOperations = new Map(
    [...operations]
        .filter((operation) => /^[\w]+Controller\w*\.\w+$/.test(operation))
        .map((operation) => [operation.replace('.', '_'), operation]),
);
const routerMounts: readonly [RegExp, string][] = [
    [/^\/api\/v1$/, 'apiV1Router'],
    [/^\/api\/v1\/dashboards$/, 'dashboardRouter'],
    [/^\/api\/v1\/saved$/, 'savedChartRouter'],
    [/^\/api\/v1\/org$/, 'organizationRouter'],
    [/^\/api\/v1\/projects\/[^/]+$/, 'projectRouter'],
    [/^\/api\/v1\/jobs$/, 'jobsRouter'],
    [/^\/api\/v1\/oauth$/, 'oauthRouter'],
    [/^\/api\/v1\/ee\/chart-registry$/, 'chartRegistryAssetRouter'],
];

export const resolveOAuthRouteOperation = (req: Request): string | null => {
    const route = req.route as
        | {
              path?: unknown;
              stack?: { handle: RequestHandler }[];
          }
        | undefined;
    const handlers = route?.stack?.map(({ handle }) => handle) ?? [];
    const terminalHandler = handlers.at(-1);
    if (
        terminalHandler &&
        /^\w+Controller\w*_\w+$/.test(terminalHandler.name)
    ) {
        return controllerOperations.get(terminalHandler.name) ?? null;
    }
    const guardedOperation = handlers
        .map(getOAuthScopeOperation)
        .find((operation) => operation !== null);
    if (guardedOperation) return guardedOperation;
    const router = routerMounts.find(([mount]) => mount.test(req.baseUrl))?.[1];
    if (!router || typeof route?.path !== 'string') return null;
    const operation = `${router} ${req.method.toUpperCase()} ${route.path}`;
    return operations.has(operation) ? operation : null;
};

export interface OAuthRouteResource {
    type: 'dashboard' | 'saved_chart' | 'space' | 'query';
    uuid: string;
}

const resourceParameters: readonly [string, OAuthRouteResource['type']][] = [
    ['dashboardUuid', 'dashboard'],
    ['dashboardUuidOrSlug', 'dashboard'],
    ['chartUuid', 'saved_chart'],
    ['savedQueryUuid', 'saved_chart'],
    ['savedQueryUuidOrSlug', 'saved_chart'],
    ['spaceUuid', 'space'],
    ['queryUuid', 'query'],
];

export const getOAuthRouteResource = (
    req: Request,
): OAuthRouteResource | null => {
    for (const [parameter, type] of resourceParameters) {
        const uuid = req.params[parameter];
        if (typeof uuid === 'string' && isUuid(uuid)) return { type, uuid };
    }
    return null;
};
