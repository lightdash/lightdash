import {
    BIGQUERY_TOKEN_ERROR_MESSAGE_MARKER,
    FeatureFlags,
    getExpiredPersonalSignInMessage,
    QueryHistoryStatus,
    PersonSignInProvider,
    SignInSubjectBasis,
    type SharedSignInStatus,
} from '@lightdash/common';
import { Button, MantineProvider, Text } from '@mantine/core';
import {
    QueryClient,
    QueryClientProvider,
    QueryObserver,
} from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter, useNavigate } from 'react-router';
import { useMultipleTableFields } from '../../features/sqlRunner/hooks/useMultipleTableFields';
import { useTableFields } from '../../features/sqlRunner/hooks/useTableFields';
import { useTables } from '../../features/sqlRunner/hooks/useTables';
import { SqlRunnerConnectionScope } from '../../features/sqlRunner/multiConnection/components/SqlRunnerConnectionScope';
import {
    useConnectionDatabases,
    useConnectionTableFields,
    useSqlRunnerConnections,
    useTableUnits,
} from '../../features/sqlRunner/multiConnection/hooks/useConnectionCatalog';
import { tableUnitId } from '../../features/sqlRunner/multiConnection/utils/warehouseTreeRows';
import { store as sqlStore } from '../../features/sqlRunner/store';
import {
    resetState,
    setProjectUuid,
} from '../../features/sqlRunner/store/sqlRunnerSlice';
import {
    completeSharedSignInRestoration,
    canReplayRestoredSql,
    captureSharedSignInQueryScope,
} from '../../hooks/sharedSignInQueryRecovery';
import { shouldSuppressSharedSignInToast } from '../../hooks/toaster/sharedSignInToastSuppression';
import {
    useGetReadyQueryResults,
    useInfiniteQueryResults,
} from '../../hooks/useQueryResults';
import {
    SHARED_SIGN_IN_QUERY_FAILED,
    SHARED_SIGN_IN_RECONNECTED,
} from '../../hooks/useReconnectSharedSignIn';
import { reportSharedSignInQueryFailure } from '../../hooks/useReconnectSharedSignIn';
import { SharedSignInExpiryListener } from './SharedSignInExpiryListener';
import { SharedSignInQueryBoundary } from './SharedSignInQueryBoundary';
import { WarehouseSignInBanner } from './WarehouseSignInBanner';
import {
    setWarehouseSignInBannerVisibility,
    useWarehouseSignInBanner,
} from './warehouseSignInBannerState';
import {
    getActiveWarehouseSignInPreflight,
    useWarehouseSignInExecution,
} from './warehouseSignInPreflight';

const state = vi.hoisted(() => ({
    userUuid: 'user_a' as string | null,
    projectUuid: 'project_a',
    higherPriority: false,
    reconnect: true,
    expiry: true,
    api: vi.fn(),
    warning: vi.fn(),
    success: vi.fn(),
    popup: vi.fn(),
    childMounted: vi.fn(),
    executed: vi.fn(),
    binding: null as string | null | undefined,
    deferPopup: false,
    popupCallback: null as (() => void) | null,
    realQueries: false,
    boundRoots: null as string[] | null,
    catalogue: false,
    pageSourceMounted: true,
    realCatalogueScope: false,
    catalogueExtra: false,
    catalogueFields: false,
    catalogueMounted: true,
    catalogueEnabled: true,
    catalogueConnection: 'connection_a',
    catalogueProject: 'project_a',
    showRemoved: true,
    deliberateDisabled: true,
    toastError: vi.fn(),
}));
vi.mock('../../providers/App/useApp', () => ({
    default: () => ({
        user: {
            data: state.userUuid ? { userUuid: state.userUuid } : undefined,
        },
    }),
}));
vi.mock('../../hooks/useActiveProject', () => ({
    useActiveProjectUuid: () => ({ activeProjectUuid: state.projectUuid }),
}));
vi.mock('../../providers/LightdashApi/useLightdashApi', () => ({
    useLightdashApi: () => state.api,
}));
vi.mock('../../hooks/useExplore', () => ({
    useExploreByProjectUuid: (tableId: string) => ({
        data: {
            warehouseConnection: {
                warehouseConnectionUuid: state.boundRoots
                    ? tableId === 'original'
                        ? null
                        : `connection_${tableId}`
                    : state.binding,
            },
        },
    }),
}));
vi.mock('../../hooks/useProject', () => ({
    useProject: () => ({ data: { name: 'Project A' } }),
}));
vi.mock('../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: (flag: FeatureFlags) => ({
        isLoading: false,
        data: {
            enabled:
                flag === FeatureFlags.SharedSignInReconnect
                    ? state.reconnect
                    : state.expiry,
        },
    }),
}));
vi.mock('../../hooks/toaster/useToaster', () => ({
    default: () => ({
        showToastWarning: state.warning,
        showToastSuccess: state.success,
        addToastError: (options: {
            apiError: typeof personalError;
            projectUuid?: string;
        }) => {
            if (
                !shouldSuppressSharedSignInToast(
                    options.apiError,
                    options.projectUuid,
                )
            )
                state.toastError(options);
        },
    }),
}));
vi.mock('../../hooks/gdrive/useGdrive', () => ({
    useGoogleLoginPopup: (
        _path: string,
        onLogin: () => void,
        options: unknown,
    ) => ({
        isLoading: false,
        mutate: () => {
            state.popup(options);
            if (state.deferPopup) state.popupCallback = onLogin;
            else onLogin();
        },
    }),
}));
vi.mock('../ProjectConnection/WarehouseForms/BigQueryForm', () => ({
    BigQuerySSOInput: ({
        openLoginPopup,
        disabled,
    }: {
        openLoginPopup: () => void;
        disabled: boolean;
    }) => (
        <Button onClick={openLoginPopup} disabled={disabled}>
            Sign in with Google
        </Button>
    ),
}));

const personal: SharedSignInStatus = {
    personalSelection: { warehouseConnectionUuid: null },
    provider: PersonSignInProvider.GOOGLE,
    subject: null,
    subjectBasis: null,
    expired: false,
    canReconnect: false,
    personalSignIn: {
        provider: PersonSignInProvider.GOOGLE,
        projectUuid: 'project_a',
        userWarehouseCredentialsUuid: 'credential_a',
        expired: true,
        canReconnect: true,
    },
};
const shared: SharedSignInStatus = {
    personalSelection: { warehouseConnectionUuid: null },
    provider: PersonSignInProvider.GOOGLE,
    subject: { userUuid: 'user_a', name: 'User A' },
    subjectBasis: SignInSubjectBasis.RECORDED,
    expired: true,
    canReconnect: true,
};
const personalError = {
    name: 'BigqueryTokenError',
    statusCode: 400,
    message: 'expired',
    data: { personalSignIn: personal.personalSignIn },
};
const PageQuery = () => {
    const ready = useWarehouseSignInExecution(
        state.projectUuid,
        state.binding,
        true,
        1,
    );
    useEffect(() => {
        if (ready) state.executed();
    }, [ready]);
    useEffect(() => {
        state.childMounted();
    }, []);
    return <Text>Query page</Text>;
};
const RealRoot = ({
    name,
    disabled = false,
    projectUuid = 'project_a',
    tableId = 'table_a',
}: {
    tableId?: string;
    name: string;
    disabled?: boolean;
    projectUuid?: string;
}) => {
    const result = useGetReadyQueryResults(
        { projectUuid, tableId, chartUuid: name },
        disabled ? ['required'] : [],
    );
    useInfiniteQueryResults(projectUuid, result.data?.queryUuid);
    return null;
};
const CatalogueRoot = () => {
    const tables = useTables({ projectUuid: state.projectUuid });
    useTableFields({
        projectUuid: state.projectUuid,
        tableName: 'healthy_table',
        schema: 'schema_a',
        search: undefined,
    });
    return (
        <Text>
            {tables.data
                ? JSON.stringify(tables.data)
                : 'Catalogue unavailable'}
        </Text>
    );
};
const CatalogueFields = () => {
    const single = useTableFields({
        projectUuid: 'project_a',
        tableName: 'table_a',
        schema: 'schema_a',
        search: undefined,
    });
    const multiple = useMultipleTableFields([
        { projectUuid: 'project_a', tableName: 'table_a', schema: 'schema_a' },
        { projectUuid: 'project_a', tableName: 'table_b', schema: 'schema_a' },
    ]);
    return <Text>{JSON.stringify([single.data, multiple.data])}</Text>;
};
const CatalogueExtra = () => {
    const connections = useSqlRunnerConnections('project_a', true);
    return connections.data ? <CatalogueExtraQueries /> : null;
};
const CatalogueExtraQueries = () => {
    const connection = state.catalogueConnection;
    const databases = useConnectionDatabases({
        projectUuid: 'project_a',
        connectionIds: [connection, 'connection_other'],
        enabledConnectionIds: new Set([connection, 'connection_other']),
    });
    const units = ['database_a', 'database_healthy', 'database_disabled'].map(
        (database) => ({
            connectionId: connection,
            warehouseConnectionUuid: connection,
            database,
        }),
    );
    const tables = useTableUnits({
        projectUuid: 'project_a',
        units,
        enabledUnitIds: new Set(
            units
                .filter(
                    (unit) =>
                        unit.database !== 'database_disabled' ||
                        state.catalogueEnabled,
                )
                .map(tableUnitId),
        ),
    });
    const fields = useConnectionTableFields({
        projectUuid: 'project_a',
        identity: {
            connectionId: connection,
            database: 'database_a',
            schema: 'schema_a',
            table: 'table_a',
        },
    });
    useMultipleTableFields([
        {
            projectUuid: 'project_a',
            schema: 'schema_a',
            tableName: 'table_b',
            connection: { connectionId: connection, database: 'database_a' },
        },
    ]);
    return (
        <Text>
            {JSON.stringify([
                databases.listings.get(connection),
                tables.loadedCatalogs,
                fields.data,
            ])}
        </Text>
    );
};
const CatalogueOtherProject = () => {
    useTables({ projectUuid: state.catalogueProject });
    return null;
};
const RealRoots = () => (
    <>
        {[
            'failed_a',
            'failed_b',
            'failed_c',
            'healthy',
            'inflight',
            'pending_poll',
        ].map((name) => (
            <RealRoot key={name} name={name} />
        ))}
        <RealRoot name="healthy" />
        {state.showRemoved && <RealRoot name="removed" />}
        <RealRoot name="other_project" projectUuid="project_b" />
        <RealRoot name="disabled" disabled={state.deliberateDisabled} />
    </>
);
const Harness = () => {
    const banner = useWarehouseSignInBanner();
    const navigate = useNavigate();
    useEffect(() => {
        setWarehouseSignInBannerVisibility(!!banner && !state.higherPriority);
        return () => setWarehouseSignInBannerVisibility(false);
    }, [banner]);
    return (
        <SharedSignInQueryBoundary>
            <SharedSignInExpiryListener />
            {banner && !state.higherPriority && (
                <WarehouseSignInBanner
                    status={banner.status}
                    userUuid={banner.userUuid}
                    reconnect={banner.reconnect}
                />
            )}
            <Button onClick={() => void navigate('/projects/project_a/home')}>
                Home
            </Button>
            <Button
                onClick={() => void navigate('/projects/project_a/sql-runner')}
            >
                Query route
            </Button>
            {state.boundRoots ? (
                state.boundRoots.map((name) => (
                    <RealRoot key={name} name={name} tableId={name} />
                ))
            ) : state.pageSourceMounted && !state.realCatalogueScope ? (
                <PageQuery />
            ) : null}
            {state.realQueries && <RealRoots />}
            {state.catalogue && (
                <>
                    {state.catalogueMounted &&
                        (state.realCatalogueScope ? (
                            <Provider store={sqlStore}>
                                <SqlRunnerConnectionScope
                                    isEditingSavedChart={false}
                                >
                                    <CatalogueRoot />
                                </SqlRunnerConnectionScope>
                            </Provider>
                        ) : (
                            <CatalogueRoot />
                        ))}
                    {state.pageSourceMounted && !state.realCatalogueScope && (
                        <RealRoot name="catalogue_data" />
                    )}
                </>
            )}
            {state.catalogueFields && state.catalogueMounted && (
                <CatalogueFields />
            )}
            {state.catalogueExtra && <CatalogueExtra />}
            {state.catalogueProject !== 'project_a' && (
                <CatalogueOtherProject />
            )}
        </SharedSignInQueryBoundary>
    );
};
const mount = (
    path = '/projects/project_a/sql-runner',
    configureClient?: (client: QueryClient) => void,
) => {
    const client = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
        logger: { log: () => {}, warn: () => {}, error: () => {} },
    });
    configureClient?.(client);
    const tree = () => (
        <MantineProvider env="test">
            <QueryClientProvider client={client}>
                <MemoryRouter initialEntries={[path]}>
                    <Harness />
                </MemoryRouter>
            </QueryClientProvider>
        </MantineProvider>
    );
    return { ...render(tree()), client, tree };
};
beforeEach(() => {
    vi.clearAllMocks();
    state.userUuid = 'user_a';
    state.projectUuid = 'project_a';
    state.higherPriority = false;
    state.reconnect = true;
    state.expiry = true;
    state.binding = null;
    state.deferPopup = false;
    state.popupCallback = null;
    state.realQueries = false;
    state.boundRoots = null;
    state.catalogue = false;
    state.pageSourceMounted = true;
    state.realCatalogueScope = false;
    state.catalogueExtra = false;
    state.catalogueFields = false;
    state.catalogueMounted = true;
    state.catalogueEnabled = true;
    state.catalogueConnection = 'connection_a';
    state.catalogueProject = 'project_a';
    state.showRemoved = true;
    state.deliberateDisabled = true;
    state.api.mockImplementation(
        async ({ method, url }: { method: string; url: string }) =>
            method === 'GET' && url.includes('shared-sign-in')
                ? personal
                : [{ uuid: 'credential_a', needsSignIn: null }],
    );
});

test('mounts discovery on route load and holds execution until the modal decision', async () => {
    const pending = Promise.withResolvers<SharedSignInStatus>();
    state.api.mockReturnValue(pending.promise);
    mount();
    expect(state.api).toHaveBeenCalledWith(
        expect.objectContaining({
            method: 'GET',
            url: expect.stringContaining('includePersonal=true'),
        }),
    );
    expect(state.childMounted).toHaveBeenCalledOnce();
    expect(state.executed).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
    await act(async () => pending.resolve(personal));
    expect(await screen.findByRole('dialog')).toHaveTextContent(
        'Your BigQuery sign-in has expired. Sign in with Google again to load this.',
    );
    expect(state.childMounted).toHaveBeenCalledOnce();
    expect(state.executed).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
    await waitFor(() => expect(state.executed).toHaveBeenCalledOnce());
    expect(state.warning).not.toHaveBeenCalled();
});

test.each([personal, shared])(
    'dismissal shows the same banner and reconnect reopens the modal',
    async (status) => {
        state.api.mockResolvedValue(status);
        mount();
        await screen.findByRole('dialog');
        await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        const reconnect = screen.getByRole('button', { name: 'Reconnect' });
        expect(reconnect).toBeVisible();
        expect(
            shouldSuppressSharedSignInToast(
                status.personalSignIn
                    ? personalError
                    : {
                          ...personalError,
                          data: {
                              sharedSignIn: {
                                  provider: shared.provider,
                                  subjectUserUuid: 'user_a',
                                  subjectBasis: shared.subjectBasis,
                              },
                          },
                      },
                'project_a',
            ),
        ).toBe(true);
        expect(
            shouldSuppressSharedSignInToast(
                { ...personalError, message: 'Unrelated failure', data: {} },
                'project_a',
            ),
        ).toBe(false);
        await userEvent.click(reconnect);
        expect(await screen.findByRole('dialog')).toBeVisible();
        expect(state.api).toHaveBeenCalledOnce();
    },
);

test('shows non-owner copy in the banner without a reconnect action', async () => {
    state.api.mockResolvedValue({
        ...shared,
        subject: { userUuid: 'user_b', name: 'User B' },
        canReconnect: false,
    });
    mount();
    expect(
        await screen.findByText(
            "This project's connection uses User B's sign-in, which has expired. Ask User B or an admin to reconnect.",
        ),
    ).toBeVisible();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reconnect' })).toBeNull();
    expect(state.warning).not.toHaveBeenCalled();
});

test('keeps the shared modal permission but hides the banner action from a non-owner', async () => {
    state.api.mockResolvedValue({
        ...shared,
        subject: { userUuid: 'user_b', name: 'user_b' },
        subjectBasis: SignInSubjectBasis.PROJECT_CREATOR,
        canReconnect: true,
    });
    mount();
    expect(await screen.findByRole('dialog')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByRole('button', { name: 'Reconnect' })).toBeNull();
    expect(state.warning).not.toHaveBeenCalled();
});

test('does not check on home and hides the banner on unrelated pages', async () => {
    mount('/projects/project_a/home');
    expect(state.api).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Query route' }));
    await screen.findByRole('dialog');
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(
        await screen.findByRole('button', { name: 'Reconnect' }),
    ).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Home' }));
    expect(screen.queryByRole('button', { name: 'Reconnect' })).toBeNull();
    expect(shouldSuppressSharedSignInToast(personalError, 'project_a')).toBe(
        false,
    );
});

test('clears the banner and suppression on logout', async () => {
    const { rerender, tree } = mount();
    await screen.findByRole('dialog');
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
    state.userUuid = null;
    rerender(tree());
    expect(screen.queryByRole('button', { name: 'Reconnect' })).toBeNull();
    expect(shouldSuppressSharedSignInToast(personalError, 'project_a')).toBe(
        false,
    );
});

test('personal reconnect only verifies personal credentials', async () => {
    const restored = vi.fn();
    window.addEventListener(SHARED_SIGN_IN_RECONNECTED, restored);
    state.api.mockResolvedValueOnce(personal).mockResolvedValue({
        ...personal,
        personalSignIn: { ...personal.personalSignIn!, expired: false },
    });
    mount();
    await screen.findByRole('dialog');
    await userEvent.click(
        screen.getByRole('button', { name: 'Sign in with Google' }),
    );
    await waitFor(() => expect(restored).toHaveBeenCalledOnce());
    expect(state.popup).toHaveBeenCalledWith({
        light: true,
        personalCredentialUuid: 'credential_a',
    });
    expect(
        state.api.mock.calls.some(([request]) => request.method === 'POST'),
    ).toBe(false);
    expect(state.api).toHaveBeenCalledWith(
        expect.objectContaining({
            method: 'GET',
            url: '/projects/project_a/warehouse-credentials/shared-sign-in?includePersonal=true',
        }),
    );
    expect(shouldSuppressSharedSignInToast(personalError, 'project_a')).toBe(
        false,
    );
    window.removeEventListener(SHARED_SIGN_IN_RECONNECTED, restored);
});

test('shared reconnect retains its project POST', async () => {
    state.api.mockImplementation(async ({ method }: { method: string }) =>
        method === 'GET' ? shared : { status: 'ok' },
    );
    mount();
    await screen.findByRole('dialog');
    expect(screen.getByRole('dialog')).toHaveTextContent(
        "Project A's connection to BigQuery has expired. Sign in with Google again to restore it for everyone.",
    );
    await userEvent.click(
        screen.getByRole('button', { name: 'Sign in with Google' }),
    );
    await waitFor(() =>
        expect(state.api).toHaveBeenCalledWith(
            expect.objectContaining({
                method: 'POST',
                url: '/projects/project_a/warehouse-credentials/shared-sign-in',
            }),
        ),
    );
});

test('a burst of matching failures shares the pending status request', async () => {
    const pending = Promise.withResolvers<SharedSignInStatus>();
    state.api.mockReturnValue(pending.promise);
    mount();
    act(() => {
        for (let index = 0; index < 10; index += 1)
            window.dispatchEvent(
                new CustomEvent(SHARED_SIGN_IN_QUERY_FAILED, {
                    detail: {
                        projectUuid: 'project_a',
                        error: { error: personalError },
                    },
                }),
            );
    });
    expect(state.api).toHaveBeenCalledOnce();
    await act(async () => pending.resolve(personal));
    expect(await screen.findByRole('dialog')).toBeVisible();
});

test('an unknown status after dismissal retains the known banner', async () => {
    mount();
    await screen.findByRole('dialog');
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
    state.api.mockResolvedValue({
        ...personal,
        statusUnknown: true,
        personalSignIn: { ...personal.personalSignIn!, expired: false },
    });
    const now = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_001);
    await act(() =>
        window.dispatchEvent(
            new CustomEvent(SHARED_SIGN_IN_QUERY_FAILED, {
                detail: {
                    projectUuid: 'project_a',
                    error: { error: personalError },
                },
            }),
        ),
    );
    await waitFor(() => expect(state.api).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Reconnect' })).toBeVisible();
    expect(shouldSuppressSharedSignInToast(personalError, 'project_a')).toBe(
        true,
    );
    now.mockRestore();
});

test('an unbound failure cannot replace a dismissed personal target with a healthy response', async () => {
    mount();
    await screen.findByRole('dialog');
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
    state.api.mockResolvedValue({
        ...personal,
        personalSignIn: { ...personal.personalSignIn!, expired: false },
    });
    const now = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_001);
    await act(() =>
        window.dispatchEvent(
            new CustomEvent(SHARED_SIGN_IN_QUERY_FAILED, {
                detail: {
                    projectUuid: 'project_a',
                    error: { error: personalError },
                },
            }),
        ),
    );
    await waitFor(() =>
        expect(
            screen.queryByRole('button', { name: 'Reconnect' }),
        ).toBeVisible(),
    );
    expect(shouldSuppressSharedSignInToast(personalError, 'project_a')).toBe(
        true,
    );
    now.mockRestore();
});

test('a failed initial status check releases query children without inventing expiry', async () => {
    state.api.mockRejectedValue(new Error('unavailable'));
    mount();
    await waitFor(() => expect(state.executed).toHaveBeenCalledOnce());
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reconnect' })).toBeNull();
});

test('personal verification keeps the modal open when the current credential is still expired', async () => {
    const restored = vi.fn();
    window.addEventListener(SHARED_SIGN_IN_RECONNECTED, restored);
    mount();
    await screen.findByRole('dialog');
    await userEvent.click(
        screen.getByRole('button', { name: 'Sign in with Google' }),
    );
    expect(
        await screen.findByText(
            'Sign in with Google did not finish. Try again.',
        ),
    ).toBeVisible();
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(restored).not.toHaveBeenCalled();
    expect(
        state.api.mock.calls.some(([request]) => request.method === 'POST'),
    ).toBe(false);
    window.removeEventListener(SHARED_SIGN_IN_RECONNECTED, restored);
});

test('discards a pending response from the previous project', async () => {
    const previous = Promise.withResolvers<SharedSignInStatus>();
    const current = Promise.withResolvers<SharedSignInStatus>();
    state.api
        .mockReturnValueOnce(previous.promise)
        .mockReturnValueOnce(current.promise);
    const { rerender, tree } = mount();
    state.projectUuid = 'project_b';
    rerender(tree());
    await act(async () => previous.resolve(personal));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(shouldSuppressSharedSignInToast(personalError, 'project_a')).toBe(
        false,
    );
    await act(async () =>
        current.resolve({
            ...personal,
            personalSignIn: {
                ...personal.personalSignIn!,
                projectUuid: 'project_b',
                userWarehouseCredentialsUuid: 'credential_b',
            },
        }),
    );
    expect(await screen.findByRole('dialog')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(
        await screen.findByRole('button', { name: 'Reconnect' }),
    ).toBeVisible();
    expect(shouldSuppressSharedSignInToast(personalError, 'project_a')).toBe(
        false,
    );
});

test.each([
    FeatureFlags.SharedSignInReconnect,
    FeatureFlags.SharedSignInExpiryMessage,
])('does not hold page queries or check status with %s disabled', (flag) => {
    if (flag === FeatureFlags.SharedSignInReconnect) state.reconnect = false;
    else state.expiry = false;
    mount();
    expect(state.childMounted).toHaveBeenCalledOnce();
    expect(state.api).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
});

test('a higher priority banner leaves expiry errors visible after dismissal', async () => {
    state.higherPriority = true;
    mount();
    await screen.findByRole('dialog');
    expect(shouldSuppressSharedSignInToast(personalError, 'project_a')).toBe(
        true,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByRole('button', { name: 'Reconnect' })).toBeNull();
    expect(shouldSuppressSharedSignInToast(personalError, 'project_a')).toBe(
        false,
    );
});

test('an unbound restored event cannot release a pending selected preflight', async () => {
    const pending = Promise.withResolvers<SharedSignInStatus>();
    state.api.mockReturnValue(pending.promise);
    mount();
    await act(() =>
        window.dispatchEvent(
            new CustomEvent(SHARED_SIGN_IN_RECONNECTED, {
                detail: state.projectUuid,
            }),
        ),
    );
    expect(state.executed).not.toHaveBeenCalled();
    await act(async () => pending.resolve(personal));
    expect(await screen.findByRole('dialog')).toBeVisible();
});

test('returning to a query route joins an in-flight preflight check', async () => {
    const pending = Promise.withResolvers<SharedSignInStatus>();
    state.api.mockReturnValue(pending.promise);
    mount();
    await userEvent.click(screen.getByRole('button', { name: 'Home' }));
    await userEvent.click(screen.getByRole('button', { name: 'Query route' }));
    expect(state.api).toHaveBeenCalledOnce();
    await act(async () => pending.resolve(personal));
    expect(await screen.findByRole('dialog')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
    await act(async () => {
        window.dispatchEvent(
            new CustomEvent(SHARED_SIGN_IN_QUERY_FAILED, {
                detail: {
                    projectUuid: state.projectUuid,
                    error: { error: personalError },
                },
            }),
        );
    });
    expect(state.api).toHaveBeenCalledOnce();
});

test('a preflight check that finishes away from query routes permits an immediate check on return', async () => {
    const pending = Promise.withResolvers<SharedSignInStatus>();
    state.api.mockReturnValueOnce(pending.promise).mockResolvedValue(personal);
    mount();
    await userEvent.click(screen.getByRole('button', { name: 'Home' }));
    await act(async () => pending.resolve(personal));
    await userEvent.click(screen.getByRole('button', { name: 'Query route' }));
    expect(await screen.findByRole('dialog')).toBeVisible();
    expect(state.api).toHaveBeenCalledTimes(2);
});

test.each([null, 'connection_a'])(
    'an old-style original shared response cannot open proactive recovery for binding %s',
    async (binding) => {
        state.binding = binding;
        const { personalSelection: omitted, ...legacy } = shared;
        state.api.mockResolvedValue(legacy);
        mount();
        await waitFor(() => expect(state.executed).toHaveBeenCalledOnce());
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(state.popup).not.toHaveBeenCalled();
        expect(
            state.api.mock.calls.some(([request]) => request.method === 'POST'),
        ).toBe(false);
    },
);

test('shared proactive requests keep the cooldown and automatic modal policy across query-page transitions', async () => {
    state.api.mockResolvedValue(shared);
    mount();
    await screen.findByRole('dialog');
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
    await userEvent.click(screen.getByRole('button', { name: 'Home' }));
    await userEvent.click(screen.getByRole('button', { name: 'Query route' }));
    await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Reconnect' })).toBeVisible(),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(state.api).toHaveBeenCalledOnce();
});

test('unresolved selection mounts discovery without requesting original status', async () => {
    state.binding = undefined;
    const { rerender, tree } = mount();
    expect(state.childMounted).toHaveBeenCalledOnce();
    expect(state.executed).not.toHaveBeenCalled();
    expect(state.api).not.toHaveBeenCalled();
    state.binding = 'connection_a';
    state.api.mockResolvedValue({
        ...personal,
        personalSelection: { warehouseConnectionUuid: 'connection_a' },
    });
    rerender(tree());
    await screen.findByRole('dialog');
    expect(state.api).toHaveBeenCalledOnce();
    expect(state.api.mock.calls[0][0].url).toContain(
        'warehouseConnectionUuid=connection_a',
    );
});

test('a pending popup cannot verify or restore a different selected connection', async () => {
    state.binding = 'connection_a';
    state.deferPopup = true;
    state.api.mockResolvedValue({
        ...personal,
        personalSelection: { warehouseConnectionUuid: 'connection_a' },
    });
    const restored = vi.fn();
    window.addEventListener(SHARED_SIGN_IN_RECONNECTED, restored);
    const { rerender, tree } = mount();
    await screen.findByRole('dialog');
    await userEvent.click(
        screen.getByRole('button', { name: 'Sign in with Google' }),
    );
    const finishA = state.popupCallback!;
    state.binding = 'connection_b';
    state.api.mockResolvedValue({
        ...personal,
        personalSelection: { warehouseConnectionUuid: 'connection_b' },
        personalSignIn: {
            ...personal.personalSignIn!,
            userWarehouseCredentialsUuid: 'credential_b',
            expired: false,
        },
    });
    rerender(tree());
    await waitFor(() => expect(state.executed).toHaveBeenCalledOnce());
    await act(async () => finishA());
    expect(restored).not.toHaveBeenCalled();
    expect(state.success).not.toHaveBeenCalled();
    expect(state.api).toHaveBeenCalledTimes(2);
    expect(
        state.api.mock.calls.some(([request]) => request.method === 'POST'),
    ).toBe(false);
    window.removeEventListener(SHARED_SIGN_IN_RECONNECTED, restored);
});

test.each(['legacy', 'unknown', 'different-credential', 'different-provider'])(
    'personal popup verification rejects %s without a shared POST',
    async (kind) => {
        state.binding = 'connection_a';
        const bound = {
            ...personal,
            personalSelection: { warehouseConnectionUuid: 'connection_a' },
        };
        const healthy = {
            ...bound,
            personalSignIn: { ...personal.personalSignIn!, expired: false },
        };
        const response =
            kind === 'legacy'
                ? shared
                : kind === 'unknown'
                  ? { ...healthy, statusUnknown: true }
                  : {
                        ...healthy,
                        personalSignIn: {
                            ...healthy.personalSignIn,
                            ...(kind === 'different-credential'
                                ? {
                                      userWarehouseCredentialsUuid:
                                          'credential_b',
                                  }
                                : { provider: PersonSignInProvider.SNOWFLAKE }),
                        },
                    };
        state.api.mockResolvedValueOnce(bound).mockResolvedValue(response);
        mount();
        await screen.findByRole('dialog');
        await userEvent.click(
            screen.getByRole('button', { name: 'Sign in with Google' }),
        );
        expect(
            await screen.findByText(
                'Sign in with Google did not finish. Try again.',
            ),
        ).toBeVisible();
        expect(
            state.api.mock.calls.some(([request]) => request.method === 'POST'),
        ).toBe(false);
        expect(state.success).not.toHaveBeenCalled();
    },
);

test.each(
    [false, true].flatMap((reconnect) =>
        [false, true].flatMap((expiry) =>
            ['structured', 'raw', 'cached'].map((kind) => ({
                reconnect,
                expiry,
                kind,
            })),
        ),
    ),
)(
    'shared error recovery preserves the main flag contract: %j',
    async ({ reconnect, expiry, kind }) => {
        state.reconnect = reconnect;
        state.expiry = expiry;
        const { personalSelection: omitted, ...legacy } = shared;
        state.api.mockResolvedValue(legacy);
        const detail = {
            name: 'BigqueryTokenError',
            statusCode: 401,
            message: `${BIGQUERY_TOKEN_ERROR_MESSAGE_MARKER} (invalid_grant)`,
            data:
                kind === 'raw'
                    ? {}
                    : {
                          sharedSignIn: {
                              projectUuid: state.projectUuid,
                              provider: shared.provider,
                              subjectUserUuid: state.userUuid,
                              subjectBasis: shared.subjectBasis,
                          },
                      },
        };
        const error = { error: detail };
        mount(
            undefined,
            kind === 'cached'
                ? (client) => {
                      client
                          .getQueryCache()
                          .build(client, {
                              queryKey: ['query-results', state.projectUuid],
                          })
                          .setState({ status: 'error', error });
                  }
                : undefined,
        );
        if (reconnect && expiry && kind !== 'cached')
            await waitFor(() => expect(state.executed).toHaveBeenCalled());
        if (kind !== 'cached')
            act(() => {
                window.dispatchEvent(
                    new CustomEvent(SHARED_SIGN_IN_QUERY_FAILED, {
                        detail: { projectUuid: state.projectUuid, error },
                    }),
                );
            });
        if (reconnect) {
            expect(await screen.findByRole('dialog')).toHaveTextContent(
                'Sign in again to restore this project',
            );
            if (kind !== 'raw')
                expect(
                    shouldSuppressSharedSignInToast(detail, state.projectUuid),
                ).toBe(true);
            expect(state.warning).not.toHaveBeenCalled();
        } else {
            expect(screen.queryByRole('dialog')).toBeNull();
            expect(state.api).not.toHaveBeenCalled();
            expect(state.warning).toHaveBeenCalledTimes(kind === 'raw' ? 0 : 1);
        }
    },
);

test.each(['permission', 'session', 'personal', 'other-project', 'extra'])(
    'message-off shared recovery rejects %s failures',
    async (kind) => {
        state.expiry = false;
        if (kind === 'extra') state.binding = 'connection_a';
        const { personalSelection: omitted, ...legacy } = shared;
        state.api.mockResolvedValue(legacy);
        mount();
        act(() => {
            window.dispatchEvent(
                new CustomEvent(SHARED_SIGN_IN_QUERY_FAILED, {
                    detail: {
                        projectUuid:
                            kind === 'other-project'
                                ? 'project_b'
                                : state.projectUuid,
                        error: {
                            error:
                                kind === 'personal'
                                    ? personalError
                                    : {
                                          name:
                                              kind === 'permission'
                                                  ? 'ForbiddenError'
                                                  : kind === 'session'
                                                    ? 'AuthorizationError'
                                                    : 'BigqueryTokenError',
                                          statusCode:
                                              kind === 'permission' ? 403 : 401,
                                          message:
                                              kind === 'permission'
                                                  ? 'Permission denied'
                                                  : kind === 'session'
                                                    ? 'Login required'
                                                    : BIGQUERY_TOKEN_ERROR_MESSAGE_MARKER,
                                      },
                        },
                    },
                }),
            );
        });
        expect(state.api).not.toHaveBeenCalled();
        expect(screen.queryByRole('dialog')).toBeNull();
    },
);

test('a shared failure during the proactive cooldown rechecks when the cooldown ends', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    state.api.mockResolvedValue({ ...shared, expired: false });
    const view = mount();
    try {
        await act(async () => {
            await vi.advanceTimersByTimeAsync(0);
        });
        expect(state.api).toHaveBeenCalledOnce();
        state.api.mockResolvedValue(shared);
        act(() => {
            window.dispatchEvent(
                new CustomEvent(SHARED_SIGN_IN_QUERY_FAILED, {
                    detail: {
                        projectUuid: state.projectUuid,
                        error: {
                            error: {
                                name: 'BigqueryTokenError',
                                statusCode: 401,
                                message: BIGQUERY_TOKEN_ERROR_MESSAGE_MARKER,
                            },
                        },
                    },
                }),
            );
        });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(59_999);
        });
        expect(state.api).toHaveBeenCalledOnce();
        expect(screen.queryByRole('dialog')).toBeNull();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(1);
        });
        expect(state.api).toHaveBeenCalledTimes(2);
        expect(screen.getByRole('dialog')).toHaveTextContent(
            'Sign in again to restore this project',
        );
    } finally {
        view.unmount();
        view.client.clear();
        vi.useRealTimers();
    }
});

test('replays every mounted root once through the actual modal gate, including an Infinity-fresh sibling and duplicate observers', async () => {
    state.realQueries = true;
    const calls = new Map<string, number>();
    const oldPending = Promise.withResolvers<never>();
    const oldPoll = Promise.withResolvers<unknown>();
    let repaired = false;
    state.api.mockImplementation(
        async ({
            method,
            url,
            body,
        }: {
            method: string;
            url: string;
            body?: string;
        }) => {
            if (url.includes('shared-sign-in'))
                return {
                    ...personal,
                    personalSignIn: {
                        ...personal.personalSignIn!,
                        expired: !repaired,
                    },
                };
            if (method === 'POST') {
                const { chartUuid } = JSON.parse(body!);
                const count = (calls.get(chartUuid) ?? 0) + 1;
                calls.set(chartUuid, count);
                if (chartUuid === 'inflight' && count === 1)
                    return oldPending.promise;
                return { queryUuid: `${chartUuid}_${count}` };
            }
            if (url.includes('/query/')) {
                const queryUuid = url.split('/query/')[1].split('?')[0];
                if (queryUuid === 'pending_poll_1') return oldPoll.promise;
                return {
                    queryUuid,
                    status:
                        queryUuid.startsWith('failed') && !repaired
                            ? QueryHistoryStatus.ERROR
                            : QueryHistoryStatus.READY,
                    error: getExpiredPersonalSignInMessage({
                        provider: PersonSignInProvider.GOOGLE,
                    }),
                    rows: [],
                    columns: {},
                    totalResults: 0,
                    metadata: { performance: {} },
                };
            }
            return [];
        },
    );
    const outsideRuns = vi.fn(async () => ({}));
    const stops: (() => void)[] = [];
    const { rerender, tree, client } = mount(
        '/projects/project_a/sql-runner',
        (client) => {
            for (const queryKey of [
                ['tables', 'project_a'],
                ['create-query', { projectUuid: 'project_b' }],
            ]) {
                const observer = new QueryObserver(client, {
                    queryKey,
                    queryFn: outsideRuns,
                    staleTime: Infinity,
                });
                stops.push(observer.subscribe(() => {}));
            }
        },
    );
    await screen.findByRole('dialog');
    expect(calls.size).toBe(0);
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
    await waitFor(() => expect(calls.get('failed_c')).toBe(1));
    await waitFor(() => expect(state.toastError).not.toHaveBeenCalled());
    state.showRemoved = false;
    rerender(tree());
    await userEvent.click(screen.getByRole('button', { name: 'Reconnect' }));
    await screen.findByRole('dialog');
    expect(
        client
            .getQueryCache()
            .find([
                'create-query',
                {
                    projectUuid: 'project_a',
                    tableId: 'table_a',
                    chartUuid: 'healthy',
                },
                [],
            ])
            ?.isActive(),
    ).toBe(false);
    repaired = true;
    await userEvent.click(
        screen.getByRole('button', { name: 'Sign in with Google' }),
    );
    await waitFor(() => expect(calls.get('healthy')).toBe(2));
    await waitFor(() => expect(calls.get('inflight')).toBe(2));
    for (const name of [
        'failed_a',
        'failed_b',
        'failed_c',
        'healthy',
        'inflight',
    ])
        expect(calls.get(name)).toBe(2);
    expect(calls.get('removed')).toBe(1);
    expect(calls.get('other_project')).toBeUndefined();
    expect(calls.get('disabled')).toBeUndefined();
    await act(async () =>
        oldPending.reject({ status: 'error', error: personalError }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByRole('button', { name: 'Reconnect' })).toBeNull();
    expect(state.success).toHaveBeenCalledOnce();
    await act(async () =>
        oldPoll.resolve({
            queryUuid: 'pending_poll_1',
            status: QueryHistoryStatus.ERROR,
            error: getExpiredPersonalSignInMessage({
                provider: PersonSignInProvider.GOOGLE,
            }),
        }),
    );
    expect(state.toastError).not.toHaveBeenCalled();
    expect(outsideRuns).toHaveBeenCalledTimes(2);
    stops.forEach((stop) => stop());
});

test.each([
    { reconnect: false, expiry: false },
    { reconnect: false, expiry: true },
    { reconnect: true, expiry: false },
])(
    'keeps raw 401 health handling through the real flag boundary: %j',
    async (flags) => {
        state.reconnect = flags.reconnect;
        state.expiry = flags.expiry;
        state.realQueries = true;
        state.api.mockImplementation(
            async ({
                method,
                url,
                body,
            }: {
                method: string;
                url: string;
                body?: string;
            }) => {
                if (url.includes('shared-sign-in')) return shared;
                if (method === 'POST')
                    return {
                        queryUuid: `${JSON.parse(body!).chartUuid}_query`,
                    };
                if (url.includes('/query/'))
                    return {
                        queryUuid: 'query_a',
                        status: QueryHistoryStatus.ERROR,
                        error: BIGQUERY_TOKEN_ERROR_MESSAGE_MARKER,
                    };
                return [];
            },
        );
        const { client } = mount();
        const invalidate = vi.spyOn(client, 'invalidateQueries');
        await waitFor(() =>
            expect(invalidate).toHaveBeenCalledWith(['health']),
        );
        expect(state.toastError).not.toHaveBeenCalled();
        expect(state.warning).not.toHaveBeenCalled();
        if (flags.reconnect) await screen.findByRole('dialog');
        else expect(screen.queryByRole('dialog')).toBeNull();
    },
);
test('an old popup cannot close or replay a newer expired selection', async () => {
    state.binding = 'connection_a';
    state.deferPopup = true;
    let repaired = false;
    state.api.mockImplementation(async () => ({
        ...personal,
        personalSelection: { warehouseConnectionUuid: state.binding },
        personalSignIn: {
            ...personal.personalSignIn!,
            userWarehouseCredentialsUuid:
                state.binding === 'connection_a'
                    ? 'credential_a'
                    : 'credential_b',
            expired: !repaired,
        },
    }));
    const { rerender, tree } = mount();
    await screen.findByRole('dialog');
    await userEvent.click(
        screen.getByRole('button', { name: 'Sign in with Google' }),
    );
    const finishA = state.popupCallback!;
    state.binding = 'connection_b';
    rerender(tree());
    await waitFor(() => expect(state.api).toHaveBeenCalledTimes(2));
    await screen.findByRole('dialog');
    const before = state.executed.mock.calls.length;
    await act(async () => finishA());
    expect(state.api).toHaveBeenCalledTimes(2);
    expect(state.success).not.toHaveBeenCalled();
    expect(state.executed).toHaveBeenCalledTimes(before);
    expect(screen.getByRole('dialog')).toBeVisible();
    await userEvent.click(
        screen.getByRole('button', { name: 'Sign in with Google' }),
    );
    expect(state.popup).toHaveBeenLastCalledWith({
        light: true,
        personalCredentialUuid: 'credential_b',
    });
    repaired = true;
    await act(async () => state.popupCallback!());
    await waitFor(() => expect(state.success).toHaveBeenCalledOnce());
    expect(screen.queryByRole('dialog')).toBeNull();
});

test('a dismissed verification cannot complete after the same target modal reopens', async () => {
    const verification = Promise.withResolvers<SharedSignInStatus>();
    state.api
        .mockResolvedValueOnce(personal)
        .mockReturnValueOnce(verification.promise)
        .mockResolvedValue({
            ...personal,
            personalSignIn: { ...personal.personalSignIn!, expired: false },
        });
    mount();
    await screen.findByRole('dialog');
    await userEvent.click(
        screen.getByRole('button', { name: 'Sign in with Google' }),
    );
    await waitFor(() => expect(state.api).toHaveBeenCalledTimes(2));
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
    await userEvent.click(screen.getByRole('button', { name: 'Reconnect' }));
    await act(async () =>
        verification.resolve({
            ...personal,
            personalSignIn: { ...personal.personalSignIn!, expired: false },
        }),
    );
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(state.success).not.toHaveBeenCalled();
    await userEvent.click(
        screen.getByRole('button', { name: 'Sign in with Google' }),
    );
    await waitFor(() => expect(state.success).toHaveBeenCalledOnce());
});

test.each([personal, shared])(
    'accepts a second fresh rejection and repair without queuing old failures: %j',
    async (initial) => {
        state.realQueries = true;
        let expired = true;
        let rejectNext = false;
        const calls = new Map<string, number>();
        const failure = initial.personalSignIn
            ? { status: 'error', error: personalError }
            : {
                  status: 'error',
                  error: {
                      name: 'WarehouseSignInExpiredError',
                      statusCode: 401,
                      message: 'expired',
                      data: {
                          sharedSignIn: {
                              projectUuid: 'project_a',
                              provider: shared.provider,
                              subjectUserUuid: 'user_a',
                              subjectBasis: shared.subjectBasis,
                          },
                      },
                  },
              };
        state.api.mockImplementation(
            async ({
                method,
                url,
                body,
            }: {
                method: string;
                url: string;
                body?: string;
            }) => {
                if (url.includes('shared-sign-in')) {
                    if (method === 'POST') return { status: 'ok' };
                    return initial.personalSignIn
                        ? {
                              ...initial,
                              personalSignIn: {
                                  ...initial.personalSignIn,
                                  expired,
                              },
                          }
                        : { ...initial, expired };
                }
                if (method === 'POST') {
                    const { chartUuid } = JSON.parse(body!);
                    const count = (calls.get(chartUuid) ?? 0) + 1;
                    calls.set(chartUuid, count);
                    if (chartUuid === 'healthy' && rejectNext) {
                        rejectNext = false;
                        throw failure;
                    }
                    return { queryUuid: `${chartUuid}_${count}` };
                }
                return {
                    status: QueryHistoryStatus.READY,
                    rows: [],
                    columns: {},
                    totalResults: 0,
                    metadata: { performance: {} },
                };
            },
        );
        const { client } = mount();
        await screen.findByRole('dialog');
        const preflight = getActiveWarehouseSignInPreflight()!;
        const retired = captureSharedSignInQueryScope('project_a', null);
        const release = preflight.register(
            'expired_sibling',
            'connection_b',
            0,
        );
        act(() => {
            preflight.settle(
                'connection_b',
                preflight.checks.get('connection_b')!.generation,
                {
                    ...personal,
                    personalSelection: {
                        warehouseConnectionUuid: 'connection_b',
                    },
                },
            );
        });
        expired = false;
        await userEvent.click(
            screen.getByRole('button', { name: 'Sign in with Google' }),
        );
        await waitFor(() => expect(calls.get('healthy')).toBe(1));
        await waitFor(() => expect(state.success).toHaveBeenCalledOnce());
        act(() => {
            reportSharedSignInQueryFailure('project_a', failure, retired);
        });
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(screen.queryByRole('button', { name: 'Reconnect' })).toBeNull();
        const clock = vi
            .spyOn(Date, 'now')
            .mockReturnValue(Date.now() + 60_001);
        try {
            expired = true;
            rejectNext = true;
            await act(async () => {
                await client.refetchQueries({
                    predicate: (q) =>
                        q.queryKey[0] === 'create-query' &&
                        (q.queryKey[1] as { chartUuid?: string })?.chartUuid ===
                            'healthy',
                });
            });
            expect(await screen.findByRole('dialog')).toBeVisible();
            expired = false;
            await userEvent.click(
                screen.getByRole('button', { name: 'Sign in with Google' }),
            );
            await waitFor(() => expect(state.success).toHaveBeenCalledTimes(2));
            await waitFor(() => expect(calls.get('healthy')).toBe(3));
            for (const name of [
                'failed_a',
                'failed_b',
                'failed_c',
                'inflight',
                'pending_poll',
            ])
                expect(calls.get(name)).toBe(2);
            act(() => {
                reportSharedSignInQueryFailure('project_a', failure, retired);
            });
            expect(screen.queryByRole('dialog')).toBeNull();
            expect(
                screen.queryByRole('button', { name: 'Reconnect' }),
            ).toBeNull();
        } finally {
            clock.mockRestore();
            release();
        }
    },
);

test('a current healthy selected status cannot be overridden by stale personal failure metadata', async () => {
    state.api.mockResolvedValue({
        ...personal,
        personalSignIn: { ...personal.personalSignIn!, expired: false },
    });
    mount();
    await waitFor(() => expect(state.executed).toHaveBeenCalledOnce());
    const scope = captureSharedSignInQueryScope('project_a', null);
    act(() =>
        reportSharedSignInQueryFailure(
            'project_a',
            { status: 'error', error: personalError },
            scope,
        ),
    );
    await waitFor(() => expect(state.api).toHaveBeenCalledTimes(2));
    await act(async () => {});
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reconnect' })).toBeNull();
});

test('a fresh current rejection after healthy preflight still opens recovery', async () => {
    state.api
        .mockResolvedValueOnce({
            ...personal,
            personalSignIn: { ...personal.personalSignIn!, expired: false },
        })
        .mockResolvedValue(personal);
    mount();
    await waitFor(() => expect(state.executed).toHaveBeenCalledOnce());
    const scope = captureSharedSignInQueryScope('project_a', null);
    act(() =>
        reportSharedSignInQueryFailure(
            'project_a',
            { status: 'error', error: personalError },
            scope,
        ),
    );
    expect(await screen.findByRole('dialog')).toBeVisible();
    expect(state.api).toHaveBeenCalledTimes(2);
});

test('dismissal during cancellation preparation abandons the old attempt and permits the reopened target repair', async () => {
    state.api.mockResolvedValueOnce(personal).mockResolvedValue({
        ...personal,
        personalSignIn: { ...personal.personalSignIn!, expired: false },
    });
    const { client } = mount();
    await screen.findByRole('dialog');
    const preflight = getActiveWarehouseSignInPreflight()!;
    const target = preflight.target;
    const scope = captureSharedSignInQueryScope('project_a', null);
    const pending = Promise.withResolvers<void>();
    const cancel = vi
        .spyOn(client, 'cancelQueries')
        .mockReturnValueOnce(pending.promise);
    await userEvent.click(
        screen.getByRole('button', { name: 'Sign in with Google' }),
    );
    await waitFor(() => expect(cancel).toHaveBeenCalledOnce());
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
    await userEvent.click(screen.getByRole('button', { name: 'Reconnect' }));
    expect(preflight.target).toBe(target);
    await act(async () => pending.resolve());
    expect(state.success).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeVisible();
    const restored = vi.fn();
    window.addEventListener(SHARED_SIGN_IN_RECONNECTED, restored);
    try {
        await userEvent.click(
            screen.getByRole('button', { name: 'Sign in with Google' }),
        );
        await waitFor(() => expect(state.success).toHaveBeenCalledOnce());
        expect(restored).toHaveBeenCalledOnce();
        expect(
            canReplayRestoredSql(scope, restored.mock.calls[0][0].detail),
        ).toBe(true);
        expect(screen.queryByRole('dialog')).toBeNull();
    } finally {
        window.removeEventListener(SHARED_SIGN_IN_RECONNECTED, restored);
        cancel.mockRestore();
    }
});

test('a second shared episode waits for its healthy-status cooldown and then accepts one repair', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    state.api.mockResolvedValue(shared);
    const view = mount();
    try {
        await act(async () => {
            await vi.advanceTimersByTimeAsync(0);
        });
        const preflight = getActiveWarehouseSignInPreflight()!;
        const first = preflight.target!;
        await act(async () => {
            const detail = await completeSharedSignInRestoration(
                view.client,
                first,
            );
            window.dispatchEvent(
                new CustomEvent(SHARED_SIGN_IN_RECONNECTED, { detail }),
            );
        });
        expect(preflight.target).toBeNull();
        const scope = captureSharedSignInQueryScope('project_a', null);
        const error = {
            error: {
                name: 'BigqueryTokenError',
                statusCode: 401,
                message: BIGQUERY_TOKEN_ERROR_MESSAGE_MARKER,
                data: {},
            },
        };
        state.api.mockResolvedValue({ ...shared, expired: false });
        await act(async () => {
            reportSharedSignInQueryFailure('project_a', error, scope);
            await vi.advanceTimersByTimeAsync(0);
        });
        expect(state.api).toHaveBeenCalledTimes(2);
        state.api.mockResolvedValue(shared);
        await act(async () => {
            reportSharedSignInQueryFailure('project_a', error, scope);
            await vi.advanceTimersByTimeAsync(59_999);
        });
        expect(state.api).toHaveBeenCalledTimes(2);
        expect(preflight.target).toBeNull();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(1);
        });
        expect(state.api).toHaveBeenCalledTimes(3);
        expect(screen.getByRole('dialog')).toBeVisible();
        expect(preflight.target).not.toBe(first);
        await act(async () => {
            const detail = await completeSharedSignInRestoration(
                view.client,
                preflight.target!,
            );
            expect(detail?.recoveryGeneration).toBe(2);
            window.dispatchEvent(
                new CustomEvent(SHARED_SIGN_IN_RECONNECTED, { detail }),
            );
        });
        expect(preflight.target).toBeNull();
    } finally {
        view.unmount();
        view.client.clear();
        vi.useRealTimers();
    }
});

test.each([
    ['original', 'extra', 'expired-first'],
    ['original', 'extra', 'healthy-first'],
    ['extra', 'original', 'expired-first'],
    ['extra', 'original', 'healthy-first'],
])(
    'does not queue the known expired mounted sibling after repairing %s with %s and %s completion',
    async (first, sibling, order) => {
        state.boundRoots = [first, sibling, 'healthy'];
        const expired = new Set([first, sibling]);
        const calls = new Map<string, number>();
        const lateSibling = Promise.withResolvers<unknown>();
        const lateRepaired = Promise.withResolvers<unknown>();
        const lateHealthy = Promise.withResolvers<unknown>();
        const statusFor = (name: string): SharedSignInStatus => ({
            ...personal,
            personalSelection: {
                warehouseConnectionUuid:
                    name === 'original' ? null : `connection_${name}`,
            },
            personalSignIn: {
                ...personal.personalSignIn!,
                userWarehouseCredentialsUuid: `credential_${name}`,
                expired: expired.has(name),
            },
        });
        const response = (name: string) => ({
            status: 'error',
            error: {
                ...personalError,
                data: { personalSignIn: statusFor(name).personalSignIn },
            },
        });
        state.api.mockImplementation(
            async ({
                url,
                method,
                body,
            }: {
                url: string;
                method: string;
                body?: string;
            }) => {
                if (url.includes('shared-sign-in')) {
                    const binding = new URLSearchParams(url.split('?')[1]).get(
                        'warehouseConnectionUuid',
                    );
                    return statusFor(
                        binding?.replace('connection_', '') ?? 'original',
                    );
                }
                if (method === 'POST') {
                    const name = JSON.parse(body!).chartUuid;
                    const count = (calls.get(name) ?? 0) + 1;
                    calls.set(name, count);
                    if (count === 2 && name === sibling)
                        return lateSibling.promise;
                    if (count === 2 && name === first)
                        return lateRepaired.promise;
                    if (count === 2 && name === 'healthy')
                        return lateHealthy.promise;
                    if (expired.has(name)) throw response(name);
                    return { queryUuid: `${name}_${count}` };
                }
                if (url.includes('/query/'))
                    return {
                        status: QueryHistoryStatus.READY,
                        rows: [],
                        columns: {},
                        totalResults: 0,
                        metadata: { performance: {} },
                    };
                return [];
            },
        );
        const { client } = mount('/projects/project_a/dashboards/dashboard_a');
        await screen.findByRole('dialog');
        const preflight = getActiveWarehouseSignInPreflight()!;
        expect(
            [...preflight.checks.values()].map((check) => check.priority),
        ).toEqual([0, 0, 0]);
        expect(
            preflight.target?.status.personalSignIn
                ?.userWarehouseCredentialsUuid,
        ).toBe(`credential_${first}`);
        await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
        await waitFor(() => expect([...calls.values()]).toEqual([1, 1, 1]));
        await userEvent.click(
            screen.getByRole('button', { name: 'Reconnect' }),
        );
        expired.delete(first);
        await userEvent.click(
            screen.getByRole('button', { name: 'Sign in with Google' }),
        );
        await waitFor(() => expect(calls.get(sibling)).toBe(2));
        if (order === 'healthy-first')
            await act(async () => {
                lateRepaired.resolve({ queryUuid: `${first}_2` });
                lateHealthy.resolve({ queryUuid: 'healthy_2' });
            });
        await act(async () => {
            lateSibling.reject(response(sibling));
        });
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(preflight.target).toBeNull();
        if (order === 'expired-first')
            await act(async () => {
                lateRepaired.resolve({ queryUuid: `${first}_2` });
                lateHealthy.resolve({ queryUuid: 'healthy_2' });
            });
        await waitFor(() => expect(state.success).toHaveBeenCalledOnce());
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(screen.queryByRole('button', { name: 'Reconnect' })).toBeNull();
        expect([...calls.values()]).toEqual([2, 2, 2]);
        const clock = vi
            .spyOn(Date, 'now')
            .mockReturnValue(Date.now() + 60_001);
        try {
            expired.add(first);
            await act(async () => {
                await client.refetchQueries({
                    predicate: (query) =>
                        query.queryKey[0] === 'create-query' &&
                        (query.queryKey[1] as { chartUuid?: string })
                            ?.chartUuid === first,
                });
            });
            expect(await screen.findByRole('dialog')).toBeVisible();
            expect(
                preflight.target?.status.personalSignIn
                    ?.userWarehouseCredentialsUuid,
            ).toBe(`credential_${first}`);
            expired.delete(first);
            await userEvent.click(
                screen.getByRole('button', { name: 'Sign in with Google' }),
            );
            await waitFor(() => expect(state.success).toHaveBeenCalledTimes(2));
            await waitFor(() => expect(calls.get(first)).toBe(4));
            expect(calls.get(sibling)).toBe(3);
            expect(calls.get('healthy')).toBe(3);
            expect(screen.queryByRole('dialog')).toBeNull();
            expect(
                screen.queryByRole('button', { name: 'Reconnect' }),
            ).toBeNull();
        } finally {
            clock.mockRestore();
        }
    },
);

test('a later current personal rejection presents recovery after an unknown status without reusing the healthy preflight', async () => {
    let statusReads = 0;
    state.api.mockImplementation(async ({ url }: { url: string }) => {
        if (!url.includes('shared-sign-in')) return [];
        statusReads += 1;
        return {
            ...personal,
            statusUnknown: statusReads === 2,
            personalSignIn: {
                ...personal.personalSignIn!,
                expired: statusReads > 1,
            },
        };
    });
    mount();
    await waitFor(() => expect(state.executed).toHaveBeenCalledOnce());
    const reject = () =>
        reportSharedSignInQueryFailure(
            'project_a',
            { status: 'error', error: personalError },
            captureSharedSignInQueryScope('project_a', null),
        );
    await act(async () => {
        reject();
    });
    expect(statusReads).toBe(2);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reconnect' })).toBeNull();
    await act(async () => {
        reject();
    });
    expect(await screen.findByRole('dialog')).toBeVisible();
    expect(statusReads).toBe(3);
});

test('restores the mounted failed warehouse catalogue after accepted sign-in without replaying healthy catalogue', async () => {
    state.catalogue = true;
    let repaired = false;
    const calls = { tables: 0, fields: 0, data: 0 };
    state.api.mockImplementation(
        async ({ url, method }: { url: string; method: string }) => {
            if (url.includes('shared-sign-in'))
                return {
                    ...personal,
                    personalSignIn: {
                        ...personal.personalSignIn!,
                        expired: !repaired,
                    },
                };
            if (url.endsWith('/sqlRunner/tables')) {
                calls.tables += 1;
                if (!repaired) throw { status: 'error', error: personalError };
                return { database_a: { schema_a: { table_a: {} } } };
            }
            if (url.includes('/sqlRunner/fields')) {
                calls.fields += 1;
                return { field_a: 'string' };
            }
            if (method === 'POST') {
                calls.data += 1;
                if (!repaired) throw { status: 'error', error: personalError };
                return { queryUuid: 'query_ready' };
            }
            if (url.includes('/query/'))
                return {
                    status: QueryHistoryStatus.READY,
                    rows: [],
                    columns: {},
                    totalResults: 0,
                    metadata: { performance: {} },
                };
            return [];
        },
    );
    mount();
    await screen.findByRole('dialog');
    await waitFor(() => expect(calls.tables).toBe(1));
    expect(screen.getByText('Catalogue unavailable')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
    await waitFor(() => expect(calls.data).toBe(1));
    await userEvent.click(screen.getByRole('button', { name: 'Reconnect' }));
    repaired = true;
    await userEvent.click(
        screen.getByRole('button', { name: 'Sign in with Google' }),
    );
    await waitFor(() => expect(calls.data).toBe(2));
    await waitFor(() => expect(calls.tables).toBe(2));
    expect(await screen.findByText(/table_a/)).toBeVisible();
    expect(calls.fields).toBe(1);
    expect(screen.queryByRole('dialog')).toBeNull();
});

test.each(['fields', 'extra', 'original-route'] as const)(
    'recovers only current failed warehouse catalogue requests through real %s hooks',
    async (kind) => {
        state.catalogueFields = kind === 'fields';
        state.catalogueExtra = kind !== 'fields';
        state.catalogueConnection =
            kind === 'original-route' ? 'original_a' : 'connection_a';
        state.binding = kind === 'extra' ? 'connection_a' : null;
        state.catalogueProject = 'project_b';
        const calls = new Map<string, number>();
        let repaired = false;
        state.api.mockImplementation(async ({ url }: { url: string }) => {
            if (url.includes('shared-sign-in'))
                return {
                    ...personal,
                    personalSelection: {
                        warehouseConnectionUuid: state.binding,
                    },
                    personalSignIn: {
                        ...personal.personalSignIn!,
                        expired: !repaired,
                    },
                };
            calls.set(url, (calls.get(url) ?? 0) + 1);
            if (url.endsWith('/sqlRunner/connections'))
                return [
                    {
                        warehouseConnectionUuid: state.catalogueConnection,
                        isOriginal: kind === 'original-route',
                    },
                ];
            if (url.includes('database_healthy'))
                return {
                    database_healthy: { schema_a: { healthy_table: {} } },
                };
            if (!repaired) throw { status: 'error', error: personalError };
            if (url.endsWith('/databases'))
                return {
                    databases: [{ name: 'database_a' }],
                    truncated: false,
                    limit: 100,
                };
            if (url.includes('/fields')) return { field_a: 'string' };
            return { database_a: { schema_a: { table_a: {} } } };
        });
        const view = mount();
        await screen.findByRole('dialog');
        await waitFor(() =>
            expect(
                [...calls.keys()].filter((url) => url.includes('/fields'))
                    .length,
            ).toBe(2),
        );
        state.catalogueEnabled = false;
        view.rerender(view.tree());
        repaired = true;
        await userEvent.click(
            screen.getByRole('button', { name: 'Sign in with Google' }),
        );
        await waitFor(() => expect(state.success).toHaveBeenCalledOnce());
        await waitFor(() => {
            for (const [url, count] of calls) {
                const excluded =
                    url.includes('project_b') ||
                    url.includes('connection_other') ||
                    url.includes('database_healthy') ||
                    url.includes('database_disabled') ||
                    url.endsWith('/sqlRunner/connections');
                expect(count).toBe(excluded ? 1 : 2);
            }
        });
        expect(await screen.findByText(/field_a/)).toBeVisible();
        const receipt = new CustomEvent(SHARED_SIGN_IN_RECONNECTED, {
            detail: {},
        });
        act(() => {
            window.dispatchEvent(receipt);
        });
        for (const [url, count] of calls)
            expect(count).toBe(
                url.includes('project_b') ||
                    url.includes('connection_other') ||
                    url.includes('database_healthy') ||
                    url.includes('database_disabled') ||
                    url.endsWith('/sqlRunner/connections')
                    ? 1
                    : 2,
            );
    },
);

test.each([
    'accepted',
    'abandoned',
    'shared',
    'healthy',
    'permission',
    'network',
    'other-row',
    'unmounted',
    'selection',
    'user',
    'page',
    'superseded',
    'late',
    'pending-selection',
    'pending-other-selection',
] as const)(
    'keeps warehouse catalogue recovery scoped to the accepted current failure: %s',
    async (kind) => {
        state.catalogue = true;
        state.pageSourceMounted = !kind.startsWith('pending-');
        let repaired = false;
        let superseded = false;
        const pending = Promise.withResolvers<never>();
        const calls = { tables: 0, data: 0 };
        let receipt: unknown;
        const onReceipt = (event: Event) => {
            if (event instanceof CustomEvent) receipt = event.detail;
        };
        window.addEventListener(SHARED_SIGN_IN_RECONNECTED, onReceipt);
        const failure =
            kind === 'shared'
                ? {
                      ...personalError,
                      data: {
                          sharedSignIn: {
                              projectUuid: 'project_a',
                              provider: PersonSignInProvider.GOOGLE,
                              subjectUserUuid: 'user_a',
                              subjectBasis: SignInSubjectBasis.RECORDED,
                          },
                      },
                  }
                : personalError;
        state.api.mockImplementation(
            async ({ url, method }: { url: string; method: string }) => {
                if (url.includes('shared-sign-in')) {
                    if (method === 'POST') return { status: 'ok' };
                    return kind === 'shared'
                        ? { ...shared, expired: !repaired }
                        : {
                              ...personal,
                              personalSelection: {
                                  warehouseConnectionUuid: state.binding,
                              },
                              personalSignIn: {
                                  ...personal.personalSignIn!,
                                  expired: !repaired,
                              },
                          };
                }
                if (url.endsWith('/sqlRunner/tables')) {
                    calls.tables += 1;
                    if (kind === 'late' && calls.tables === 1)
                        return pending.promise;
                    if (!repaired && kind !== 'healthy') {
                        const error = {
                            ...failure,
                            statusCode:
                                kind === 'permission' || superseded
                                    ? 403
                                    : kind === 'network'
                                      ? 500
                                      : 400,
                        };
                        if (kind === 'other-row')
                            error.data = {
                                personalSignIn: {
                                    ...personal.personalSignIn!,
                                    userWarehouseCredentialsUuid:
                                        'credential_other',
                                },
                            };
                        throw { status: 'error', error };
                    }
                    return { database_a: { schema_a: { table_a: {} } } };
                }
                if (url.includes('/sqlRunner/fields'))
                    return { field_a: 'string' };
                if (method === 'POST') {
                    calls.data += 1;
                    if (!repaired)
                        throw { status: 'error', error: { ...failure } };
                    return { queryUuid: 'query_ready' };
                }
                if (url.includes('/query/'))
                    return {
                        status: QueryHistoryStatus.READY,
                        rows: [],
                        columns: {},
                        totalResults: 0,
                        metadata: { performance: {} },
                    };
                return [];
            },
        );
        const view = mount();
        try {
            if (kind.startsWith('pending-')) {
                await waitFor(() => expect(calls.tables).toBe(1));
                await act(async () => {});
                expect(getActiveWarehouseSignInPreflight()!.checks.size).toBe(
                    0,
                );
                state.pageSourceMounted = true;
                if (kind === 'pending-other-selection')
                    state.binding = 'connection_b';
                view.rerender(view.tree());
                await screen.findByRole('dialog');
                if (kind === 'pending-other-selection') {
                    state.binding = null;
                    view.rerender(view.tree());
                }
            }
            await screen.findByRole('dialog');
            await waitFor(() => expect(calls.tables).toBe(1));
            await userEvent.click(
                screen.getByRole('button', { name: 'Not now' }),
            );
            await waitFor(() => expect(calls.data).toBe(1));
            if (kind === 'unmounted') {
                state.catalogueMounted = false;
                view.rerender(view.tree());
            }
            if (kind === 'superseded') {
                superseded = true;
                await act(async () => {
                    await view.client.refetchQueries(
                        ['sqlRunner', 'tables', 'project_a'],
                        { exact: true },
                    );
                });
                expect(calls.tables).toBe(2);
            }
            if (kind === 'selection') {
                state.binding = 'connection_b';
                view.rerender(view.tree());
                await screen.findByRole('dialog');
                state.binding = null;
                view.rerender(view.tree());
                await screen.findByRole('dialog');
            } else if (kind === 'user') {
                state.userUuid = 'user_b';
                view.rerender(view.tree());
                await screen.findByRole('dialog');
            } else if (kind === 'page') {
                await userEvent.click(
                    screen.getByRole('button', { name: 'Home' }),
                );
                await userEvent.click(
                    screen.getByRole('button', { name: 'Query route' }),
                );
                await screen.findByRole('dialog');
            } else {
                await userEvent.click(
                    screen.getByRole('button', { name: 'Reconnect' }),
                );
            }
            if (kind === 'abandoned') {
                const hold = Promise.withResolvers<void>();
                const cancel = vi
                    .spyOn(view.client, 'cancelQueries')
                    .mockReturnValueOnce(hold.promise);
                let current = true;
                await act(async () => {
                    const attempt = completeSharedSignInRestoration(
                        view.client,
                        getActiveWarehouseSignInPreflight()!.target!,
                        () => current,
                    );
                    current = false;
                    hold.resolve();
                    expect(await attempt).toBeNull();
                });
                cancel.mockRestore();
                expect(calls.tables).toBe(1);
            }
            repaired = true;
            await userEvent.click(
                screen.getByRole('button', { name: 'Sign in with Google' }),
            );
            await waitFor(() => expect(state.success).toHaveBeenCalledOnce());
            const eligible = [
                'accepted',
                'abandoned',
                'shared',
                'pending-selection',
            ].includes(kind);
            await waitFor(() =>
                expect(calls.tables).toBe(
                    eligible || kind === 'superseded' ? 2 : 1,
                ),
            );
            await waitFor(() => expect(calls.data).toBe(2));
            if (kind === 'late')
                await act(async () => {
                    pending.reject({ status: 'error', error: personalError });
                });
            expect(receipt).toBeTruthy();
            act(() => {
                window.dispatchEvent(
                    new CustomEvent(SHARED_SIGN_IN_RECONNECTED, {
                        detail: { ...(receipt as object) },
                    }),
                );
                window.dispatchEvent(
                    new CustomEvent(SHARED_SIGN_IN_RECONNECTED, {
                        detail: receipt,
                    }),
                );
            });
            expect(calls.tables).toBe(
                eligible || kind === 'superseded' ? 2 : 1,
            );
            expect(calls.data).toBe(2);
            expect(screen.queryByRole('dialog')).toBeNull();
            expect(
                screen.queryByRole('button', { name: 'Reconnect' }),
            ).toBeNull();
        } finally {
            window.removeEventListener(SHARED_SIGN_IN_RECONNECTED, onReceipt);
        }
    },
);

test.each([
    { reconnect: false, expiry: false },
    { reconnect: false, expiry: true },
    { reconnect: true, expiry: false },
])('does not add warehouse catalogue recovery with flags %j', async (flags) => {
    state.catalogue = true;
    state.reconnect = flags.reconnect;
    state.expiry = flags.expiry;
    const calls = { catalogue: 0, status: 0 };
    state.api.mockImplementation(async ({ url }: { url: string }) => {
        if (url.includes('shared-sign-in')) {
            calls.status += 1;
            return personal;
        }
        if (url.endsWith('/sqlRunner/tables')) calls.catalogue += 1;
        throw { status: 'error', error: personalError };
    });
    mount();
    await waitFor(() => expect(calls.catalogue).toBe(1));
    await act(async () => {
        window.dispatchEvent(
            new CustomEvent(SHARED_SIGN_IN_RECONNECTED, {
                detail: { projectUuid: 'project_a' },
            }),
        );
    });
    expect(calls.status).toBe(0);
    expect(calls.catalogue).toBe(1);
    expect(screen.queryByRole('dialog')).toBeNull();
});

test('recovers catalogue requested by the real SQL connection scope while its initial route synchronizes', async () => {
    state.catalogue = true;
    state.realCatalogueScope = true;
    sqlStore.dispatch(resetState());
    sqlStore.dispatch(setProjectUuid('project_a'));
    let repaired = false;
    let calls = 0;
    const registrations: number[] = [];
    state.api.mockImplementation(async ({ url }: { url: string }) => {
        if (url.includes('shared-sign-in'))
            return {
                ...personal,
                personalSignIn: {
                    ...personal.personalSignIn!,
                    expired: !repaired,
                },
            };
        if (url.endsWith('/sqlRunner/tables')) {
            calls += 1;
            registrations.push(
                getActiveWarehouseSignInPreflight()!.checks.size,
            );
            if (!repaired) throw { status: 'error', error: personalError };
            return { database_a: { schema_a: { table_a: {} } } };
        }
        return { field_a: 'string' };
    });
    mount();
    await screen.findByRole('dialog');
    expect(calls).toBe(1);
    expect(registrations[0]).toBe(0);
    expect(sqlStore.getState().sqlRunner.connectionRoute.route).toBe('single');
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
    await userEvent.click(screen.getByRole('button', { name: 'Reconnect' }));
    repaired = true;
    await userEvent.click(
        screen.getByRole('button', { name: 'Sign in with Google' }),
    );
    await waitFor(() => expect(calls).toBe(2));
    expect(await screen.findByText(/table_a/)).toBeVisible();
    expect(screen.queryByRole('dialog')).toBeNull();
});
