import { MantineProvider } from '@mantine/core';
import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { navigateTo } from '../utils/navigation';
import { MobileSetupLanding } from './MobileSetupLanding';

vi.mock('../utils/navigation', () => ({
    navigateTo: vi.fn(),
}));

vi.mock('../../../hooks/health/useHealth', () => ({
    default: () => ({
        data: {
            mobileApp: {
                enabled: true,
                setupLinkBaseUrl: 'https://app.example.com/mobile-setup',
                appStoreUrl: null,
                playStoreUrl: 'https://play.google.com/store/apps/details?id=x',
            },
        },
    }),
}));

const IPHONE_UA =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
const ANDROID_UA =
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36';
const MAC_UA =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15';

const CODE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const ORIGIN = 'http://localhost:3000';

const setUserAgent = (userAgent: string) => {
    Object.defineProperty(navigator, 'userAgent', {
        value: userAgent,
        configurable: true,
    });
};

let router: ReturnType<typeof createMemoryRouter>;

const renderAt = (search: string) => {
    router = createMemoryRouter(
        [{ path: '/mobile-setup', element: <MobileSetupLanding /> }],
        { initialEntries: [`/mobile-setup${search}`] },
    );
    return render(
        <MantineProvider env="test">
            <RouterProvider router={router} />
        </MantineProvider>,
    );
};

const validSearch = `?v=1&i=${encodeURIComponent(ORIGIN)}&c=${CODE}`;

afterEach(() => {
    setUserAgent(MAC_UA);
    vi.clearAllMocks();
});

describe('MobileSetupLanding', () => {
    it('offers the custom scheme link on iOS, never a same-host https link', () => {
        setUserAgent(IPHONE_UA);
        renderAt(validSearch);

        const open = screen.getByRole('link', { name: /open in lightdash/i });
        expect(open).toHaveAttribute(
            'href',
            `com.lightdash.mobile://setup?v=1&i=${encodeURIComponent(ORIGIN)}&c=${CODE}`,
        );
    });

    it('shows the Play badge on Android', () => {
        setUserAgent(ANDROID_UA);
        renderAt(validSearch);

        expect(
            screen.getByRole('link', { name: /google play/i }),
        ).toBeInTheDocument();
    });

    it('hides the App Store badge while the listing URL is null', () => {
        setUserAgent(IPHONE_UA);
        renderAt(validSearch);

        expect(
            screen.queryByRole('link', { name: /app store/i }),
        ).not.toBeInTheDocument();
    });

    it('builds the app URL from the validated params only', () => {
        setUserAgent(IPHONE_UA);
        renderAt(
            `?v=1&i=${encodeURIComponent(ORIGIN)}&c=${CODE}&redirect=https%3A%2F%2Fevil.example&extra=1`,
        );

        const open = screen.getByRole('link', { name: /open in lightdash/i });
        const href = open.getAttribute('href') ?? '';
        const params = new URLSearchParams(href.split('?')[1]);

        expect([...params.keys()].sort()).toEqual(['c', 'i', 'v']);
        expect(href).not.toContain('evil.example');
    });

    it('attempts the app on a mobile user agent', () => {
        setUserAgent(ANDROID_UA);
        renderAt(validSearch);

        expect(navigateTo).toHaveBeenCalledWith(
            `com.lightdash.mobile://setup?v=1&i=${encodeURIComponent(ORIGIN)}&c=${CODE}`,
        );
    });

    it('never navigates away on desktop', () => {
        setUserAgent(MAC_UA);
        renderAt(validSearch);

        expect(navigateTo).not.toHaveBeenCalled();
    });

    it('shows no code and no open button on desktop', () => {
        setUserAgent(MAC_UA);
        renderAt(validSearch);

        expect(screen.getByText('Open this on your phone')).toBeInTheDocument();
        expect(
            screen.queryByRole('link', { name: /open in lightdash/i }),
        ).not.toBeInTheDocument();
        expect(screen.queryByText(CODE)).not.toBeInTheDocument();
    });

    it('takes the code out of the URL once it has been read', async () => {
        setUserAgent(IPHONE_UA);
        renderAt(validSearch);

        await waitFor(() => expect(router.state.location.search).toBe(''));
        expect(router.state.location.pathname).toBe('/mobile-setup');
    });

    it('still builds the app link after the URL is cleaned', async () => {
        setUserAgent(IPHONE_UA);
        renderAt(validSearch);

        await waitFor(() => expect(router.state.location.search).toBe(''));

        expect(
            screen.getByRole('link', { name: /open in lightdash/i }),
        ).toHaveAttribute(
            'href',
            `com.lightdash.mobile://setup?v=1&i=${encodeURIComponent(ORIGIN)}&c=${CODE}`,
        );
    });

    it('replaces the history entry rather than pushing a clean one', async () => {
        setUserAgent(IPHONE_UA);
        renderAt(validSearch);

        await waitFor(() => expect(router.state.location.search).toBe(''));
        // A push would leave the dirty URL behind in history.
        expect(router.state.historyAction).toBe('REPLACE');
    });

    it('names the instance the app will be pointed at', () => {
        setUserAgent(IPHONE_UA);
        renderAt(validSearch);

        expect(screen.getByText('Signing in to')).toBeInTheDocument();
        expect(screen.getByText(ORIGIN)).toBeInTheDocument();
    });

    it('has the instance on screen before it opens the app', () => {
        setUserAgent(IPHONE_UA);
        let originWasVisible = false;
        vi.mocked(navigateTo).mockImplementationOnce(() => {
            originWasVisible = screen.queryByText(ORIGIN) !== null;
        });

        renderAt(validSearch);

        expect(originWasVisible).toBe(true);
    });

    it('refuses an unknown link version', () => {
        setUserAgent(IPHONE_UA);
        renderAt(`?v=2&i=${encodeURIComponent(ORIGIN)}&c=${CODE}`);

        expect(
            screen.getByText('Update the Lightdash app'),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('link', { name: /open in lightdash/i }),
        ).not.toBeInTheDocument();
    });

    it('refuses a malformed code', () => {
        setUserAgent(IPHONE_UA);
        renderAt(`?v=1&i=${encodeURIComponent(ORIGIN)}&c=nope`);

        expect(
            screen.getByText('This setup link is not valid'),
        ).toBeInTheDocument();
    });
});
