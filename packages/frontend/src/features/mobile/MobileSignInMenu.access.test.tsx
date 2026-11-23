import { FeatureFlags } from '@lightdash/common';
import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockedLightdashApi } from '../../testing/mockedLightdashApi';
import { renderWithProviders } from '../../testing/testUtils';
import { MobileSignInMenu } from './MobileSignInMenu';

type FlagQuery = {
    data: { id: string; enabled: boolean } | undefined;
    isLoading: boolean;
    isError: boolean;
};

const flags = vi.hoisted(() => ({
    state: {} as Record<string, 'on' | 'off' | 'loading' | 'error'>,
}));

vi.mock('../../api');
vi.mock('../../hooks/health/useHealth', () => ({
    default: () => ({ data: { siteUrl: 'https://app.example.com' } }),
}));
vi.mock('../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: (id: string): FlagQuery => {
        const state = flags.state[id] ?? 'loading';
        if (state === 'loading') {
            return { data: undefined, isLoading: true, isError: false };
        }
        if (state === 'error') {
            return { data: undefined, isLoading: false, isError: true };
        }
        return {
            data: { id, enabled: state === 'on' },
            isLoading: false,
            isError: false,
        };
    },
}));

const renderMenu = (withLabel: boolean) =>
    renderWithProviders(
        <MemoryRouter initialEntries={['/projects/p1/saved/c1']}>
            <MobileSignInMenu withLabel={withLabel} />
        </MemoryRouter>,
    );

const mobileItem = () =>
    screen.queryByRole('button', { name: 'Sign in on your phone' });

beforeEach(() => {
    mockedLightdashApi.mockReset();
    mockedLightdashApi.mockResolvedValue(undefined);
    flags.state = {
        [FeatureFlags.MobileAppAccess]: 'on',
    };
});

describe.each([
    ['desktop nav icon', false],
    ['compact nav entry', true],
])('MobileSignInMenu organization access gate: %s', (_, withLabel) => {
    it('shows the item when organization access is on', () => {
        renderMenu(withLabel);
        expect(mobileItem()).toBeInTheDocument();
    });

    it('hides the item when the organization turned mobile app access off', () => {
        flags.state[FeatureFlags.MobileAppAccess] = 'off';
        renderMenu(withLabel);
        expect(mobileItem()).not.toBeInTheDocument();
    });

    it('hides the item while organization access is loading', () => {
        flags.state[FeatureFlags.MobileAppAccess] = 'loading';
        renderMenu(withLabel);
        expect(mobileItem()).not.toBeInTheDocument();
    });

    it('hides the item when the organization access check fails', () => {
        flags.state[FeatureFlags.MobileAppAccess] = 'error';
        renderMenu(withLabel);
        expect(mobileItem()).not.toBeInTheDocument();
    });
});
