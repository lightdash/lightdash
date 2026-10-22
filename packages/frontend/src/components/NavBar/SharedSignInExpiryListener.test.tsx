import {
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
            onLogin();
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
        <>
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
            <SharedSignInQueryBoundary>
                <PageQuery />
            </SharedSignInQueryBoundary>
        </>
    );
};
const mount = (path = '/projects/project_a/sql-runner') => {
    const client = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
        logger: { log: () => {}, warn: () => {}, error: () => {} },
    });
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
    state.api.mockImplementation(
        async ({ method, url }: { method: string; url: string }) =>
            method === 'GET' && url.includes('shared-sign-in')
                ? personal
                : [{ uuid: 'credential_a', needsSignIn: null }],
    );
});

test('starts status on route load and holds query children until the modal can render', async () => {
    const pending = Promise.withResolvers<SharedSignInStatus>();
    state.api.mockReturnValue(pending.promise);
    mount();
    expect(state.api).toHaveBeenCalledWith(
        expect.objectContaining({
            method: 'GET',
            url: expect.stringContaining('includePersonal=true'),
        }),
    );
    expect(state.childMounted).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
    await act(async () => pending.resolve(personal));
    expect(await screen.findByRole('dialog')).toHaveTextContent(
        'Your BigQuery sign-in has expired. Sign in with Google again to load this.',
    );
    expect(state.childMounted).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
    await waitFor(() => expect(state.childMounted).toHaveBeenCalledOnce());
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
    await waitFor(() => expect(state.api).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('button', { name: 'Reconnect' })).toBeVisible();
    expect(shouldSuppressSharedSignInToast(personalError, 'project_a')).toBe(
        true,
    );
    now.mockRestore();
});

test('a current healthy credential clears a dismissed banner', async () => {
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
        expect(screen.queryByRole('button', { name: 'Reconnect' })).toBeNull(),
    );
    expect(shouldSuppressSharedSignInToast(personalError, 'project_a')).toBe(
        false,
    );
    now.mockRestore();
});

test('a failed initial status check releases query children without inventing expiry', async () => {
    state.api.mockRejectedValue(new Error('unavailable'));
    mount();
    await waitFor(() => expect(state.childMounted).toHaveBeenCalledOnce());
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

test('a status response started before reconnect cannot reopen the modal', async () => {
    const pending = Promise.withResolvers<SharedSignInStatus>();
    state.api.mockReturnValue(pending.promise);
    mount();
    await act(async () => {
        window.dispatchEvent(
            new CustomEvent(SHARED_SIGN_IN_RECONNECTED, {
                detail: state.projectUuid,
            }),
        );
    });
    await waitFor(() => expect(state.childMounted).toHaveBeenCalledOnce());
    await act(async () => pending.resolve(personal));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reconnect' })).toBeNull();
    expect(
        shouldSuppressSharedSignInToast(personalError, state.projectUuid),
    ).toBe(false);
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
