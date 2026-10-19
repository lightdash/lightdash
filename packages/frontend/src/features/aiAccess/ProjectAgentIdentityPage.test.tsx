import { WarehouseTypes, type Project } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sharedLightdashApi } from '../../api';
import { ProjectAgentIdentityPage } from './ProjectAgentIdentityPage';

const mocks = vi.hoisted(() => ({ enabled: true, canManage: true }));
vi.mock('../../api');
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
vi.mock('./AiServiceAccountCard', () => ({
    AiServiceAccountCard: () => <div>Shared agent account card</div>,
}));
const renderPage = (warehouseType = WarehouseTypes.SNOWFLAKE) =>
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
});
describe('ProjectAgentIdentityPage', () => {
    it('shows agent identity without raw SQL confirmation controls or requests', async () => {
        renderPage();
        expect(
            await screen.findByText('Shared agent account card'),
        ).toBeInTheDocument();
        expect(
            screen.queryByText('Raw SQL for agents'),
        ).not.toBeInTheDocument();
        expect(sharedLightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({
                url: expect.stringContaining('warehouse-confirmation'),
            }),
        );
    });
    it.each(['flag', 'permission'])('renders nothing without %s', (gate) => {
        mocks.enabled = gate !== 'flag';
        mocks.canManage = gate !== 'permission';
        const { container } = renderPage();
        expect(container.querySelector(':scope > :not(style)')).toBeNull();
        expect(sharedLightdashApi).not.toHaveBeenCalled();
    });
});
