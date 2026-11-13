import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import MantineProvider from './MantineProvider';
import styles from './MantineProvider.module.css';

const getNotificationRoots = () =>
    Array.from(document.querySelectorAll('.mantine-Notifications-root'));

const renderWithHealth = (health?: { isAuthenticated: boolean }) => {
    const client = new QueryClient();
    if (health) client.setQueryData(['health'], health);
    render(
        <QueryClientProvider client={client}>
            <MantineProvider env="test" />
        </QueryClientProvider>,
    );
    return client;
};

const expectSignedOutRoots = () => {
    const roots = getNotificationRoots();
    expect(roots).not.toHaveLength(0);
    roots.forEach((root) => {
        expect(root).toHaveClass(styles.notificationsRoot);
        expect(root).toHaveClass(styles.signedOut);
    });
};

const expectSignedInRoots = () => {
    const roots = getNotificationRoots();
    expect(roots).not.toHaveLength(0);
    roots.forEach((root) => {
        expect(root).toHaveClass(styles.notificationsRoot);
        expect(root).not.toHaveClass(styles.signedOut);
    });
};

describe('MantineProvider notifications placement', () => {
    it('marks the notification roots as signed out when health says so', () => {
        renderWithHealth({ isAuthenticated: false });
        expectSignedOutRoots();
    });

    it('keeps the default roots when health says signed in', () => {
        renderWithHealth({ isAuthenticated: true });
        expectSignedInRoots();
    });

    it('keeps the default roots when health has not loaded', () => {
        renderWithHealth();
        expectSignedInRoots();
    });

    it('keeps the default roots without a QueryClient', () => {
        render(<MantineProvider env="test" />);
        expectSignedInRoots();
    });

    it('follows a sign-in without a remount', async () => {
        const client = renderWithHealth({ isAuthenticated: false });
        expectSignedOutRoots();
        act(() => {
            client.setQueryData(['health'], { isAuthenticated: true });
        });
        await waitFor(expectSignedInRoots);
    });
});
