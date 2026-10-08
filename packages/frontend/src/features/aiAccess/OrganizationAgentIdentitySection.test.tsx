import { WarehouseTypes } from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../api';
import { renderWithProviders } from '../../testing/testUtils';
import { identityLabels, requiredIdentityLabel } from './identityLabels';
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
    return { invalidate, container: document.body };
};
const overview = (required = false) => ({
    requireVerifiedAgentSessions: false,
    rules: [
        {
            warehouseType: WarehouseTypes.SNOWFLAKE,
            source: 'agent_sign_in',
            required,
        },
        {
            warehouseType: WarehouseTypes.BIGQUERY,
            source: 'ai_service_account',
            required,
        },
    ],
});
const findSwitches = () =>
    screen.findAllByRole('switch', { name: requiredIdentityLabel });

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
        vi.mocked(lightdashApi).mockResolvedValue(overview());
    });
    it('shows two warehouse rows with shared copy and no status badges', async () => {
        const { container } = renderSection();
        expect(await screen.findAllByRole('combobox')).toHaveLength(2);
        expect(await findSwitches()).toHaveLength(2);
        expect(
            screen.getByRole('combobox', { name: 'Snowflake agent identity' }),
        ).toHaveValue(identityLabels.agent_sign_in.label);
        expect(
            screen.getByRole('combobox', { name: 'BigQuery agent identity' }),
        ).toHaveValue(identityLabels.ai_service_account.label);
        expect(
            screen.getByText(identityLabels.agent_sign_in.helper),
        ).toBeInTheDocument();
        expect(
            screen.getByText(identityLabels.ai_service_account.helper),
        ).toBeInTheDocument();
        expect(container.querySelector('.mantine-Badge-root')).toBeNull();
        expect(
            screen.queryByText(
                /Postgres|Databricks|marked_person|ai_service_account|agent_sign_in/,
            ),
        ).not.toBeInTheDocument();
    });
    it.each([0, 1])(
        'saves the source and requirement for row %s',
        async (row) => {
            const { invalidate } = renderSection();
            fireEvent.click((await findSwitches())[row]);
            const rule = overview().rules[row];
            await waitFor(() =>
                expect(lightdashApi).toHaveBeenCalledWith({
                    version: 'v2',
                    url: `/org/agent-identity/${rule.warehouseType}`,
                    method: 'PUT',
                    body: JSON.stringify({
                        source: rule.source,
                        required: true,
                    }),
                }),
            );
            await waitFor(() =>
                expect(mocks.toast).toHaveBeenCalledWith({
                    title: 'Agent identity saved.',
                }),
            );
            expect(invalidate).toHaveBeenCalledWith(['ai-access']);
        },
    );
    it.each([
        ['Snowflake', 'snowflake'],
        ['BigQuery', 'bigquery'],
    ] as const)(
        'clears Required when %s moves to the same credentials as the user',
        async (name, warehouseType) => {
            const source = 'marked_person';
            vi.mocked(lightdashApi).mockResolvedValue(overview(true));
            renderSection();
            fireEvent.click(
                await screen.findByRole('combobox', {
                    name: `${name} agent identity`,
                }),
            );
            fireEvent.click(
                screen.getByRole('option', {
                    name: identityLabels[source].label,
                }),
            );
            await waitFor(() =>
                expect(lightdashApi).toHaveBeenCalledWith({
                    version: 'v2',
                    url: `/org/agent-identity/${warehouseType}`,
                    method: 'PUT',
                    body: JSON.stringify({ source, required: false }),
                }),
            );
        },
    );
    it('keeps Required when a row moves to another separate identity', async () => {
        vi.mocked(lightdashApi).mockResolvedValue({
            requireVerifiedAgentSessions: false,
            rules: [
                {
                    warehouseType: WarehouseTypes.BIGQUERY,
                    source: 'marked_person',
                    required: false,
                },
            ],
        });
        renderSection();
        expect(await findSwitches()).toHaveLength(1);
        expect((await findSwitches())[0]).toBeDisabled();
        fireEvent.click(
            screen.getByRole('combobox', { name: 'BigQuery agent identity' }),
        );
        fireEvent.click(
            screen.getByRole('option', {
                name: identityLabels.ai_service_account.label,
            }),
        );
        await waitFor(() =>
            expect(lightdashApi).toHaveBeenCalledWith({
                version: 'v2',
                url: '/org/agent-identity/bigquery',
                method: 'PUT',
                body: JSON.stringify({
                    source: 'ai_service_account',
                    required: false,
                }),
            }),
        );
    });
    it('disables agent sign-in only when the integration is unavailable and keeps setup', async () => {
        mocks.configured = false;
        renderSection();
        fireEvent.click(
            await screen.findByRole('combobox', {
                name: 'Snowflake agent identity',
            }),
        );
        expect(
            screen.getByRole('option', {
                name: identityLabels.agent_sign_in.label,
            }),
        ).toHaveAttribute('data-combobox-disabled', 'true');
        expect((await findSwitches())[0]).toBeEnabled();
        expect(
            screen.getByText(
                'Agent sign-in needs the Snowflake agent integration.',
            ),
        ).toBeInTheDocument();
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
    });
    it('disables both controls in the saving row', async () => {
        renderSection();
        const [toggle] = await findSwitches();
        vi.mocked(lightdashApi).mockImplementation(() => new Promise(() => {}));
        fireEvent.click(toggle);
        await waitFor(() => expect(toggle).toBeDisabled());
        expect(
            screen.getByRole('combobox', { name: 'Snowflake agent identity' }),
        ).toBeDisabled();
        expect(
            screen.getByRole('combobox', { name: 'BigQuery agent identity' }),
        ).toBeEnabled();
    });
    it('waits for settings to load', () => {
        vi.mocked(lightdashApi).mockImplementation(() => new Promise(() => {}));
        renderSection();
        expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    });
    it('allows retry after a load failure', async () => {
        vi.mocked(lightdashApi).mockRejectedValue({
            error: { message: 'Unavailable' },
        });
        renderSection();
        expect(
            await screen.findByText('Could not load agent identity settings.'),
        ).toBeInTheDocument();
        vi.mocked(lightdashApi).mockResolvedValue(overview(true));
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect((await findSwitches())[0]).toBeChecked();
    });
    it('reports failed saves and preserves the value', async () => {
        renderSection();
        const [toggle] = await findSwitches();
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
