import {
    AgentIdentityConnectEntryPoint,
    formatDate,
    UserWarehouseCredentialPurpose,
    type UserWarehouseCredentials,
} from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import {
    QueryClient,
    QueryClientProvider,
    useMutation,
} from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { credential } from './fixtures';
import { SnowflakeAgentConnectionCard } from './SnowflakeAgentConnectionCard';

const { login, deleteCredentials, popup } = vi.hoisted(() => ({
    login: vi.fn<() => Promise<void>>(),
    popup: vi.fn(),
    deleteCredentials: vi.fn<() => Promise<void>>(),
}));

vi.mock('../../../hooks/useSnowflake', () => ({
    useSnowflakeAiLoginPopup: (attribution: unknown) => {
        popup(attribution);
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

const renderCard = (credentials: UserWarehouseCredentials[] = []) => {
    const client = new QueryClient({
        defaultOptions: { mutations: { retry: false } },
    });
    return render(
        <SnowflakeAgentConnectionCard
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
        login.mockResolvedValue();
        deleteCredentials.mockResolvedValue();
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
                    'Your AI questions on Snowflake projects are refused until you connect. Takes about 30 seconds.',
                ),
            ).toBeInTheDocument();
        },
    );

    it('shows the stored expiry with the app date format', () => {
        const expiresAt = new Date(Date.now() + 86400000);
        renderCard([{ ...credential, expiresAt }]);
        expect(
            screen.getByText(`Connected until ${formatDate(expiresAt)}`),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Disconnect' }),
        ).toBeEnabled();
    });

    it('offers reconnection after the stored expiry', () => {
        renderCard([{ ...credential, expiresAt: new Date(Date.now() - 1) }]);
        expect(screen.getByText('Expired')).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Disconnect' }),
        ).not.toBeInTheDocument();
        expect(screen.getByText(/Your AI questions/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Connect agent' }));
    });

    it('shows the connected state without a date', () => {
        renderCard([credential]);
        expect(screen.getByText('Connected')).toBeInTheDocument();
        expect(screen.queryByText(/Your AI questions/)).not.toBeInTheDocument();
        expect(screen.queryByText(/connected since/)).not.toBeInTheDocument();
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
    });

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
        expect(popup).toHaveBeenLastCalledWith({
            entryPoint: AgentIdentityConnectEntryPoint.MY_AGENT_CONNECTIONS,
            projectUuid: null,
        });
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
                'Your AI questions on Snowflake projects are refused until you connect. Takes about 30 seconds.',
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
        rerender(<SnowflakeAgentConnectionCard credential={credential} />);
        expect(screen.getByText('Failing')).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Connect agent' }),
        ).toBeEnabled();
        expect(
            screen.queryByRole('button', { name: 'Disconnect' }),
        ).not.toBeInTheDocument();
        expect(screen.getByText(/Your AI questions/)).toBeInTheDocument();
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
});
