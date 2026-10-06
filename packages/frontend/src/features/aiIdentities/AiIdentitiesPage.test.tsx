import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { expect, it, vi } from 'vitest';
import { AiIdentitiesPage } from './AiIdentitiesPage';

vi.mock('./api', () => ({
    aiIdentityApi: {
        accounts: vi.fn().mockResolvedValue([
            {
                aiIdentityAccountUuid: 'account',
                snowflakeAccount: 'Snowflake',
                counts: { failed: 0 },
            },
        ]),
        job: vi.fn(),
    },
}));
vi.mock('./AiIdentityCreationSetup', () => ({
    AiIdentityCreationSetup: ({
        onProvisioningJob,
    }: {
        onProvisioningJob: (uuid: string) => void;
    }) => (
        <button onClick={() => onProvisioningJob('job')}>
            Complete approval
        </button>
    ),
}));
vi.mock('./AiIdentityTriage', () => ({
    AiIdentityTriage: () => <div>Triage progress</div>,
}));
vi.mock('./AiIdentityAutomation', () => ({ AiIdentityAutomation: () => null }));
vi.mock('./AiIdentityRequestLog', () => ({ AiIdentityRequestLog: () => null }));
vi.mock('./AiIdentityJobCallout', () => ({ AiIdentityJobCallout: () => null }));
vi.mock('./refresh', () => ({ refreshAiIdentityCounts: vi.fn() }));
vi.mock('../../components/common/Settings/SettingsPage', () => ({
    SettingsPage: ({ children }: { children: React.ReactNode }) => (
        <>{children}</>
    ),
}));

const Location = () => {
    const location = useLocation();
    return <output data-testid="location">{location.search}</output>;
};

it('opens Triage and sets the job URL after approval', async () => {
    render(
        <MemoryRouter initialEntries={['/?tab=setup&review=1']}>
            <MantineProvider env="test">
                <QueryClientProvider client={new QueryClient()}>
                    <AiIdentitiesPage />
                    <Location />
                </QueryClientProvider>
            </MantineProvider>
        </MemoryRouter>,
    );
    fireEvent.click(
        await screen.findByRole('button', { name: 'Complete approval' }),
    );
    expect(screen.getByTestId('location')).toHaveTextContent('tab=triage');
    expect(screen.getByTestId('location')).toHaveTextContent('job=job');
    expect(screen.getByTestId('location')).not.toHaveTextContent('review=1');
    expect(screen.getByText('Triage progress')).toBeInTheDocument();
});
