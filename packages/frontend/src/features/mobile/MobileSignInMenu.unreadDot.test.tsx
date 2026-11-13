import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockedLightdashApi } from '../../testing/mockedLightdashApi';
import { renderWithProviders } from '../../testing/testUtils';
import { MobileSignInMenu } from './MobileSignInMenu';
import { MOBILE_SIGN_IN_SEEN_KEY } from './mobileSignInSeen';

vi.mock('../../api');
vi.mock('../../hooks/health/useHealth', () => ({
    default: () => ({ data: { siteUrl: 'https://app.example.com' } }),
}));
vi.mock('../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({
        data: { id: 'mobile-qr-sign-in', enabled: true },
    }),
}));

const api = mockedLightdashApi;

const renderMenu = (withLabel = false) =>
    renderWithProviders(
        <MemoryRouter initialEntries={['/projects/p1/saved/c1']}>
            <MobileSignInMenu withLabel={withLabel} />
        </MemoryRouter>,
    );

const openButton = () =>
    screen.getByRole('button', { name: 'Sign in on your phone' });

const unreadDot = () =>
    openButton().querySelector('.mantine-Indicator-indicator');

const blockSeenKey = () => {
    const storage = window.localStorage;
    const { getItem, setItem } = Storage.prototype;
    const refuse = (key: string) => {
        if (key === MOBILE_SIGN_IN_SEEN_KEY) {
            throw new DOMException('blocked', 'SecurityError');
        }
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key) => {
        refuse(key);
        return getItem.call(storage, key);
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key, value) => {
        refuse(key);
        setItem.call(storage, key, value);
    });
};

beforeEach(() => {
    window.localStorage.clear();
    api.mockReset();
    api.mockImplementation(async ({ method }: { method: string }) =>
        method === 'POST'
            ? {
                  codeUuid: 'code-1',
                  signInUrl: 'https://app.example.com/m/sign-in#c=code-1',
                  approvalNonce: 'nonce-1',
                  expiresAt: new Date(Date.now() + 120_000).toISOString(),
                  expiresInSeconds: 120,
              }
            : undefined,
    );
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('MobileSignInMenu unread dot', () => {
    it('shows the dot until the popover opens, then keeps it hidden after a reload', async () => {
        const first = renderMenu();
        expect(unreadDot()).toBeInTheDocument();

        await userEvent.click(openButton());

        expect(unreadDot()).not.toBeInTheDocument();
        expect(window.localStorage.getItem(MOBILE_SIGN_IN_SEEN_KEY)).toBe(
            'true',
        );
        first.unmount();

        renderMenu();
        expect(unreadDot()).not.toBeInTheDocument();
    });

    it('hides the dot when the popover opens by keyboard', async () => {
        const user = userEvent.setup();
        renderMenu();
        openButton().focus();

        await user.keyboard('{Enter}');

        expect(
            await screen.findByRole('dialog', {
                name: 'Sign in on your phone',
            }),
        ).toBeInTheDocument();
        expect(unreadDot()).not.toBeInTheDocument();
    });

    it('keeps the label next to the dot in the labelled variant', async () => {
        renderMenu(true);
        expect(openButton()).toHaveTextContent('Sign in on your phone');
        expect(unreadDot()).toBeInTheDocument();
        expect(unreadDot()?.parentElement?.textContent ?? '').not.toContain(
            'Sign in on your phone',
        );

        await userEvent.click(openButton());

        expect(unreadDot()).not.toBeInTheDocument();
    });

    it('shows the dot and still opens when storage is blocked', async () => {
        blockSeenKey();
        renderMenu();
        expect(unreadDot()).toBeInTheDocument();

        await userEvent.click(openButton());

        expect(
            await screen.findByRole('dialog', {
                name: 'Sign in on your phone',
            }),
        ).toBeInTheDocument();
        expect(unreadDot()).not.toBeInTheDocument();
    });
});
