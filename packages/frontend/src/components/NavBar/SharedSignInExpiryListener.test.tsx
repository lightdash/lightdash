import {
    BIGQUERY_TOKEN_ERROR_MESSAGE_MARKER,
    FeatureFlags,
    PersonSignInProvider,
    SignInSubjectBasis,
    type SharedSignInStatus,
} from '@lightdash/common';
import { Button, MantineProvider, Text } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { MemoryRouter, useNavigate } from 'react-router';
import { shouldSuppressSharedSignInToast } from '../../hooks/toaster/sharedSignInToastSuppression';
import {
    SHARED_SIGN_IN_QUERY_FAILED,
    SHARED_SIGN_IN_RECONNECTED,
} from '../../hooks/useReconnectSharedSignIn';
import { SharedSignInExpiryListener } from './SharedSignInExpiryListener';
import { SharedSignInQueryBoundary } from './SharedSignInQueryBoundary';
import { WarehouseSignInBanner } from './WarehouseSignInBanner';
import {
    setWarehouseSignInBannerVisibility,
    useWarehouseSignInBanner,
} from './warehouseSignInBannerState';
import { useWarehouseSignInExecution } from './warehouseSignInPreflight';

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
            <PageQuery />
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
