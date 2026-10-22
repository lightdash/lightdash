import {
    getWarehouseSignInErrorType,
    isApiError,
    isBigqueryTokenErrorMessage,
    type ApiErrorDetail,
} from '@lightdash/common';
import { type Query, type QueryClient } from '@tanstack/react-query';

type QueryScope = { projectUuid: string; userUuid: string };
let currentScope: QueryScope | null = null;
const requests = new WeakMap<object, QueryScope | null>();

export const startSharedSignInQueryScope = (
    projectUuid: string,
    userUuid: string,
): QueryScope => {
    currentScope = { projectUuid, userUuid };
    return currentScope;
};

export const captureSharedSignInQueryScope = (projectUuid: string) =>
    currentScope?.projectUuid === projectUuid ? currentScope : null;

export const canReplaySharedSignInQueryScope = (scope: QueryScope | null) =>
    scope === null
        ? currentScope === null
        : scope.projectUuid === currentScope?.projectUuid &&
          scope.userUuid === currentScope.userUuid;

export const clearSharedSignInQueryScope = (scope: QueryScope) => {
    if (currentScope === scope) currentScope = null;
};

export const isCurrentSharedSignInQueryScope = (scope: QueryScope | null) =>
    scope !== null && scope === currentScope;

export const trackSharedSignInQuery = (request: object) => {
    requests.set(request, currentScope);
};

export const isCurrentSharedSignInQuery = (request: object) =>
    isCurrentSharedSignInQueryScope(requests.get(request) ?? null);

export const isWarehouseSignInQueryErrorDetail = (
    error: Pick<ApiErrorDetail, 'name' | 'statusCode' | 'data' | 'message'>,
): boolean =>
    error.statusCode === 401 &&
    [
        'BigqueryTokenError',
        'SnowflakeTokenError',
        'DatabricksTokenError',
        'WarehouseSignInExpiredError',
    ].includes(error.name) &&
    (!!error.data?.personalSignIn ||
        !!error.data?.sharedSignIn ||
        getWarehouseSignInErrorType(error.message)?.name === error.name ||
        (error.name === 'BigqueryTokenError' &&
            isBigqueryTokenErrorMessage(error.message)));

export const isWarehouseSignInQueryError = (error: unknown): boolean =>
    isApiError(error) &&
    !!error.error &&
    isWarehouseSignInQueryErrorDetail(error.error);

export const replaySharedSignInQueries = (
    queryClient: QueryClient,
    belongsToProject: (query: Query) => boolean,
) => {
    const warehouseQueries = new Set([
        'create-query',
        'dashboard_chart_ready_query',
        'savedSqlChartResults',
    ]);
    const retries = queryClient
        .getQueryCache()
        .getAll()
        .filter(
            (query) =>
                query.isActive() &&
                belongsToProject(query) &&
                warehouseQueries.has(String(query.queryKey[0])) &&
                canReplaySharedSignInQueryScope(requests.get(query) ?? null),
        );
    if (currentScope) currentScope = { ...currentScope };
    void queryClient.cancelQueries({
        predicate: (query) => retries.includes(query),
    });
    void queryClient.invalidateQueries({
        predicate: (query) => retries.includes(query),
        refetchType: 'active',
    });
};
