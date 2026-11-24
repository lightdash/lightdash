import { type QueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { dashboardResultsQueryPredicate } from '../dashboard/useDashboardRefresh';

export const WAREHOUSE_CREDENTIALS_ERROR = 'warehouse-credentials-error';

export type WarehouseCredentialsErrorDetail = {
    projectUuid: string;
    error: { name?: string; data?: Record<string, unknown> };
    // The user asked for the prompt, as opposed to a request failing
    requested?: boolean;
};

const CREDENTIAL_ERROR_NAMES = new Set([
    'MissingWarehouseCredentialsError',
    'SnowflakeTokenError',
    'DatabricksTokenError',
    'BigqueryTokenError',
    'RedshiftIamTokenError',
]);

// For requests that bypass the query cache (e.g. the data app bridge)
export const reportWarehouseCredentialsError = (
    projectUuid: string,
    error: unknown,
) => {
    const name = (error as { name?: unknown } | null | undefined)?.name;
    if (typeof name !== 'string' || !CREDENTIAL_ERROR_NAMES.has(name)) return;
    window.dispatchEvent(
        new CustomEvent<WarehouseCredentialsErrorDetail>(
            WAREHOUSE_CREDENTIALS_ERROR,
            {
                detail: {
                    projectUuid,
                    error: error as WarehouseCredentialsErrorDetail['error'],
                },
            },
        ),
    );
};

export const requestWarehouseCredentialsPrompt = (projectUuid: string) => {
    window.dispatchEvent(
        new CustomEvent<WarehouseCredentialsErrorDetail>(
            WAREHOUSE_CREDENTIALS_ERROR,
            {
                detail: {
                    projectUuid,
                    error: { name: 'MissingWarehouseCredentialsError' },
                    requested: true,
                },
            },
        ),
    );
};

export const WAREHOUSE_CREDENTIALS_CONNECTED =
    'warehouse-credentials-connected';

const isCredentialsError = (error: unknown) => {
    const name = (error as { error?: { name?: unknown } } | null)?.error?.name;
    return typeof name === 'string' && CREDENTIAL_ERROR_NAMES.has(name);
};

// For pages that must not reload after credentials are saved (unsaved edits).
// Tile results are refreshed even when they loaded fine: their cache keys
// don't include the credential, so they'd keep showing the previous one's data
export const retryAfterWarehouseCredentialsSaved = (
    queryClient: QueryClient,
    projectUuid: string,
) => {
    void queryClient.invalidateQueries({
        predicate: (query) => {
            if (query.queryKey[0] === 'dashboard_chart_ready_query') {
                return query.queryKey[1] === projectUuid;
            }
            // SQL chart tiles carry no project in their key; only mounted
            // queries refetch, and those belong to the active project
            if (dashboardResultsQueryPredicate(query)) return true;
            return (
                isCredentialsError(query.state.error) &&
                query.queryKey.includes(projectUuid)
            );
        },
    });
    window.dispatchEvent(
        new CustomEvent(WAREHOUSE_CREDENTIALS_CONNECTED, {
            detail: projectUuid,
        }),
    );
};

// Pages without the navbar prompt (minimal, embed, multi-connection projects)
// have nothing to open, so actions that request it hide themselves
let mountedPrompts = 0;
const promptSubscribers = new Set<() => void>();

export const registerWarehouseCredentialsPrompt = () => {
    mountedPrompts += 1;
    promptSubscribers.forEach((notify) => notify());
    return () => {
        mountedPrompts -= 1;
        promptSubscribers.forEach((notify) => notify());
    };
};

export const useHasWarehouseCredentialsPrompt = () =>
    useSyncExternalStore(
        (notify) => {
            promptSubscribers.add(notify);
            return () => promptSubscribers.delete(notify);
        },
        () => mountedPrompts > 0,
    );
