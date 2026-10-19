import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
import { credential } from './fixtures';
import { SnowflakeAgentConnectionCard } from './SnowflakeAgentConnectionCard';

const { showToastError } = vi.hoisted(() => ({ showToastError: vi.fn() }));
vi.mock('../../../hooks/toaster/useToaster', () => ({
    default: () => ({ showToastError }),
}));
vi.mock('../../../hooks/health/useHealth', () => ({
    default: () => ({ data: { siteUrl: 'https://app.example' } }),
}));
vi.mock('../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: false } }),
}));

let onMessage: (event: MessageEvent) => void;
const blockedMessage =
    'Your browser blocked the Snowflake sign-in window. Allow pop-ups for this site, then try again.';
const renderCard = (storedCredential: typeof credential | null) => {
    const client = new QueryClient({
        defaultOptions: { mutations: { retry: false } },
    });
    return render(
        <SnowflakeAgentConnectionCard
            credential={storedCredential}
            snowflakeConfigured
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

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'open').mockReturnValue(null);
    vi.stubGlobal(
        'BroadcastChannel',
        class {
            addEventListener(
                _event: string,
                listener: (event: MessageEvent) => void,
            ) {
                onMessage = listener;
            }
            removeEventListener = vi.fn();
            close = vi.fn();
        },
    );
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('Snowflake sign-in popup errors', () => {
    it.each([
        [null, 'Not connected', 'Connect agent'],
        [
            { ...credential, agentClientCurrent: false },
            'Expired',
            'Sign in again',
        ],
    ] as const)(
        'preserves the %s credential status and clears the alert on retry',
        async (storedCredential, status, label) => {
            renderCard(storedCredential);
            fireEvent.click(screen.getByRole('button', { name: label }));
            expect((await screen.findByRole('alert')).textContent).toBe(
                blockedMessage,
            );
            expect(screen.getAllByText(blockedMessage)).toHaveLength(1);
            expect(screen.getByText(status)).toBeInTheDocument();
            expect(screen.queryByText('Failing')).not.toBeInTheDocument();
            expect(showToastError).not.toHaveBeenCalled();
            vi.mocked(window.open).mockReturnValue({
                close: vi.fn(),
            } as unknown as Window);
            fireEvent.click(screen.getByRole('button', { name: label }));
            await waitFor(() => expect(window.open).toHaveBeenCalledTimes(2));
            await waitFor(() =>
                expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
            );
            act(() =>
                onMessage(
                    new MessageEvent('message', {
                        origin: 'https://app.example',
                        data: 'success',
                    }),
                ),
            );
            await waitFor(() =>
                expect(
                    screen.getByRole('button', { name: label }),
                ).toBeEnabled(),
            );
        },
    );

    it('shows other failures inline once without a toast', async () => {
        vi.mocked(window.open).mockReturnValue({
            close: vi.fn(),
        } as unknown as Window);
        renderCard(null);
        fireEvent.click(screen.getByRole('button', { name: 'Connect agent' }));
        await waitFor(() => expect(window.open).toHaveBeenCalledOnce());
        act(() =>
            onMessage(
                new MessageEvent('message', {
                    origin: 'https://app.example',
                    data: 'failure',
                }),
            ),
        );
        expect((await screen.findByRole('alert')).textContent).toBe(
            'Authentication failed',
        );
        expect(screen.getAllByText('Authentication failed')).toHaveLength(1);
        expect(screen.getByText('Failing')).toBeInTheDocument();
        expect(showToastError).not.toHaveBeenCalled();
    });
});
