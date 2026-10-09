import {
    type OrganizationAgentIdentitySnowflakeSetup,
    type OrganizationAgentIdentitySnowflakeVerify,
} from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../api';
import { renderWithProviders } from '../../testing/testUtils';
import { SnowflakeAgentSetup } from './SnowflakeAgentSetup';

const mocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('../../api', () => ({ lightdashApi: vi.fn() }));
vi.mock('../../providers/App/useApp', () => ({
    default: () => ({
        health: { data: { rudder: {} } },
        user: { data: { organizationUuid: 'org' } },
    }),
}));
vi.mock('../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: true } }),
}));
vi.mock('../../hooks/toaster/useToaster', () => ({
    default: () => ({
        showToastSuccess: mocks.success,
        showToastApiError: mocks.error,
    }),
}));
vi.mock('../../components/common/CodeBlock/CodeBlock', () => ({
    default: () => null,
}));

const request = {
    accountUrl: 'https://myorg-myaccount.snowflakecomputing.com',
    clientId: 'test-client',
    clientSecret: 'test-only-secret',
};
const savedClient: OrganizationAgentIdentitySnowflakeSetup['client'] = {
    source: 'organization',
    accountUrl: request.accountUrl,
    clientId: request.clientId,
    hasClientSecret: true,
    updatedAt: new Date(),
};
let setup: OrganizationAgentIdentitySnowflakeSetup;
const verified: OrganizationAgentIdentitySnowflakeVerify = {
    checkedAt: new Date(),
    passed: true,
    checks: [
        {
            id: 'oauth_client',
            label: 'OAuth client settings',
            required: true,
            status: 'passed',
            detail: 'Previous verification passed.',
        },
    ],
};
const renderSetup = (active = false) => {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    renderWithProviders(
        <QueryClientProvider client={client}>
            {active ? (
                <SnowflakeAgentSetup mode="active" />
            ) : (
                <SnowflakeAgentSetup
                    mode="pending"
                    saving={false}
                    onCancel={vi.fn()}
                    onTurnOn={vi.fn()}
                />
            )}
        </QueryClientProvider>,
    );
    return { client, invalidate };
};
const fillForm = async () => {
    fireEvent.change(await screen.findByLabelText('Snowflake account URL'), {
        target: { value: request.accountUrl },
    });
    fireEvent.change(screen.getByLabelText('Client ID'), {
        target: { value: request.clientId },
    });
    fireEvent.change(screen.getByLabelText('Client secret'), {
        target: { value: request.clientSecret },
    });
};
const expandSetup = async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'View setup' }));
};

describe('SnowflakeAgentSetup client', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setup = {
            client: {
                source: null,
                accountUrl: null,
                clientId: null,
                hasClientSecret: false,
                updatedAt: null,
            },
            configured: false,
            missingSettings: [],
            redirectUri:
                'https://instance.example/api/v1/oauth/redirect/snowflake-ai',
            integrationSql: 'CREATE SECURITY INTEGRATION test;',
        };
        vi.mocked(lightdashApi).mockImplementation(async ({ url, method }) => {
            if (url.endsWith('/verify')) return verified;
            if (method === 'PUT') {
                setup = { ...setup, configured: true, client: savedClient };
            }
            return setup;
        });
    });
    it('shows an empty form, the agreed hints and the persistent footnote', async () => {
        renderSetup();
        expect(
            await screen.findByLabelText('Snowflake account URL'),
        ).toHaveValue('');
        expect(screen.getByLabelText('Client ID')).toHaveValue('');
        expect(screen.getByLabelText('Client secret')).toHaveValue('');
        expect(screen.getByLabelText('Client secret')).toHaveAttribute(
            'type',
            'password',
        );
        expect(
            screen.getByText('Paste what Snowflake returned'),
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                'We work out the sign-in and token addresses from this.',
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                'Stored encrypted for your organisation. Only organisation admins can replace it; it is never shown again.',
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                'Instances with SNOWFLAKE_AI_OAUTH_* variables keep working. A client saved here overrides them for this organisation.',
            ),
        ).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
        fireEvent.change(screen.getByLabelText('Snowflake account URL'), {
            target: { value: request.accountUrl },
        });
        fireEvent.change(screen.getByLabelText('Client ID'), {
            target: { value: request.clientId },
        });
        expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
        fireEvent.change(screen.getByLabelText('Client secret'), {
            target: { value: '   ' },
        });
        expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
        fireEvent.change(screen.getByLabelText('Client secret'), {
            target: { value: request.clientSecret },
        });
        expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    });
    it('saves the exact sensitive body, caches only metadata and requires fresh verification', async () => {
        const { client, invalidate } = renderSetup();
        fireEvent.click(
            await screen.findByRole('button', { name: 'Verify integration' }),
        );
        await screen.findByText('Previous verification passed.');
        expect(screen.getByRole('button', { name: 'Turn on' })).toBeEnabled();
        await fillForm();
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        await screen.findByText('Client secret saved');
        expect(lightdashApi).toHaveBeenCalledWith({
            version: 'v2',
            url: '/org/agent-identity/snowflake/client',
            method: 'PUT',
            body: JSON.stringify(request),
            sensitive: true,
        });
        expect(mocks.success).toHaveBeenCalledWith({
            title: 'Snowflake client saved.',
        });
        expect(invalidate).toHaveBeenCalledWith([
            'ai-access',
            'org',
            'agent-identity',
        ]);
        expect(
            client.getQueryData(['ai-access', 'org', 'org', 'snowflake-setup']),
        ).toEqual(setup);
        expect(JSON.stringify(client.getQueriesData([]))).not.toContain(
            request.clientSecret,
        );
        expect(
            screen.queryByText('Previous verification passed.'),
        ).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Turn on' })).toBeDisabled();
        expect(
            screen.queryByLabelText('Client secret'),
        ).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Replace client' }));
        expect(screen.getByLabelText('Client secret')).toHaveValue('');
        fireEvent.click(
            screen.getByRole('button', { name: 'Verify integration' }),
        );
        await waitFor(() =>
            expect(
                screen.getByRole('button', { name: 'Turn on' }),
            ).toBeEnabled(),
        );
    });
    it('shows saved metadata and clears a replacement secret on cancel', async () => {
        setup = { ...setup, configured: true, client: savedClient };
        renderSetup(true);
        await expandSetup();
        expect(
            await screen.findByLabelText('Snowflake account URL'),
        ).toHaveAttribute('readonly');
        expect(screen.getByLabelText('Client ID')).toHaveAttribute('readonly');
        expect(screen.getByText('Client secret saved')).toBeInTheDocument();
        expect(
            screen.queryByLabelText('Client secret'),
        ).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Replace client' }));
        expect(screen.getByLabelText('Snowflake account URL')).toHaveValue(
            request.accountUrl,
        );
        expect(screen.getByLabelText('Client ID')).toHaveValue(
            request.clientId,
        );
        expect(screen.getByLabelText('Client secret')).toHaveValue('');
        expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
        fireEvent.change(screen.getByLabelText('Client secret'), {
            target: { value: request.clientSecret },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(screen.getByText('Client secret saved')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Replace client' }));
        expect(screen.getByLabelText('Client secret')).toHaveValue('');
        expect(lightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({ method: 'PUT' }),
        );
    });
    it('asks for a replacement when the stored secret is unreadable', async () => {
        setup.client = { ...savedClient, hasClientSecret: false };
        renderSetup();
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'The saved client secret could not be read. Replace it to use agent sign-in.',
        );
        expect(screen.getByLabelText('Snowflake account URL')).toHaveValue(
            request.accountUrl,
        );
        expect(screen.getByLabelText('Client secret')).toHaveValue('');
        expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });
    it('shows an empty form and a note for an environment client', async () => {
        setup = {
            ...setup,
            configured: true,
            client: { ...savedClient, source: 'environment' },
        };
        renderSetup(true);
        await expandSetup();
        expect(
            await screen.findByText(
                'This instance currently uses its SNOWFLAKE_AI_OAUTH_* settings.',
            ),
        ).toBeInTheDocument();
        expect(screen.getByLabelText('Snowflake account URL')).toHaveValue('');
        expect(screen.getByLabelText('Client ID')).toHaveValue('');
        expect(screen.getByLabelText('Client secret')).toHaveValue('');
    });
    it('shows the server validation error and keeps the form available for correction', async () => {
        renderSetup();
        await fillForm();
        vi.mocked(lightdashApi).mockRejectedValueOnce({
            error: {
                name: 'ParameterError',
                message: 'The account URL must use HTTPS.',
                statusCode: 400,
            },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'The account URL must use HTTPS.',
        );
        expect(mocks.error).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
        expect(mocks.success).not.toHaveBeenCalled();
    });
    it('disables inputs and duplicate saves while saving', async () => {
        renderSetup();
        await fillForm();
        vi.mocked(lightdashApi).mockImplementationOnce(
            () => new Promise(() => {}),
        );
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() =>
            expect(screen.getByLabelText('Client secret')).toBeDisabled(),
        );
        expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });
});
