import { AiIdentityState } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { render, fireEvent, screen } from '@testing-library/react';
import { type ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
const renderWithProviders = (ui: ReactElement) =>
    render(<MantineProvider>{ui}</MantineProvider>);
import { AiIdentityCallout, AiIdentityTrustNotice } from './AiIdentityCallout';

const { signIn, canManage } = vi.hoisted(() => ({
    signIn: vi.fn(),
    canManage: vi.fn(() => false),
}));
vi.mock('../../hooks/useAiIdentityAccess', () => ({
    useAiIdentitySignIn: () => ({ mutate: signIn, isLoading: false }),
}));
vi.mock('../../../../../providers/App/useApp', () => ({
    default: () => ({
        user: {
            data: { organizationUuid: 'org', ability: { can: canManage } },
        },
    }),
}));

beforeEach(() => {
    signIn.mockClear();
    canManage.mockReturnValue(false);
});

it('offers the personal Snowflake sign-in action', () => {
    renderWithProviders(
        <MemoryRouter>
            <AiIdentityCallout
                state={AiIdentityState.NEEDS_SIGN_IN}
                message="Sign in to set up your AI identity."
            />
        </MemoryRouter>,
    );
    fireEvent.click(
        screen.getByRole('button', { name: 'Sign in to Snowflake' }),
    );
    expect(signIn).toHaveBeenCalledOnce();
    expect(screen.queryByText('Review AI identities')).not.toBeInTheDocument();
});

it.each([AiIdentityState.PENDING, AiIdentityState.FAILED])(
    'shows a fixed %s message without a sign-in action',
    (state) => {
        renderWithProviders(
            <MemoryRouter>
                <AiIdentityCallout
                    state={state}
                    message="Ask an admin to set up your AI identity."
                />
            </MemoryRouter>,
        );
        expect(
            screen.getByText('Ask an admin to set up your AI identity.'),
        ).toBeInTheDocument();
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    },
);

it('gives admins a link to the organization page', () => {
    canManage.mockReturnValue(true);
    renderWithProviders(
        <MemoryRouter>
            <AiIdentityCallout
                state={AiIdentityState.FAILED}
                message="Ask an admin to set up your AI identity."
            />
        </MemoryRouter>,
    );
    expect(
        screen.getByRole('link', { name: 'Review AI identities' }),
    ).toHaveAttribute('href', '/generalSettings/aiIdentities');
});

it('names the ready identity in the trust notice', () => {
    renderWithProviders(<AiIdentityTrustNotice name="PERSON_AI" />);
    expect(
        screen.getByText('Runs as PERSON_AI · AI identity'),
    ).toBeInTheDocument();
});
