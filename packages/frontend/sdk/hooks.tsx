import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    createLightdashApiClient,
    type LightdashApiClientConfig,
    type LightdashContentResults,
    type ListContentOptions,
} from './api';
import type { ApiError } from '@lightdash/common';

type UseLightdashApiState<T> = {
    data: T | null;
    error: Error | null;
    isLoading: boolean;
};

export type UseLightdashApiResult<T> = UseLightdashApiState<T> & {
    refetch: () => void;
};

type UseLightdashApiOptions = {
    enabled?: boolean;
};

const toError = (error: unknown) => {
    if (error instanceof Error) return error;

    if (
        typeof error === 'object' &&
        error !== null &&
        'error' in error &&
        typeof error.error === 'object' &&
        error.error !== null &&
        'message' in error.error &&
        typeof error.error.message === 'string'
    ) {
        return new Error(error.error.message);
    }

    return new Error('Lightdash request failed');
};

const useLightdashApiQuery = <T,>(
    key: string,
    enabled: boolean,
    load: (signal: AbortSignal) => Promise<T>,
): UseLightdashApiResult<T> => {
    const [fetchCount, setFetchCount] = useState(0);
    const [state, setState] = useState<UseLightdashApiState<T>>({
        data: null,
        error: null,
        isLoading: enabled,
    });

    const loadRef = useRef(load);

    useEffect(() => {
        loadRef.current = load;
    }, [load]);

    useEffect(() => {
        if (!enabled) {
            setState({ data: null, error: null, isLoading: false });
            return undefined;
        }

        const abortController = new AbortController();

        setState((current) => ({
            data: current.data,
            error: null,
            isLoading: true,
        }));

        loadRef.current(abortController.signal)
            .then((data) => {
                if (abortController.signal.aborted) return;
                setState({ data, error: null, isLoading: false });
            })
            .catch((error: ApiError | Error | unknown) => {
                if (abortController.signal.aborted) return;
                setState({
                    data: null,
                    error: toError(error),
                    isLoading: false,
                });
            });

        return () => abortController.abort();
    }, [enabled, fetchCount, key]);

    const refetch = useCallback(() => {
        setFetchCount((current) => current + 1);
    }, []);

    return {
        ...state,
        refetch,
    };
};

const useLightdashApiClient = (config: LightdashApiClientConfig) => {
    const authKey = JSON.stringify(config.auth ?? null);

    return useMemo(
        () => createLightdashApiClient(config),
        [authKey, config.fetch, config.instanceUrl, config.projectUuid], // eslint-disable-line react-hooks/exhaustive-deps
    );
};

export const useLightdashContent = (
    config: LightdashApiClientConfig,
    args: ListContentOptions = {},
    options: UseLightdashApiOptions = {},
): UseLightdashApiResult<LightdashContentResults> => {
    const client = useLightdashApiClient(config);
    const key = JSON.stringify(['content', config.instanceUrl, args]);
    const enabled = options.enabled !== false;

    return useLightdashApiQuery(
        key,
        enabled,
        useCallback(() => client.listContent(args), [args, client]),
    );
};
