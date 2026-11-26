import { AgentCapability } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sharedLightdashApi } from '../../api';
import { ProjectAgentRestrictions } from './ProjectAgentRestrictions';

vi.mock('../../api');
vi.mock('../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: true } }),
}));
vi.mock('../../providers/App/useApp', () => ({
    default: () => ({ user: { data: { organizationUuid: 'org' } } }),
}));
vi.mock('../../hooks/toaster/useToaster', () => ({
    default: () => ({ showToastSuccess: vi.fn(), showToastApiError: vi.fn() }),
}));

const everything = Object.values(AgentCapability);
const api = vi.mocked(sharedLightdashApi);

const setup = ({
    organization = null,
    project,
}: {
    organization?: AgentCapability[] | null;
    project?: AgentCapability[] | null;
}) => {
    api.mockImplementation(async ({ url, method }) => {
        if (method !== 'GET') return undefined;
        if (url === '/org/agent-permissions/projects')
            return project === undefined
                ? []
                : [{ projectUuid: 'project', allowedCapabilities: project }];
        return {
            version: 1,
            allowedCapabilities: organization,
            allowedGroupUuids: null,
            groupsAvailable: true,
        };
    });
    render(
        <MantineProvider env="test">
            <QueryClientProvider
                client={
                    new QueryClient({
                        defaultOptions: { queries: { retry: false } },
                    })
                }
            >
                <ProjectAgentRestrictions projectUuid="project" />
            </QueryClientProvider>
        </MantineProvider>,
    );
    return userEvent.setup();
};

const writes = () =>
    api.mock.calls
        .map(([call]) => call)
        .filter((call) => call.method !== 'GET');

beforeEach(() => vi.clearAllMocks());

describe('ProjectAgentRestrictions', () => {
    it('follows the organization until the project gets its own setting', async () => {
        setup({});
        expect(
            await screen.findByRole('radio', {
                name: 'Use organization setting',
            }),
        ).toBeChecked();
        expect(
            screen.getByText('Currently: No restrictions.'),
        ).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });

    it('restricts raw SQL for this project only', async () => {
        const user = setup({});
        await user.click(
            await screen.findByRole('radio', { name: 'Restrict' }),
        );
        expect(screen.getByText('Agents can:')).toBeInTheDocument();
        await user.click(screen.getByRole('switch', { name: 'Raw SQL' }));
        await user.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() => expect(writes()).toHaveLength(1));
        expect(writes()[0]).toMatchObject({
            url: '/org/agent-permissions/projects/project',
            method: 'PUT',
        });
        expect(JSON.parse(writes()[0].body as string)).toEqual({
            allowedCapabilities: everything.filter(
                (capability) => capability !== AgentCapability.RawSql,
            ),
        });
    });

    it('starts the switches from the organization restrictions', async () => {
        const user = setup({ organization: [AgentCapability.Query] });
        expect(
            await screen.findByText('Currently: Restrict.'),
        ).toBeInTheDocument();
        await user.click(screen.getByRole('radio', { name: 'Restrict' }));
        expect(
            screen.getByRole('switch', { name: 'Query data' }),
        ).toBeChecked();
        expect(
            screen.getByRole('switch', { name: 'Raw SQL' }),
        ).not.toBeChecked();
    });

    it('saves no restrictions as an exception to the organization', async () => {
        const user = setup({ organization: [AgentCapability.Query] });
        await user.click(
            await screen.findByRole('radio', { name: 'No restrictions' }),
        );
        await user.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() => expect(writes()).toHaveLength(1));
        expect(JSON.parse(writes()[0].body as string)).toEqual({
            allowedCapabilities: null,
        });
    });

    it('removes the project setting to follow the organization again', async () => {
        const user = setup({ project: [AgentCapability.Query] });
        expect(
            await screen.findByRole('radio', { name: 'Restrict' }),
        ).toBeChecked();
        await user.click(
            screen.getByRole('radio', { name: 'Use organization setting' }),
        );
        await user.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() => expect(writes()).toHaveLength(1));
        expect(writes()[0]).toMatchObject({
            url: '/org/agent-permissions/projects/project',
            method: 'DELETE',
        });
    });
});
