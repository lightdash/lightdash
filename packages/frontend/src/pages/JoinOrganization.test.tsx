import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import nock from 'nock';
import { MemoryRouter, Route, Routes } from 'react-router';
import { BASE_API_URL } from '../api';
import { renderWithProviders } from '../testing/testUtils';
import JoinOrganizationPage from './JoinOrganization';

const renderJoinOrganizationPage = () =>
    renderWithProviders(
        <MemoryRouter initialEntries={['/join-organization']}>
            <Routes>
                <Route
                    path="/join-organization"
                    element={<JoinOrganizationPage />}
                />
                <Route path="/" element={<div>Home page</div>} />
            </Routes>
        </MemoryRouter>,
        {
            user: {
                organizationUuid: undefined,
                organizationName: '',
                isSetupComplete: false,
            },
        },
    );

describe('JoinOrganizationPage', () => {
    it('requires a name before creating a default organization', async () => {
        const user = userEvent.setup();
        nock(BASE_API_URL)
            .get('/api/v1/user/me/allowedOrganizations')
            .reply(200, { status: 'ok', results: [] });
        const createOrganization = nock(BASE_API_URL)
            .put('/api/v1/org', { name: 'Acme Analytics' })
            .reply(200, { status: 'ok', results: null });

        renderJoinOrganizationPage();

        const dialog = await screen.findByRole('dialog');
        expect(
            within(dialog).getByText('Create a new workspace'),
        ).toBeInTheDocument();
        expect(createOrganization.isDone()).toBe(false);

        const submitButton = within(dialog).getByRole('button', {
            name: 'Create workspace',
        });
        const organizationNameInput = within(dialog).getByRole('textbox', {
            name: 'Organization name',
        });
        expect(organizationNameInput).toHaveValue('My organization');
        expect(submitButton).toBeEnabled();

        await user.clear(organizationNameInput);
        expect(submitButton).toBeDisabled();
        await user.type(organizationNameInput, 'Acme Analytics');
        expect(submitButton).toBeEnabled();
        await user.click(submitButton);

        await waitFor(() => expect(createOrganization.isDone()).toBe(true));
    });
});
