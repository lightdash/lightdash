import { AiIdentityState } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { AiIdentityCard } from './AiIdentitySection';

const { signIn } = vi.hoisted(() => ({ signIn: vi.fn() }));
vi.mock('../../../ee/features/aiCopilot/hooks/useAiIdentityAccess', () => ({
    useAiIdentitySignIn: () => ({ mutate: signIn, isLoading: false }),
}));

const identity = {
    aiIdentityAccountUuid: 'account',
    accountLabel: 'ACCOUNT',
    aiIdentityName: 'PERSON_AI',
    lastCheckedAt: null,
    action: null,
    message: "Your AI identity isn't set up yet. Ask an admin to set it up.",
};

it('shows the ready name and read-only state', () => {
    render(
        <MantineProvider>
            <AiIdentityCard
                identity={{ ...identity, state: AiIdentityState.READY }}
            />
        </MantineProvider>,
    );
    expect(screen.getByText('PERSON_AI')).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByText('Not checked yet')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

it.each([AiIdentityState.PENDING, AiIdentityState.FAILED])(
    'does not offer an action for %s',
    (state) => {
        render(
            <MantineProvider>
                <AiIdentityCard identity={{ ...identity, state }} />
            </MantineProvider>,
        );
        expect(screen.getByText(identity.message)).toBeInTheDocument();
        expect(screen.getByText('Not ready')).toBeInTheDocument();
        expect(screen.queryByText('Failed')).not.toBeInTheDocument();
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    },
);

it('offers personal sign-in for needs sign-in', () => {
    render(
        <MantineProvider>
            <AiIdentityCard
                identity={{ ...identity, state: AiIdentityState.NEEDS_SIGN_IN }}
            />
        </MantineProvider>,
    );
    fireEvent.click(
        screen.getByRole('button', { name: 'Sign in to Snowflake' }),
    );
    expect(signIn).toHaveBeenCalledOnce();
});
