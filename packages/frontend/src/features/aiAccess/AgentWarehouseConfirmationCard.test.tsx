import {
    WarehouseTypes,
    type OrganizationAgentIdentityOverview,
    type Project,
} from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../api';
import { ProjectAgentIdentityPage } from './ProjectAgentIdentityPage';

const mocks = vi.hoisted(() => ({ enabled: true, canManage: true }));
vi.mock('../../api', () => ({ lightdashApi: vi.fn() }));
vi.mock('../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: mocks.enabled } }),
}));
vi.mock('../../providers/Ability/useAbilityContext', () => ({
    useAbilityContext: () => ({ can: () => mocks.canManage }),
}));
vi.mock('../../providers/App/useApp', () => ({
    default: () => ({ user: { data: { organizationUuid: 'org' } } }),
}));
vi.mock('../../hooks/toaster/useToaster', () => ({
    default: () => ({ showToastSuccess: vi.fn(), showToastApiError: vi.fn() }),
}));
vi.mock('../../hooks/useOrganizationUsers', () => ({
    useOrganizationUsers: () => ({
        data: [
            {
                userUuid: 'admin',
                firstName: 'Sam',
                lastName: 'Smith',
                email: 'sam@example.com',
            },
        ],
    }),
}));
vi.mock('./AiServiceAccountCard', () => ({ AiServiceAccountCard: () => null }));
const confirmation = {
    projectUuid: 'project',
    bindingFingerprint: 'fingerprint',
    confirmedByUserUuid: 'admin',
    confirmedAt: new Date('2026-10-10T12:00:00Z'),
};
let status: { confirmation: typeof confirmation | null; confirmed: boolean };
const renderCard = (warehouseType = WarehouseTypes.SNOWFLAKE) =>
    render(
        <MantineProvider env="test">
            <QueryClientProvider
                client={
                    new QueryClient({
                        defaultOptions: { queries: { retry: false } },
                    })
                }
            >
                <ProjectAgentIdentityPage
                    project={
                        {
                            projectUuid: 'project',
                            organizationUuid: 'org',
                            warehouseConnection: {
                                type: warehouseType,
                            },
                        } as Project
                    }
                />
            </QueryClientProvider>
        </MantineProvider>,
    );
beforeEach(() => {
    vi.clearAllMocks();
    mocks.enabled = true;
    mocks.canManage = true;
    status = { confirmation: null, confirmed: false };
    vi.mocked(lightdashApi).mockImplementation(async ({ url, method }) => {
        if (url === '/org/agent-identity')
            return {
                rules: [
                    {
                        warehouseType: WarehouseTypes.SNOWFLAKE,
                        source: 'marked_person',
                        projectsMissingAiServiceAccount: null,
                    },
                ],
                snowflakeConfigured: false,
                requireVerifiedAgentSessions: false,
            } satisfies OrganizationAgentIdentityOverview;
        if (method === 'PUT') {
            status = { confirmation, confirmed: true };
            return confirmation;
        }
        if (method === 'DELETE') {
            status = { confirmation: null, confirmed: false };
            return undefined;
        }
        return status;
    });
});
describe('Raw SQL for agents', () => {
    it('allows confirmation on ClickHouse without a shared agent account', async () => {
        renderCard(WarehouseTypes.CLICKHOUSE);
        expect(
            await screen.findByText('Raw SQL for agents'),
        ).toBeInTheDocument();
        expect(await screen.findByText('Not confirmed')).toBeInTheDocument();
        fireEvent.click(
            screen.getByRole('checkbox', {
                name: "The warehouse limits what the agent's identity can read",
            }),
        );
        fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
        expect(
            await screen.findByText(/Confirmed by Sam Smith/),
        ).toBeInTheDocument();
        expect(lightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({ url: '/org/agent-identity' }),
        );
    });
    it('requires the statement before confirming, then shows the person and date', async () => {
        renderCard();
        expect(await screen.findByText('Not confirmed')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
        fireEvent.click(
            screen.getByRole('checkbox', {
                name: "The warehouse limits what the agent's identity can read",
            }),
        );
        fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
        await waitFor(() =>
            expect(lightdashApi).toHaveBeenCalledWith(
                expect.objectContaining({
                    version: 'v2',
                    url: '/org/agent-permissions/projects/project/warehouse-confirmation',
                    method: 'PUT',
                }),
            ),
        );
        expect(
            await screen.findByText(/Confirmed by Sam Smith/),
        ).toHaveTextContent('2026');
    });
    it('shows an expired confirmation and allows renewal or removal', async () => {
        status = { confirmation, confirmed: false };
        renderCard();
        expect(await screen.findByText(/Expired/)).toHaveTextContent(
            'connection changed',
        );
        expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
        fireEvent.click(
            screen.getByRole('button', { name: 'Remove confirmation' }),
        );
        await waitFor(() =>
            expect(lightdashApi).toHaveBeenCalledWith(
                expect.objectContaining({
                    method: 'DELETE',
                    url: '/org/agent-permissions/projects/project/warehouse-confirmation',
                }),
            ),
        );
        expect(await screen.findByText('Not confirmed')).toBeInTheDocument();
    });
    it('renews an expired confirmation only after the statement is checked again', async () => {
        status = { confirmation, confirmed: false };
        renderCard();
        await screen.findByText(/Expired/);
        fireEvent.click(
            screen.getByRole('checkbox', {
                name: "The warehouse limits what the agent's identity can read",
            }),
        );
        fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
        expect(
            await screen.findByText(/Confirmed by Sam Smith/),
        ).toBeInTheDocument();
        expect(lightdashApi).toHaveBeenCalledWith(
            expect.objectContaining({ method: 'PUT' }),
        );
    });
    it('removes a valid confirmation', async () => {
        status = { confirmation, confirmed: true };
        renderCard();
        await screen.findByText(/Confirmed by Sam Smith/);
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
        fireEvent.click(
            screen.getByRole('button', { name: 'Remove confirmation' }),
        );
        expect(await screen.findByText('Not confirmed')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
    });
    it.each(['flag', 'permission'])('hides controls without %s', (gate) => {
        mocks.enabled = gate !== 'flag';
        mocks.canManage = gate !== 'permission';
        renderCard();
        expect(
            screen.queryByText('Raw SQL for agents'),
        ).not.toBeInTheDocument();
        expect(lightdashApi).not.toHaveBeenCalled();
    });
});
