import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import nock from 'nock';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BASE_API_URL } from '../api';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';
import { renderWithProviders } from '../testing/testUtils';
import OrganizationSetup from './OrganizationSetup';

vi.mock('../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: vi.fn(),
}));

vi.mock('../hooks/organization/useOrganizationBrand', () => ({
    useDetectOrganizationBrand: vi.fn().mockReturnValue({
        data: undefined,
        isFetched: true,
        isFetching: false,
    }),
    useSaveOrganizationBrand: vi.fn().mockReturnValue({ mutate: vi.fn() }),
}));

const renderPage = (mocks?: Parameters<typeof renderWithProviders>[1]) =>
    renderWithProviders(
        <MemoryRouter initialEntries={['/organization-setup']}>
            <OrganizationSetup />
        </MemoryRouter>,
        mocks,
    );

const goToAboutYouStep = async () => {
    const user = userEvent.setup();
    const continueButton = await screen.findByRole('button', {
        name: 'Continue',
    });
    await user.click(continueButton);
    await screen.findByText('Tell us about you');
    return user;
};

describe('OrganizationSetup', () => {
    beforeEach(() => {
        vi.mocked(useServerFeatureFlag).mockReturnValue({
            data: { id: 'organization-setup-page', enabled: true },
            isLoading: false,
        } as ReturnType<typeof useServerFeatureFlag>);
    });

    it('should default the email domain access checkbox to unchecked', async () => {
        renderPage({
            user: {
                isSetupComplete: false,
                organizationName: '',
                email: 'demo@lightdash.com',
            },
        });

        await goToAboutYouStep();

        const emailDomainCheckbox = await screen.findByRole('checkbox', {
            name: `Allow users with @lightdash.com to join the organization as a viewer`,
        });
        expect(emailDomainCheckbox).not.toBeChecked();
    });

    it('should submit with email domain access disabled when the checkbox is left untouched', async () => {
        renderPage({
            user: {
                isSetupComplete: false,
                organizationName: '',
                email: 'demo@lightdash.com',
            },
        });

        const user = await goToAboutYouStep();

        const roleSelect =
            await screen.findByPlaceholderText('Select your role');
        await user.click(roleSelect);
        const roleOption = await screen.findByText('Software Engineer');
        await user.click(roleOption);

        const scope = nock(BASE_API_URL)
            .patch(
                '/api/v1/user/me/complete',
                (body) => body.enableEmailDomainAccess === false,
            )
            .reply(200);

        const finishButton = await screen.findByRole('button', {
            name: 'Finish',
        });
        await user.click(finishButton);

        await waitFor(() => expect(scope.isDone()).toBe(true));
    });
});
