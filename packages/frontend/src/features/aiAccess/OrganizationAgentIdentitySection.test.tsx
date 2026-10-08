import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../api';
import { renderWithProviders } from '../../testing/testUtils';
import OrganizationAgentIdentitySection from './OrganizationAgentIdentitySection';

const mocks = vi.hoisted(() => ({
    enabled: true,
    canManage: true,
    configured: true,
    healthLoading: false,
    healthError: false,
    refetch: vi.fn(),
    toast: vi.fn(),
    errorToast: vi.fn(),
}));
vi.mock('../../api', () => ({ lightdashApi: vi.fn() }));
vi.mock('../../providers/App/useApp', () => ({
    default: () => ({
        health: {
            data: {
                rudder: {},
                auth: { snowflakeAi: { enabled: mocks.configured } },
                siteUrl: 'https://instance.example/',
            },
            isLoading: mocks.healthLoading,
            isError: mocks.healthError,
            refetch: mocks.refetch,
        },
        user: { data: { ability: { can: () => mocks.canManage } } },
    }),
}));
vi.mock('../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: mocks.enabled } }),
}));
vi.mock('../../hooks/toaster/useToaster', () => ({
    default: () => ({
        showToastSuccess: mocks.toast,
        showToastApiError: mocks.errorToast,
    }),
}));
vi.mock('../../components/common/CodeBlock/CodeBlock', () => ({
    default: ({ code }: { code: string }) => <pre>{code}</pre>,
}));

const renderSection = () => {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    renderWithProviders(
        <QueryClientProvider client={client}>
            <MemoryRouter>
                <OrganizationAgentIdentitySection />
            </MemoryRouter>
        </QueryClientProvider>,
    );
    return { invalidate };
};
const findSwitch = () =>
    screen.findByRole('switch', { name: /^Require agent identity/ });

describe('Organisation agent identity settings', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Object.assign(mocks, {
            enabled: true,
            canManage: true,
            configured: true,
            healthLoading: false,
            healthError: false,
        });
        vi.mocked(lightdashApi).mockResolvedValue({
            requireVerifiedAgentSessions: false,
        });
    });
    it.each([false, true])(
        'saves the opposite of %s through the organisation route',
        async (required) => {
            vi.mocked(lightdashApi).mockResolvedValue({
                requireVerifiedAgentSessions: required,
            });
            const { invalidate } = renderSection();
            const toggle = await findSwitch();
            expect(toggle).toHaveProperty('checked', required);
            expect(lightdashApi).toHaveBeenCalledWith({
                version: 'v2',
                url: '/org/agent-identity',
                method: 'GET',
                body: undefined,
            });
            fireEvent.click(toggle);
            await waitFor(() =>
                expect(lightdashApi).toHaveBeenCalledWith({
                    version: 'v2',
                    url: '/org/agent-identity',
                    method: 'PUT',
                    body: JSON.stringify({
                        requireVerifiedAgentSessions: !required,
                    }),
                }),
            );
            await waitFor(() =>
                expect(mocks.toast).toHaveBeenCalledWith({
                    title: 'Agent identity requirement saved.',
                }),
            );
            expect(invalidate).toHaveBeenCalledWith(['ai-access']);
            expect(
                screen.getByRole('link', { name: 'My warehouse connections' }),
            ).toHaveAttribute(
                'href',
                '/generalSettings/myWarehouseConnections',
            );
        },
    );
    it('disables the switch and shows setup when the integration is unavailable', async () => {
        mocks.configured = false;
        renderSection();
        expect(await findSwitch()).toBeDisabled();
        fireEvent.click(
            screen.getByRole('button', {
                name: 'Set up the Snowflake agent integration',
            }),
        );
        expect(
            screen.getByText(/CREATE SECURITY INTEGRATION/),
        ).toHaveTextContent(
            "OAUTH_REDIRECT_URI = 'https://instance.example/api/v1/oauth/redirect/snowflake-ai'",
        );
        expect(
            screen.getByText(/Set SNOWFLAKE_AI_OAUTH_CLIENT_ID/),
        ).toHaveTextContent('SNOWFLAKE_AI_OAUTH_TOKEN_ENDPOINT');
    });
    it('disables the switch while a save is pending', async () => {
        renderSection();
        const toggle = await findSwitch();
        vi.mocked(lightdashApi).mockImplementation(() => new Promise(() => {}));
        fireEvent.click(toggle);
        await waitFor(() => expect(toggle).toBeDisabled());
        expect(toggle).toHaveAttribute('aria-busy', 'true');
    });
    it('waits for settings to load', () => {
        vi.mocked(lightdashApi).mockImplementation(() => new Promise(() => {}));
        renderSection();
        expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    });
    it('shows a retry state when settings fail to load', async () => {
        vi.mocked(lightdashApi).mockRejectedValue({
            error: { message: 'Unavailable' },
        });
        renderSection();
        expect(
            await screen.findByText('Could not load agent identity settings.'),
        ).toBeInTheDocument();
        vi.mocked(lightdashApi).mockResolvedValue({
            requireVerifiedAgentSessions: true,
        });
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(await findSwitch()).toBeChecked();
    });
    it('reports a failed save without changing the requirement', async () => {
        renderSection();
        const toggle = await findSwitch();
        vi.mocked(lightdashApi).mockRejectedValue({
            error: { message: 'Unavailable' },
        });
        fireEvent.click(toggle);
        await waitFor(() => expect(mocks.errorToast).toHaveBeenCalled());
        expect(toggle).not.toBeChecked();
        expect(mocks.toast).not.toHaveBeenCalled();
    });
    it.each(['flag-off', 'non-admin'])('hides settings for %s', (mode) => {
        mocks.enabled = mode !== 'flag-off';
        mocks.canManage = mode !== 'non-admin';
        renderSection();
        expect(screen.queryByText('Agent identity')).not.toBeInTheDocument();
        expect(lightdashApi).not.toHaveBeenCalled();
    });
});
