import { notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

const SMALL_PORTRAIT_QUERY = '(max-width: 48em) and (min-height: 30.0625em)';

const mockSmallPortrait = () =>
    vi.spyOn(window, 'matchMedia').mockImplementation(
        (query) =>
            ({
                matches: query === SMALL_PORTRAIT_QUERY,
                media: query,
                onchange: null,
                addListener: () => {},
                removeListener: () => {},
                addEventListener: () => {},
                removeEventListener: () => {},
                dispatchEvent: () => true,
            }) as MediaQueryList,
    );

const getVisibleToastTitles = () =>
    Array.from(document.querySelectorAll('.mantine-Notification-title')).map(
        (title) => title.textContent,
    );

const showToasts = (...ids: string[]) =>
    act(() => {
        ids.forEach((id) =>
            notifications.show({
                id,
                title: id,
                message: id,
                autoClose: false,
            }),
        );
    });

describe('MantineProvider stacked toasts on small portrait screens', () => {
    afterEach(() => {
        act(() => notifications.clean());
        vi.restoreAllMocks();
    });

    it('shows one signed-out toast at a time and queues the rest', async () => {
        mockSmallPortrait();
        renderWithHealth({ isAuthenticated: false });
        showToasts('first', 'second');
        await waitFor(() => expect(getVisibleToastTitles()).toEqual(['first']));

        act(() => notifications.hide('first'));
        await waitFor(() =>
            expect(getVisibleToastTitles()).toEqual(['second']),
        );

        act(() => notifications.hide('second'));
        await waitFor(() => expect(getVisibleToastTitles()).toEqual([]));
    });

    it('keeps every toast visible when signed in', async () => {
        mockSmallPortrait();
        renderWithHealth({ isAuthenticated: true });
        showToasts('first', 'second');
        await waitFor(() =>
            expect(getVisibleToastTitles()).toEqual(['first', 'second']),
        );
    });

    it('keeps every signed-out toast visible on larger screens', async () => {
        renderWithHealth({ isAuthenticated: false });
        showToasts('first', 'second');
        await waitFor(() =>
            expect(getVisibleToastTitles()).toEqual(['first', 'second']),
        );
    });

    it('releases queued toasts after a sign-in', async () => {
        mockSmallPortrait();
        const client = renderWithHealth({ isAuthenticated: false });
        showToasts('first', 'second');
        await waitFor(() => expect(getVisibleToastTitles()).toEqual(['first']));

        act(() => {
            client.setQueryData(['health'], { isAuthenticated: true });
        });
        await waitFor(() =>
            expect(getVisibleToastTitles()).toEqual(['first', 'second']),
        );
    });
});
