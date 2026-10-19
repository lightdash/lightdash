import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import AgentConnected from './AgentConnected';

vi.mock('../components/LightdashLogo/LightdashLogo', () => ({
    default: () => null,
}));

const renderPage = (query = '') =>
    render(
        <MantineProvider env="test">
            <MemoryRouter initialEntries={[`/agent-connected${query}`]}>
                <AgentConnected />
            </MemoryRouter>
        </MantineProvider>,
    );

describe('AgentConnected', () => {
    it('shows the success copy', () => {
        renderPage();
        expect(screen.getByText('Agent connected.')).toBeInTheDocument();
        expect(
            screen.getByText('Go back to your client and run that again.'),
        ).toBeInTheDocument();
        expect(document.title).toContain('Agent connection');
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });

    it.each([
        [
            'not_agent_session',
            'Your Snowflake sign-in is not an agent session. Ask your Snowflake admin to set IS_AGENTIC = TRUE on the security integration used for agents.',
        ],
        [
            'no_refresh_token',
            'Snowflake did not return a refresh token. Try again.',
        ],
        ['license_required', 'An enterprise licence is required.'],
        ['sign_in_failed', 'The sign-in did not complete. Try again.'],
        ['unknown', 'The sign-in did not complete. Try again.'],
        ['', 'The sign-in did not complete. Try again.'],
    ])('explains error=%s', (code, reason) => {
        renderPage(`?error=${code}`);
        expect(
            screen.getByText('Agent connection failed.'),
        ).toBeInTheDocument();
        expect(screen.getByText(reason)).toBeInTheDocument();
        expect(
            screen.getByRole('link', {
                name: 'Try again from My agent identity',
            }),
        ).toHaveAttribute('href', '/generalSettings/myAgentConnections');
    });
});
