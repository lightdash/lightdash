import { AgentCapability } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sharedLightdashApi } from '../../api';
import { AgentProjectExceptions } from './AgentProjectExceptions';

vi.mock('../../api');
vi.mock('../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: true } }),
}));
vi.mock('../../providers/App/useApp', () => ({
    default: () => ({ user: { data: { organizationUuid: 'org' } } }),
}));

const projects = [
    { projectUuid: 'main', name: 'Main warehouse' },
    { projectUuid: 'replica', name: 'Replica' },
    { projectUuid: 'open', name: 'Open project' },
];
const everything = Object.values(AgentCapability);

const renderList = (policies: unknown[]) => {
    vi.mocked(sharedLightdashApi).mockResolvedValue(policies);
    render(
        <MantineProvider env="test">
            <QueryClientProvider
                client={
                    new QueryClient({
                        defaultOptions: { queries: { retry: false } },
                    })
                }
            >
                <MemoryRouter>
                    <AgentProjectExceptions projects={projects} />
                </MemoryRouter>
            </QueryClientProvider>
        </MantineProvider>,
    );
};

beforeEach(() => vi.clearAllMocks());

describe('AgentProjectExceptions', () => {
    it('says every project follows the organization when none has its own setting', async () => {
        renderList([]);
        expect(
            await screen.findByText(
                'Every project uses the organization setting.',
            ),
        ).toBeInTheDocument();
    });

    it('lists each project setting with a link to edit it', async () => {
        renderList([
            {
                projectUuid: 'replica',
                allowedCapabilities: everything.filter(
                    (capability) => capability !== AgentCapability.RawSql,
                ),
            },
            { projectUuid: 'open', allowedCapabilities: null },
            { projectUuid: 'deleted', allowedCapabilities: [] },
        ]);
        expect(
            await screen.findByText('Restrict: Raw SQL off'),
        ).toBeInTheDocument();
        expect(screen.getByText('No restrictions')).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: 'Edit Replica' }),
        ).toHaveAttribute(
            'href',
            '/generalSettings/projectManagement/replica/agentIdentity',
        );
        expect(screen.queryByText('Restrict: agents off')).toBeNull();
        expect(
            screen.queryByRole('link', { name: 'Edit Main warehouse' }),
        ).toBeNull();
    });
});
