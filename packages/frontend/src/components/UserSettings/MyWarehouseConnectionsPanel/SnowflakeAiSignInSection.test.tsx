import {
    SnowflakeAuthenticationType,
    UserWarehouseCredentialPurpose,
    WarehouseTypes,
    type UserWarehouseCredentials,
} from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import {
    QueryClient,
    QueryClientProvider,
    useMutation,
} from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SnowflakeAiSignInSection } from './SnowflakeAiSignInSection';

const { login, deleteCredentials } = vi.hoisted(() => ({
    login: vi.fn<() => Promise<void>>(),
    deleteCredentials: vi.fn<() => Promise<void>>(),
}));

vi.mock('../../../hooks/useSnowflake', () => ({
    useSnowflakeAiLoginPopup: () =>
        useMutation<void, Error>({ mutationFn: login }),
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

const credential: UserWarehouseCredentials = {
    uuid: 'ai-credential',
    purpose: UserWarehouseCredentialPurpose.AI,
    userUuid: 'user',
    name: 'Agent Snowflake sign-in',
    createdAt: new Date('2026-10-06T12:00:00Z'),
    updatedAt: new Date('2026-10-07T12:00:00Z'),
    credentials: {
        type: WarehouseTypes.SNOWFLAKE,
        user: 'agent-user',
        authenticationType: SnowflakeAuthenticationType.SSO,
    },
    project: null,
};

const renderSection = (credentials: UserWarehouseCredentials[] = []) =>
    render(
        <QueryClientProvider
            client={
                new QueryClient({
                    defaultOptions: { mutations: { retry: false } },
                })
            }
        >
            <MantineProvider>
                <SnowflakeAiSignInSection credentials={credentials} />
            </MantineProvider>
        </QueryClientProvider>,
    );

describe('SnowflakeAiSignInSection', () => {
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
            renderSection(credentials);
            expect(
                screen.getByRole('heading', { name: 'Agent connection' }),
            ).toBeInTheDocument();
            expect(
                screen.queryByText('Agent not connected'),
            ).not.toBeInTheDocument();
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
                    'AI agents and MCP use this connection to your Snowflake warehouse.',
                ),
            ).toBeInTheDocument();
        },
    );

    it('shows the localised creation date and only sign-out when signed in', () => {
        renderSection([credential]);
        expect(
            screen.getByText(
                `Agent connected since ${credential.createdAt.toLocaleDateString()}`,
            ),
        ).toBeInTheDocument();
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
        renderSection();
        const button = screen.getByRole('button', {
            name: 'Connect agent',
        });
        fireEvent.click(button);
        await waitFor(() =>
            expect(button).toHaveAttribute('data-loading', 'true'),
        );
        expect(button).toBeDisabled();
        rejectLogin(new Error('Snowflake sign-in was denied'));
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Snowflake sign-in was denied',
        );
        expect(button).toBeEnabled();
        expect(button).not.toHaveAttribute('data-loading');
        fireEvent.click(button);
        await waitFor(() => expect(login).toHaveBeenCalledTimes(2));
        await waitFor(() =>
            expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
        );
    });

    it('requires confirmation in the existing modal before signing out', async () => {
        renderSection([credential]);
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
