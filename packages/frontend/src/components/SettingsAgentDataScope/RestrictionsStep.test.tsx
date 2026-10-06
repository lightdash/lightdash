import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { expect, it, vi } from 'vitest';
import { RestrictionsStep } from './RestrictionsStep';
import { type BoundaryGuide } from './useBoundaryGuide';

it('shows only the review button and links to a fresh review plan', () => {
    const guide = {
        restrictions: { enabled: true },
        updateRestrictions: {
            isLoading: false,
            isError: false,
            mutate: vi.fn(),
        },
        config: {
            data: {
                aiIdentitiesEnabled: true,
                aiIdentityAccountUuid: 'account',
                memberCount: 2,
                statuses: { checks: 'verified' },
            },
        },
    } as unknown as BoundaryGuide;
    render(
        <MemoryRouter>
            <MantineProvider env="test">
                <RestrictionsStep
                    guide={guide}
                    projectUuid="project"
                    available
                />
            </MantineProvider>
        </MemoryRouter>,
    );
    expect(screen.queryByText('On')).not.toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(
        screen.getByRole('link', { name: 'Review the plan' }),
    ).toHaveAttribute(
        'href',
        '/generalSettings/aiIdentities?project=project&account=account&tab=setup&review=1',
    );
});
