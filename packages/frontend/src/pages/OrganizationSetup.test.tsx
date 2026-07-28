import { LightdashMode } from '@lightdash/common';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import nock from 'nock';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BASE_API_URL } from '../api';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';
import { renderWithProviders } from '../testing/testUtils';
import OrganizationSetup from './OrganizationSetup';

vi.mock('../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: vi.fn(),
}));

const renderSetupPage = (mocks?: Parameters<typeof renderWithProviders>[1]) =>
    renderWithProviders(
        <MemoryRouter initialEntries={['/organization-setup']}>
            <Routes>
                <Route
                    path="/organization-setup"
                    element={<OrganizationSetup />}
                />
                <Route path="/" element={<div>Home page</div>} />
            </Routes>
        </MemoryRouter>,
        mocks,
    );

const selectRole = async (user: ReturnType<typeof userEvent.setup>) => {
    const roleSelect = await screen.findByPlaceholderText('Select your role');
    await user.click(roleSelect);
    const roleOption = await screen.findByText('Software Engineer');
    await user.click(roleOption);
};

describe('OrganizationSetup', () => {
    beforeEach(() => {
        vi.mocked(useServerFeatureFlag).mockReturnValue({
            data: { id: 'organization-setup-page', enabled: true },
            isLoading: false,
        } as ReturnType<typeof useServerFeatureFlag>);
    });

    it('submits an empty referral answer when a user joining an existing organization skips it', async () => {
        const user = userEvent.setup();

        renderSetupPage({
            user: {
                isSetupComplete: false,
                organizationName: 'test organization',
                email: 'demo@lightdash.com',
            },
            health: {
                mode: LightdashMode.DEFAULT,
            },
        });

        expect(
            await screen.findByText('Tell us about you'),
        ).toBeInTheDocument();
        expect(
            screen.queryByPlaceholderText('Acme Analytics'),
        ).not.toBeInTheDocument();

        const referralInput = await screen.findByLabelText(
            'How did you hear about us?',
        );
        expect(referralInput).toBeInTheDocument();

        const submitButton = await screen.findByRole('button', {
            name: 'Finish',
        });
        expect(submitButton).toBeDisabled();

        await selectRole(user);

        expect(submitButton).toBeEnabled();

        const scope = nock(BASE_API_URL)
            .patch('/api/v1/user/me/complete', {
                jobTitle: 'Software Engineer',
                howDidYouHearAboutUs: '',
                enableEmailDomainAccess: false,
                isMarketingOptedIn: true,
                isTrackingAnonymized: false,
            })
            .reply(200);

        await user.click(submitButton);

        await waitFor(() => expect(scope.isDone()).toBe(true));
    });

    it('submits the trimmed referral answer when a user creating an organization answers it', async () => {
        const user = userEvent.setup();

        renderSetupPage({
            user: {
                isSetupComplete: false,
                organizationName: '',
                email: 'demo@lightdash.com',
            },
            health: {
                mode: LightdashMode.DEFAULT,
            },
        });

        const nameInput = await screen.findByPlaceholderText('Acme Analytics');
        await user.clear(nameInput);
        await user.type(nameInput, 'test organization');
        await user.click(
            await screen.findByRole('button', { name: 'Continue' }),
        );

        expect(
            await screen.findByText('Tell us about you'),
        ).toBeInTheDocument();

        await selectRole(user);

        const referralInput = await screen.findByLabelText(
            'How did you hear about us?',
        );
        await user.type(referralInput, '  a podcast  ');

        const scope = nock(BASE_API_URL)
            .patch('/api/v1/user/me/complete', {
                organizationName: 'test organization',
                jobTitle: 'Software Engineer',
                howDidYouHearAboutUs: 'a podcast',
                enableEmailDomainAccess: true,
                isMarketingOptedIn: true,
                isTrackingAnonymized: false,
            })
            .reply(200);
        const brandScope = nock(BASE_API_URL)
            .put('/api/v1/org/brand', () => true)
            .reply(200, { status: 'ok', results: null });

        await user.click(await screen.findByRole('button', { name: 'Finish' }));

        await waitFor(() => expect(scope.isDone()).toBe(true));
        await waitFor(() => expect(brandScope.isDone()).toBe(true));
    });
});
