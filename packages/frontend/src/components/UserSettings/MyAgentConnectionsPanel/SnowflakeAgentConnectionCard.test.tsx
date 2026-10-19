import {
    AgentIdentityConnectEntryPoint,
    FeatureFlags,
    UserWarehouseCredentialPurpose,
    type UserWarehouseCredentialsWithAgentStatus,
} from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import {
    QueryClient,
    QueryClientProvider,
    useMutation,
} from '@tanstack/react-query';
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import type * as SnowflakeHooks from '../../../hooks/useSnowflake';
import { credential } from './fixtures';
import { SnowflakeAgentConnectionCard } from './SnowflakeAgentConnectionCard';

const { login, deleteCredentials, popup } = vi.hoisted(() => ({
    login: vi.fn<() => Promise<void>>(),
    popup: vi.fn(),
    deleteCredentials: vi.fn<() => Promise<void>>(),
}));

vi.mock('../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: vi.fn(),
}));

const mockSilentRefreshFlag = (enabled: boolean | undefined) => {
    vi.mocked(useServerFeatureFlag).mockReturnValue({
        data:
            enabled === undefined
                ? undefined
                : { id: FeatureFlags.AgentIdentitySilentRefresh, enabled },
        isLoading: enabled === undefined,
    } as ReturnType<typeof useServerFeatureFlag>);
};

vi.mock('../../../hooks/useSnowflake', async (importOriginal) => ({
    ...(await importOriginal<typeof SnowflakeHooks>()),
    useSnowflakeAiLoginPopup: (attribution: unknown, options: unknown) => {
        popup(attribution, options);
        return useMutation<void, Error>({ mutationFn: login });
    },
}));

vi.mock(
    '../../../hooks/userWarehouseCredentials/useUserWarehouseCredentials',
    () => ({
        useUserWarehouseCredentialsDeleteMutation: () => ({
            mutateAsync: deleteCredentials,
            isLoading: false,
        }),
    }),
);

const renderCard = (
    credentials: UserWarehouseCredentialsWithAgentStatus[] = [],
    snowflakeConfigured = true,
) => {
    const client = new QueryClient({
        defaultOptions: { mutations: { retry: false } },
    });
    return render(
        <SnowflakeAgentConnectionCard
            snowflakeConfigured={snowflakeConfigured}
            credential={
                credentials.find(
                    ({ purpose }) =>
                        purpose === UserWarehouseCredentialPurpose.AI,
                ) ?? null
            }
        />,
        {
            wrapper: ({ children }: PropsWithChildren) => (
                <QueryClientProvider client={client}>
                    <MantineProvider>{children}</MantineProvider>
                </QueryClientProvider>
            ),
        },
    );
};

describe('SnowflakeAgentConnectionCard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockSilentRefreshFlag(false);
        login.mockResolvedValue();
        deleteCredentials.mockResolvedValue();
    });

    afterEach(() => {
        cleanup();
        vi.useRealTimers();
    });

    it.each([{ credentials: [] }, { credentials: [credential] }])(
        'shows unavailable setup without actions for credentials %j',
        ({ credentials }) => {
            renderCard(credentials, false);
            expect(screen.getByText('Not available')).toBeInTheDocument();
            expect(
                screen.getByText(
                    'Agent sign-in is not set up yet. Ask an admin to finish the Snowflake setup.',
                ),
            ).toBeInTheDocument();
            expect(screen.queryByRole('button')).not.toBeInTheDocument();
            expect(
                screen.queryByText(/Your agents can't run/),
            ).not.toBeInTheDocument();
            expect(login).not.toHaveBeenCalled();
        },
    );

    it('expires while the card stays open without changing props', () => {
        vi.useFakeTimers();
        renderCard([{ ...credential, expiresAt: new Date(Date.now() + 1000) }]);
        expect(
            screen.getByRole('button', { name: 'Disconnect' }),
        ).toBeEnabled();
        expect(
            screen.getByText(/Your agent sign-in lasts until/),
        ).toBeInTheDocument();
        act(() => {
            vi.advanceTimersByTime(1001);
        });
        expect(screen.getByText('Expired')).toBeInTheDocument();
        expect(
            screen.queryByText(/Your agent sign-in lasts until/),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Sign in again' }),
        ).toBeEnabled();
        expect(
            screen.queryByRole('button', { name: 'Disconnect' }),
        ).not.toBeInTheDocument();
    });

    it.each([
        { credentials: [] },
        {
            credentials: [
                {
                    ...credential,
                    purpose: UserWarehouseCredentialPurpose.DEFAULT,
                },
            ],
        },
    ])(
        'offers sign-in when no AI-purpose credential exists',
        ({ credentials }) => {
            renderCard(credentials);
            expect(
                screen.getByRole('heading', { name: 'Snowflake' }),
            ).toBeInTheDocument();
            expect(screen.getByText('Not connected')).toBeInTheDocument();
            expect(
                screen.getByRole('button', {
                    name: 'Connect agent',
                }),
            ).toBeEnabled();
            expect(
                screen.queryByRole('button', { name: 'Disconnect' }),
            ).not.toBeInTheDocument();
            expect(
                screen.getByText(
                    "Your agents can't run on Snowflake projects until you connect. It takes about 30 seconds.",
                ),
            ).toBeInTheDocument();
        },
    );

    it.each([false, true])(
        'shows the stored expiry with silent refresh %s',
        (enabled) => {
            mockSilentRefreshFlag(enabled);
            vi.setSystemTime(new Date(2027, 0, 6));
            const expiresAt = new Date(2027, 0, 7);
            renderCard([{ ...credential, expiresAt }]);
            expect(screen.getByText('Connected')).toBeInTheDocument();
            expect(useServerFeatureFlag).toHaveBeenCalledWith(
                FeatureFlags.AgentIdentitySilentRefresh,
            );
            expect(
                screen.getByText('Your agent sign-in lasts until 7 Jan 2027.'),
            ).toBeInTheDocument();
            expect(
                screen.getByRole('button', { name: 'Disconnect' }),
            ).toBeEnabled();
        },
    );

    it.each([false, true])(
        'requires reconnection after client replacement with silent refresh %s',
        (enabled) => {
            mockSilentRefreshFlag(enabled);
            renderCard([
                {
                    ...credential,
                    expiresAt: new Date(Date.now() + 86400000),
                    agentClientCurrent: false,
                },
            ]);
            expect(screen.getByText('Expired')).toBeInTheDocument();
            expect(
                screen.getByRole('button', { name: 'Sign in again' }),
            ).toBeEnabled();
            expect(
                screen.queryByRole('button', { name: 'Disconnect' }),
            ).not.toBeInTheDocument();
        },
    );

    it('keeps a past expiry connected with silent refresh enabled', () => {
        mockSilentRefreshFlag(true);
        renderCard([{ ...credential, expiresAt: new Date(Date.now() - 1) }]);
        expect(screen.getByText('Connected')).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Disconnect' }),
        ).toBeEnabled();
        expect(
            screen.queryByText(/Your agent sign-in lasts until/),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Connect agent' }),
        ).not.toBeInTheDocument();
    });

    it.each([false, undefined])(
        'offers reconnection after the stored expiry with silent refresh %s',
        (enabled) => {
            mockSilentRefreshFlag(enabled);
            renderCard([
                { ...credential, expiresAt: new Date(Date.now() - 1) },
            ]);
            expect(screen.getByText('Expired')).toBeInTheDocument();
            expect(
                screen.queryByText(/Your agent sign-in lasts until/),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByRole('button', { name: 'Disconnect' }),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByText(/Your agents can't run/),
            ).not.toBeInTheDocument();
            fireEvent.click(
                screen.getByRole('button', { name: 'Sign in again' }),
            );
        },
    );

    it.each([false, true, undefined])(
        'shows the connected state without a date with silent refresh %s',
        (enabled) => {
            mockSilentRefreshFlag(enabled);
            renderCard([credential]);
            expect(screen.getByText('Connected')).toBeInTheDocument();
            expect(
                screen.queryByText(/Your agents can't run/),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByText(/Your agent sign-in lasts until/),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByText(credential.createdAt.toLocaleDateString()),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByRole('button', {
                    name: 'Connect agent',
                }),
            ).not.toBeInTheDocument();
            expect(
                screen.getByRole('button', { name: 'Disconnect' }),
            ).toHaveAttribute('data-variant', 'default');
        },
    );

    it('shows popup loading, then the error and an enabled retry button', async () => {
        let rejectLogin: (error: Error) => void = () => {};
        login.mockImplementationOnce(
            () =>
                new Promise<void>((_resolve, reject) => {
                    rejectLogin = reject;
                }),
        );
        renderCard();
        const button = screen.getByRole('button', {
            name: 'Connect agent',
        });
        fireEvent.click(button);
        expect(popup).toHaveBeenLastCalledWith(
            {
                entryPoint: AgentIdentityConnectEntryPoint.MY_AGENT_CONNECTIONS,
                projectUuid: null,
            },
            { showErrorToast: false },
        );
        await waitFor(() =>
            expect(button).toHaveAttribute('data-loading', 'true'),
        );
        expect(button).toBeDisabled();
        rejectLogin(new Error('Snowflake sign-in was denied'));
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Snowflake sign-in was denied',
        );
        expect(screen.getByText('Failing')).toBeInTheDocument();
        expect(
            screen.getByText(
                "Your agents can't run on Snowflake projects until you connect. It takes about 30 seconds.",
            ),
        ).toBeInTheDocument();
        expect(button).toBeEnabled();
        expect(button).not.toHaveAttribute('data-loading');
        fireEvent.click(button);
        await waitFor(() => expect(login).toHaveBeenCalledTimes(2));
        await waitFor(() =>
            expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
        );
    });

    it('keeps a failed attempt visible when a credential is refreshed', async () => {
        login.mockRejectedValueOnce(new Error('Snowflake sign-in was denied'));
        const { rerender } = renderCard();
        fireEvent.click(screen.getByRole('button', { name: 'Connect agent' }));
        await screen.findByRole('alert');
        rerender(
            <SnowflakeAgentConnectionCard
                credential={credential}
                snowflakeConfigured
            />,
        );
        expect(screen.getByText('Failing')).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Connect agent' }),
        ).toBeEnabled();
        expect(
            screen.queryByRole('button', { name: 'Disconnect' }),
        ).not.toBeInTheDocument();
        expect(screen.getByText(/Your agents can't run/)).toBeInTheDocument();
    });

    it('hides a previous login failure when setup becomes unavailable', async () => {
        login.mockRejectedValueOnce(new Error('Snowflake sign-in was denied'));
        const { rerender } = renderCard();
        fireEvent.click(screen.getByRole('button', { name: 'Connect agent' }));
        await screen.findByRole('alert');
        rerender(
            <SnowflakeAgentConnectionCard
                credential={credential}
                snowflakeConfigured={false}
            />,
        );
        expect(screen.getByText('Not available')).toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('requires confirmation in the existing modal before signing out', async () => {
        renderCard([credential]);
        fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
        expect(
            await screen.findByRole('dialog', { name: 'Delete credentials' }),
        ).toBeInTheDocument();
        expect(deleteCredentials).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
        await waitFor(() => expect(deleteCredentials).toHaveBeenCalledOnce());
        await waitFor(() =>
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
        );
    });
    it.each([
        [
            new Date(2027, 0, 7),
            'Your Snowflake agent sign-in ended on 7 Jan 2027. Sign in again to keep using agents on Snowflake projects.',
        ],
        [
            new Date(2027, 0, 8),
            'Your Snowflake agent sign-in ended on 8 Jan 2027. Sign in again to keep using agents on Snowflake projects.',
        ],
        [
            new Date(2027, 0, 9),
            'Your Snowflake agent sign-in ended. Sign in again to keep using agents on Snowflake projects.',
        ],
        [
            null,
            'Your Snowflake agent sign-in ended. Sign in again to keep using agents on Snowflake projects.',
        ],
    ])('shows truthful expiry copy for %s', (expiresAt, message) => {
        vi.setSystemTime(new Date(2027, 0, 8));
        renderCard([{ ...credential, agentClientCurrent: false, expiresAt }]);
        expect(screen.getByText(message)).toBeInTheDocument();
        expect(
            screen.queryByText(/Your agents can't run/),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Sign in again' }),
        ).toBeEnabled();
    });
});
