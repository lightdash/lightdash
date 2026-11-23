import { useSyncExternalStore } from 'react';

export const WAREHOUSE_CREDENTIALS_ERROR = 'warehouse-credentials-error';

export type WarehouseCredentialsErrorDetail = {
    projectUuid: string;
    error: { name?: string; data?: Record<string, unknown> };
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
