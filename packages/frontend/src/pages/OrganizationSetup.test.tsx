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

const toasterMocks = vi.hoisted(() => ({
    showToastApiError: vi.fn(),
    showToastSuccess: vi.fn(),
    showToastError: vi.fn(),
    showToastInfo: vi.fn(),
    showToastWarning: vi.fn(),
    addToastError: vi.fn(),
}));

vi.mock('../hooks/toaster/useToaster', () => ({
    default: () => toasterMocks,
}));

const PERIOD_TITLE = "Periods aren't allowed";
const COMMA_TITLE = "Commas aren't allowed";
const MIXED_TITLE = "That name has characters we can't use";
const RULE_BODY = 'Use letters, numbers, spaces, hyphens or underscores.';
const SUGGESTION_LABEL = /Use "Acme Inc"/;

const renderNameStep = () => {
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
    return screen.findByPlaceholderText('Acme Analytics');
};

const typeNameAndBlur = async (
    user: ReturnType<typeof userEvent.setup>,
    input: HTMLElement,
    name: string,
) => {
    await user.clear(input);
    await user.type(input, name);
    await user.tab();
};

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

const mockBrandFetch = (name: string, ready?: Promise<void>) =>
    nock(BASE_API_URL)
        .post('/api/v1/org/brand/fetch')
        .reply(200, async () => {
            if (ready) await ready;
            return {
                status: 'ok',
                results: {
                    organizationUuid: 'org-uuid',
                    domain: 'lightdash.com',
                    name,
                    description: null,
                    logos: [],
                    colors: [],
                    fonts: [],
                    updatedAt: new Date().toISOString(),
                },
            };
        });

const selectRole = async (user: ReturnType<typeof userEvent.setup>) => {
    const roleSelect = await screen.findByPlaceholderText('Select your role');
    await user.click(roleSelect);
    const roleOption = await screen.findByText('Software Engineer');
    await user.click(roleOption);
};

describe('OrganizationSetup', () => {
    beforeEach(() => {
        Object.values(toasterMocks).forEach((mock) => mock.mockReset());
        vi.mocked(useServerFeatureFlag).mockReturnValue({
            data: { id: 'organization-setup-page', enabled: true },
            isLoading: false,
        } as ReturnType<typeof useServerFeatureFlag>);
    });

    it('does not ask invited members how they heard about us', async () => {
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

        // invited members do not see the referral question
        expect(
            screen.queryByRole('textbox', {
                name: /How did you hear about us/,
            }),
        ).not.toBeInTheDocument();

        const submitButton = await screen.findByRole('button', {
            name: 'Finish',
        });
        expect(submitButton).toBeDisabled();

        await selectRole(user);

        const scope = nock(BASE_API_URL)
            .patch('/api/v1/user/me/complete', {
                jobTitle: 'Software Engineer',
                enableEmailDomainAccess: false,
                isMarketingOptedIn: true,
                isTrackingAnonymized: false,
            })
            .reply(200);

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
                enableEmailDomainAccess: false,
                isMarketingOptedIn: true,
                isTrackingAnonymized: false,
            })
            .reply(200);

        // invited members do not see the referral question
        expect(
            screen.queryByRole('textbox', {
                name: /How did you hear about us/,
            }),
        ).not.toBeInTheDocument();

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

    it('shows the organization name error on step 1 when Continue is clicked with an invalid name', async () => {
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
        await user.type(nameInput, 'Acme Inc.');

        let completionRequestCount = 0;
        nock(BASE_API_URL)
            .patch('/api/v1/user/me/complete')
            .optionally()
            .reply(() => {
                completionRequestCount += 1;
                return [200];
            });

        await user.click(
            await screen.findByRole('button', { name: 'Continue' }),
        );

        await waitFor(() =>
            expect(screen.getByRole('alert')).toHaveTextContent(PERIOD_TITLE),
        );
        expect(
            screen.queryByPlaceholderText('Select your role'),
        ).not.toBeInTheDocument();
        expect(completionRequestCount).toBe(0);
    });

    it('names the offending character in a danger callout when the field loses focus', async () => {
        const user = userEvent.setup();

        const nameInput = await renderNameStep();
        await typeNameAndBlur(user, nameInput, 'Acme Inc.');

        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent(PERIOD_TITLE);
        expect(alert).toHaveTextContent(RULE_BODY);
        expect(nameInput).toHaveAttribute('aria-invalid', 'true');
        expect(screen.getAllByText(PERIOD_TITLE)).toHaveLength(1);
        expect(screen.getAllByText(RULE_BODY)).toHaveLength(1);
    });

    it('fills the field from the suggestion button and lets the user continue', async () => {
        const user = userEvent.setup();

        const nameInput = await renderNameStep();
        await typeNameAndBlur(user, nameInput, 'Acme Inc.');

        const suggestion = await screen.findByRole('button', {
            name: SUGGESTION_LABEL,
        });

        await user.click(suggestion);

        expect(nameInput).toHaveValue('Acme Inc');
        await waitFor(() =>
            expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
        );

        await user.click(
            await screen.findByRole('button', { name: 'Continue' }),
        );

        expect(
            await screen.findByPlaceholderText('Select your role'),
        ).toBeInTheDocument();
    });

    it('titles the callout plainly when several kinds of character fail', async () => {
        const user = userEvent.setup();

        const nameInput = await renderNameStep();
        await typeNameAndBlur(user, nameInput, 'Acme & Co.');

        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent(MIXED_TITLE);
        expect(alert).toHaveTextContent(RULE_BODY);
    });

    it('offers no suggestion button when nothing valid survives sanitizing', async () => {
        const user = userEvent.setup();

        const nameInput = await renderNameStep();
        await typeNameAndBlur(user, nameInput, '...');

        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent(PERIOD_TITLE);
        expect(
            screen.queryByRole('button', { name: /^Use "/ }),
        ).not.toBeInTheDocument();
    });

    it('clears the callout as soon as the typed value becomes valid', async () => {
        const user = userEvent.setup();

        const nameInput = await renderNameStep();
        await typeNameAndBlur(user, nameInput, 'Acme Inc.');

        await screen.findByRole('alert');

        await user.click(nameInput);
        await user.type(nameInput, '{backspace}');

        expect(nameInput).toHaveValue('Acme Inc');
        await waitFor(() =>
            expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
        );
    });

    it('renames the offending character while the typed value stays invalid', async () => {
        const user = userEvent.setup();

        const nameInput = await renderNameStep();
        await typeNameAndBlur(user, nameInput, 'Acme Inc.');

        expect(await screen.findByRole('alert')).toHaveTextContent(
            PERIOD_TITLE,
        );

        await user.type(nameInput, ',', {
            initialSelectionStart: 8,
            initialSelectionEnd: 9,
        });

        expect(nameInput).toHaveValue('Acme Inc,');
        await waitFor(() =>
            expect(screen.getByRole('alert')).toHaveTextContent(COMMA_TITLE),
        );
    });

    it('reaches the suggestion with the keyboard and applies it with Enter', async () => {
        const user = userEvent.setup();

        const nameInput = await renderNameStep();
        await typeNameAndBlur(user, nameInput, 'Acme Inc.');

        await screen.findByRole('button', { name: SUGGESTION_LABEL });

        await user.click(nameInput);
        await user.tab();

        expect(
            screen.getByRole('button', { name: SUGGESTION_LABEL }),
        ).toHaveFocus();

        await user.keyboard('{Enter}');

        expect(nameInput).toHaveValue('Acme Inc');
        await waitFor(() =>
            expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
        );
    });

    it('applies the sanitized brand name when detection resolves after the workspace step', async () => {
        const user = userEvent.setup();

        let releaseBrand: () => void = () => {};
        const brandReady = new Promise<void>((resolve) => {
            releaseBrand = resolve;
        });

        mockOrgApi('');
        mockBrandFetch('Acme Inc.', brandReady);

        renderSetupPage({
            user: {
                isSetupComplete: false,
                organizationName: '',
                email: 'demo@lightdash.com',
            },
            health: {
                mode: LightdashMode.DEFAULT,
                hasBrandfetch: true,
            },
        });

        await screen.findByPlaceholderText('Acme Analytics');
        await user.click(
            await screen.findByRole('button', { name: 'Continue' }),
        );

        await screen.findByPlaceholderText('Select your role');
        await selectRole(user);

        const referralInput = await screen.findByRole('textbox', {
            name: /How did you hear about us/,
        });
        await user.type(referralInput, 'a podcast');

        releaseBrand();
        await screen.findByText('lightdash.com');

        const scope = nock(BASE_API_URL)
            .patch('/api/v1/user/me/complete', (body) => {
                expect(body.organizationName).toBe('Acme Inc');
                return true;
            })
            .reply(200);
        const brandScope = nock(BASE_API_URL)
            .put('/api/v1/org/brand', () => true)
            .reply(200, { status: 'ok', results: null });

        await user.click(await screen.findByRole('button', { name: 'Finish' }));

        await waitFor(() => expect(scope.isDone()).toBe(true));
        await waitFor(() => expect(brandScope.isDone()).toBe(true));
        expect(
            screen.queryByPlaceholderText('Acme Analytics'),
        ).not.toBeInTheDocument();
    });

    it('completes setup with a sanitized punctuated brand name', async () => {
        const user = userEvent.setup();

        mockOrgApi('');
        mockBrandFetch('Acme Inc.');

        renderSetupPage({
            user: {
                isSetupComplete: false,
                organizationName: '',
                email: 'demo@lightdash.com',
            },
            health: {
                mode: LightdashMode.DEFAULT,
                hasBrandfetch: true,
            },
        });

        const nameInput = await screen.findByPlaceholderText('Acme Analytics');
        await waitFor(() => expect(nameInput).toHaveValue('Acme Inc'));

        await user.click(
            await screen.findByRole('button', { name: 'Continue' }),
        );

        await screen.findByPlaceholderText('Select your role');
        await selectRole(user);

        const referralInput = await screen.findByRole('textbox', {
            name: /How did you hear about us/,
        });
        await user.type(referralInput, 'a podcast');

        const scope = nock(BASE_API_URL)
            .patch('/api/v1/user/me/complete', {
                organizationName: 'Acme Inc',
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

    it('falls back to the domain-derived name when the brand name has no usable characters', async () => {
        mockOrgApi('');
        mockBrandFetch('...');

        renderSetupPage({
            user: {
                isSetupComplete: false,
                organizationName: '',
                email: 'demo@lightdash.com',
            },
            health: {
                mode: LightdashMode.DEFAULT,
                hasBrandfetch: true,
            },
        });

        const nameInput = await screen.findByPlaceholderText('Acme Analytics');
        await screen.findByText('lightdash.com');
        await waitFor(() => expect(nameInput).toHaveValue('Lightdash'));
    });

    it('shows an error toast when completing setup fails', async () => {
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
        await user.type(referralInput, 'a podcast');

        const scope = nock(BASE_API_URL)
            .patch('/api/v1/user/me/complete')
            .reply(400, {
                status: 'error',
                error: {
                    name: 'ParameterError',
                    statusCode: 400,
                    message:
                        'Organization name can be composed only of letters, numbers, spaces, underscores or dashes, and not be empty',
                    data: {},
                },
            });
        nock(BASE_API_URL)
            .put('/api/v1/org/brand', () => true)
            .optionally()
            .reply(200, { status: 'ok', results: null });

        await user.click(await screen.findByRole('button', { name: 'Finish' }));

        await waitFor(() => expect(scope.isDone()).toBe(true));
        await waitFor(() =>
            expect(toasterMocks.showToastApiError).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: 'Failed to complete setup',
                }),
            ),
        );
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
