import {
    getExpiredPersonalSignInMessage,
    getExpiredSharedSignInMessage,
    PersonSignInProvider,
    QueryHistoryStatus,
    SignInSubjectBasis,
    type ApiError,
    type ApiExploreResults,
    type SharedSignInStatus,
} from '@lightdash/common';
import { notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sharedLightdashApi } from '../api';
import {
    buildInitialExplorerState,
    createExplorerStore,
} from '../features/explorer/store';
import {
    clearSharedSignInToastSuppression,
    setSharedSignInToastSuppression,
} from './toaster/sharedSignInToastSuppression';
import { useCompiledSql } from './useCompiledSql';
import { useExploreByProjectUuid, useExploreQueries } from './useExplore';
import { useExplores } from './useExplores';
import useQueryError from './useQueryError';
import {
    useGetReadyQueryResults,
    useInfiniteQueryResults,
} from './useQueryResults';

const { dispatchEmbedEvent } = vi.hoisted(() => ({
    dispatchEmbedEvent: vi.fn(),
}));

vi.mock('../api', () => ({ sharedLightdashApi: vi.fn() }));
vi.mock('@mantine/notifications', () => ({
    notifications: { show: vi.fn(), update: vi.fn(), hide: vi.fn() },
}));
vi.mock('../ee/providers/Embed/useEmbed', () => ({
    default: () => ({ mode: 'direct', dispatchEmbedEvent }),
}));
vi.mock('./useProjectUuid', () => ({
    useProjectUuid: () => 'project-a',
}));

const personalStatus: SharedSignInStatus = {
    provider: PersonSignInProvider.GOOGLE,
    subject: null,
    subjectBasis: null,
    expired: false,
    canReconnect: false,
    personalSignIn: {
        projectUuid: 'project-a',
        provider: PersonSignInProvider.GOOGLE,
        userWarehouseCredentialsUuid: 'personal-credentials',
        expired: true,
        canReconnect: true,
    },
};
const sharedStatus: SharedSignInStatus = {
    provider: PersonSignInProvider.GOOGLE,
    subject: { userUuid: 'owner', name: 'Owner' },
    subjectBasis: SignInSubjectBasis.RECORDED,
    expired: true,
    canReconnect: true,
};
const permissionError: ApiError = {
    status: 'error',
    error: {
        name: 'WarehouseQueryError',
        statusCode: 500,
        message: 'Permission denied for table orders',
        data: {},
    },
};

const hooks: {
    name: string;
    useQuery: () => {
        error: ApiError | null;
        refetch: () => Promise<unknown>;
    };
}[] = [
    {
        name: 'infinite results',
        useQuery: () => {
            const result = useInfiniteQueryResults(
                'project-a',
                'query-a',
                'Example chart',
            );
            return { error: result.error, refetch: result.refetchRows };
        },
    },
    {
        name: 'query execution',
        useQuery: () =>
            useGetReadyQueryResults(
                {
                    projectUuid: 'project-a',
                    tableId: 'orders',
                    chartUuid: 'chart-a',
                },
                [],
            ),
    },
    {
        name: 'explore',
        useQuery: () => useExploreByProjectUuid('orders', 'project-a'),
    },
    {
        name: 'parallel explores',
        useQuery: () => {
            useExploreQueries(['orders']);
            const queryKey = ['tables', 'orders', 'project-a'];
            return {
                error:
                    queryClient.getQueryState<ApiExploreResults, ApiError>(
                        queryKey,
                    )?.error ?? null,
                refetch: () => queryClient.refetchQueries(queryKey),
            };
        },
    },
    {
        name: 'explores',
        useQuery: () => useExplores('project-a'),
    },
    {
        name: 'compiled query',
        useQuery: () => useCompiledSql(),
    },
];

let queryClient: QueryClient;

function Wrapper({ children }: PropsWithChildren) {
    return (
        <QueryClientProvider client={queryClient}>
            <Provider store={store}>{children}</Provider>
        </QueryClientProvider>
    );
}

const initialState = buildInitialExplorerState({});
const store = createExplorerStore({
    explorer: {
        ...initialState,
        unsavedChartVersion: {
            ...initialState.unsavedChartVersion,
            tableName: 'orders',
        },
    },
});

beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false, cacheTime: Infinity, staleTime: Infinity },
        },
    });
});

afterEach(() => {
    cleanup();
    queryClient.clear();
    clearSharedSignInToastSuppression('project-a');
    clearSharedSignInToastSuppression('project-b');
});

describe.each(hooks)(
    '$name toast scope',
    ({ name, useQuery: useTestQuery }) => {
        describe.each([
            {
                kind: 'personal',
                status: personalStatus,
                message: getExpiredPersonalSignInMessage({
                    provider: PersonSignInProvider.GOOGLE,
                }),
            },
            {
                kind: 'shared',
                status: sharedStatus,
                message: getExpiredSharedSignInMessage(
                    {
                        provider: PersonSignInProvider.GOOGLE,
                        subjectUserUuid: 'owner',
                        subjectName: 'Owner',
                        subjectBasis: SignInSubjectBasis.RECORDED,
                    },
                    'owner',
                ),
            },
        ])('$kind sign-in', ({ kind, status, message }) => {
            it.each([
                {
                    presentation: 'active modal or banner',
                    project: 'project-a',
                    suppressed: true,
                },
                {
                    presentation: 'another project modal or banner',
                    project: 'project-b',
                    suppressed: false,
                },
                {
                    presentation: 'no modal or banner',
                    project: null,
                    suppressed: false,
                },
            ])(
                'handles $presentation without hiding permission errors',
                async ({ project, suppressed }) => {
                    if (project) {
                        setSharedSignInToastSuppression(
                            project,
                            status,
                            'owner',
                        );
                    }
                    if (name === 'compiled query') {
                        queryClient.setQueryData(
                            ['tables', 'orders', 'project-a'],
                            null,
                        );
                    }
                    const signInError: ApiError = {
                        status: 'error',
                        error: {
                            name:
                                name === 'infinite results' &&
                                kind === 'personal'
                                    ? 'BigqueryTokenError'
                                    : 'Error',
                            statusCode:
                                name === 'infinite results' &&
                                kind === 'personal'
                                    ? 401
                                    : 500,
                            message,
                            data: {},
                        },
                    };
                    const api = vi.mocked(sharedLightdashApi);
                    if (name === 'infinite results' && kind === 'personal') {
                        api.mockResolvedValue({
                            queryUuid: 'query-a',
                            status: QueryHistoryStatus.ERROR,
                            error: message,
                            erroredAt: new Date(),
                        });
                    } else {
                        api.mockRejectedValue(signInError);
                    }
                    const { result } = renderHook(useTestQuery, {
                        wrapper: Wrapper,
                    });

                    await waitFor(() =>
                        expect(result.current.error).toEqual(signInError),
                    );
                    expect(api).toHaveBeenCalled();
                    expect(notifications.show).toHaveBeenCalledTimes(
                        suppressed ? 0 : 1,
                    );
                    expect(notifications.update).not.toHaveBeenCalled();

                    api.mockRejectedValue(permissionError);
                    await act(async () => {
                        await result.current.refetch();
                    });
                    await waitFor(() =>
                        expect(result.current.error).toEqual(permissionError),
                    );
                    await waitFor(() => {
                        expect(notifications.show).toHaveBeenCalledTimes(1);
                        expect(notifications.update).toHaveBeenCalledTimes(
                            suppressed ? 0 : 1,
                        );
                    });
                },
            );
        });
    },
);

it('keeps unscoped errors visible while a project modal or banner is active', async () => {
    setSharedSignInToastSuppression('project-a', personalStatus, 'owner');
    const { result } = renderHook(() => useQueryError(), { wrapper: Wrapper });
    act(() =>
        result.current({
            status: 'error',
            error: {
                name: 'Error',
                statusCode: 500,
                message: getExpiredPersonalSignInMessage({
                    provider: PersonSignInProvider.GOOGLE,
                }),
                data: {},
            },
        }),
    );
    await waitFor(() => expect(notifications.show).toHaveBeenCalledTimes(1));
});

it('keeps forbidden result errors visible while a project modal or banner is active', async () => {
    setSharedSignInToastSuppression('project-a', personalStatus, 'owner');
    const error: ApiError = {
        status: 'error',
        error: {
            name: 'ForbiddenError',
            statusCode: 403,
            message: 'Permission denied',
            data: {},
        },
    };
    vi.mocked(sharedLightdashApi).mockRejectedValue(error);
    const { result } = renderHook(
        () => useInfiniteQueryResults('project-a', 'query-a'),
        { wrapper: Wrapper },
    );
    await waitFor(() => expect(result.current.error).toEqual(error));
    await waitFor(() => expect(notifications.show).toHaveBeenCalledTimes(1));
});

it('suppresses matching forbidden result errors for the active project', async () => {
    setSharedSignInToastSuppression('project-a', personalStatus, 'owner');
    const error: ApiError = {
        status: 'error',
        error: {
            name: 'ForbiddenError',
            statusCode: 403,
            message: getExpiredPersonalSignInMessage({
                provider: PersonSignInProvider.GOOGLE,
            }),
            data: {},
        },
    };
    vi.mocked(sharedLightdashApi).mockRejectedValue(error);
    const { result } = renderHook(
        () => useInfiniteQueryResults('project-a', 'query-a'),
        { wrapper: Wrapper },
    );
    await waitFor(() => expect(result.current.error).toEqual(error));
    expect(notifications.show).not.toHaveBeenCalled();
    expect(notifications.update).not.toHaveBeenCalled();
    vi.mocked(sharedLightdashApi).mockRejectedValue(permissionError);
    await act(async () => {
        await result.current.refetchRows();
    });
    await waitFor(() => expect(notifications.show).toHaveBeenCalledTimes(1));
});
