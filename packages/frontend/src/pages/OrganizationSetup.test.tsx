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

const renderSetupPage = (
    mocks?: Parameters<typeof renderWithProviders>[1],
    initialEntry = '/organization-setup',
) =>
    renderWithProviders(
        <MemoryRouter initialEntries={[initialEntry]}>
            <Routes>
                <Route
                    path="/organization-setup"
                    element={<OrganizationSetup />}
                />
                <Route
                    path="/onboarding/data-source"
                    element={<div>Data source page</div>}
                />
                <Route path="/" element={<div>Home page</div>} />
            </Routes>
        </MemoryRouter>,
        mocks,
    );

const mockOrgApi = (name: string, { optional = false } = {}) => {
    const interceptor = nock(BASE_API_URL).get('/api/v1/org');
    if (optional) {
        interceptor.optionally();
    }
    return interceptor.reply(200, { status: 'ok', results: { name } });
};

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

        mockOrgApi('test organization');
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

        await screen.findByPlaceholderText('Select your role');
        expect(
            screen.queryByPlaceholderText('Acme Analytics'),
        ).not.toBeInTheDocument();

        const referralInput = await screen.findByRole('textbox', {
            name: /How did you hear about us/,
        });
        expect(referralInput).toBeInTheDocument();

        const submitButton = await screen.findByRole('button', {
            name: 'Finish',
        });
        expect(submitButton).toBeDisabled();

        await selectRole(user);

        const scope = nock(BASE_API_URL)
            .patch('/api/v1/user/me/complete', {
                jobTitle: 'Software Engineer',
                howDidYouHearAboutUs: 'a podcast',
                enableEmailDomainAccess: false,
                isMarketingOptedIn: true,
                isTrackingAnonymized: false,
            })
            .reply(200);

        const referralInputCreate = await screen.findByRole('textbox', {
            name: /How did you hear about us/,
        });
        await user.type(referralInputCreate, 'a podcast');
        expect(submitButton).toBeEnabled();

        await user.click(submitButton);

        await waitFor(() => expect(scope.isDone()).toBe(true));
    });

    it('submits the trimmed referral answer when a user creating an organization answers it', async () => {
        const user = userEvent.setup();

        mockOrgApi('');
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

        await screen.findByPlaceholderText('Select your role');

        await selectRole(user);

        const referralInput = await screen.findByRole('textbox', {
            name: /How did you hear about us/,
        });
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

    it('skips the workspace step when the organization is already named', async () => {
        const user = userEvent.setup();

        mockOrgApi('test organization');
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

        await screen.findByPlaceholderText('Select your role');
        expect(
            screen.queryByPlaceholderText('Acme Analytics'),
        ).not.toBeInTheDocument();

        await selectRole(user);

        const scope = nock(BASE_API_URL)
            .patch('/api/v1/user/me/complete', {
                jobTitle: 'Software Engineer',
                howDidYouHearAboutUs: 'a podcast',
                enableEmailDomainAccess: false,
                isMarketingOptedIn: true,
                isTrackingAnonymized: false,
            })
            .reply(200);

        const referralInput = await screen.findByRole('textbox', {
            name: /How did you hear about us/,
        });
        await user.type(referralInput, 'a podcast');

        await user.click(await screen.findByRole('button', { name: 'Finish' }));

        await waitFor(() => expect(scope.isDone()).toBe(true));
    });

    it('does not submit when referral field is empty', async () => {
        const user = userEvent.setup();

        mockOrgApi('');
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

        await screen.findByRole('textbox', {
            name: /How did you hear about us/,
        });
        await selectRole(user);

        const referralInput = await screen.findByRole('textbox', {
            name: /How did you hear about us/,
        });
        await user.type(referralInput, '   ');

        const submitButton = await screen.findByRole('button', {
            name: 'Finish',
        });
        expect(submitButton).toBeEnabled();

        let completionRequestCount = 0;
        nock(BASE_API_URL)
            .patch('/api/v1/user/me/complete')
            .optionally()
            .reply(() => {
                completionRequestCount += 1;
                return [200];
            });

        await user.click(submitButton);

        await waitFor(() =>
            expect(
                screen.getByText((content) =>
                    content.includes(
                        'Please let us know how you heard about Lightdash',
                    ),
                ),
            ).toBeInTheDocument(),
        );
        expect(completionRequestCount).toBe(0);
    });

    it('redirects to the redirect target when setup is already complete', async () => {
        mockOrgApi('test organization', { optional: true });
        renderSetupPage(
            {
                user: {
                    isSetupComplete: true,
                },
            },
            '/organization-setup?redirect=%2Fonboarding%2Fdata-source',
        );

        expect(await screen.findByText('Data source page')).toBeInTheDocument();
        expect(screen.queryByText('Home page')).not.toBeInTheDocument();
    });

    it('falls back to home when the redirect target is the setup page itself', async () => {
        mockOrgApi('test organization', { optional: true });
        renderSetupPage(
            {
                user: {
                    isSetupComplete: true,
                },
            },
            '/organization-setup?redirect=%2Forganization-setup',
        );

        expect(await screen.findByText('Home page')).toBeInTheDocument();
    });
});
