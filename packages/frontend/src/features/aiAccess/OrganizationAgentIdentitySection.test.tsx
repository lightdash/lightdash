import {
    WarehouseTypes,
    type OrganizationAgentIdentitySnowflakeVerify,
    type OrganizationAgentIdentityOverview,
} from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
    act,
    fireEvent,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../api';
import settingsClasses from '../../components/common/Settings/SettingsCard.module.css';
import { renderWithProviders } from '../../testing/testUtils';
import { identityLabels } from './identityLabels';
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
vi.mock('../../hooks/settings/useSettingsContext', () => ({
    useSettingsContext: () => ({ showMyAgentConnections: true }),
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
        user: {
            data: {
                organizationUuid: 'org',
                ability: { can: () => mocks.canManage },
            },
        },
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
    default: ({
        code,
        copyLabel,
        onCopy,
    }: {
        code: string;
        copyLabel: string;
        onCopy: () => void;
    }) => (
        <>
            <pre>{code}</pre>
            <button onClick={onCopy}>{copyLabel}</button>
        </>
    ),
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
    return { client, invalidate, container: document.body };
};
const overview = (): OrganizationAgentIdentityOverview => ({
    snowflakeConfigured: true,
    requireVerifiedAgentSessions: false,
    rules: [
        {
            warehouseType: WarehouseTypes.SNOWFLAKE,
            source: 'agent_sign_in',
            projectsMissingAiServiceAccount: null,
        },
        {
            warehouseType: WarehouseTypes.BIGQUERY,
            source: 'ai_service_account',
            projectsMissingAiServiceAccount: null,
        },
    ],
});
let currentOverview = overview();
let missingProjects: { projectUuid: string; name: string }[] = [];
const backendSql = 'CREATE SECURITY INTEGRATION BACKEND_PROVIDED;';
let verification: OrganizationAgentIdentitySnowflakeVerify;
const apiHandler = async ({
    url,
    method,
    body,
}: Parameters<typeof lightdashApi>[0]) => {
    if (url.endsWith('/projects-without-ai-service-account'))
        return missingProjects;
    if (url.endsWith('/setup'))
        return {
            redirectUri:
                'https://backend.example/api/v1/oauth/redirect/snowflake-ai',
            integrationSql: backendSql,
            client: {
                source: mocks.configured ? ('organization' as const) : null,
                accountUrl: null,
                clientId: null,
                hasClientSecret: mocks.configured,
                updatedAt: null,
            },
            configured: mocks.configured,
            missingSettings: mocks.configured ? [] : ['Snowflake OAuth client'],
        };
    if (url.endsWith('/verify')) return verification;
    if (method === 'PUT') {
        const rule = currentOverview.rules.find(({ warehouseType }) =>
            url.endsWith(`/${warehouseType}`),
        )!;
        try {
            if (typeof body !== 'string')
                throw new Error('Expected a JSON body');
            rule.source = JSON.parse(body).source;
        } catch {
            throw new Error('Invalid test request');
        }
        return rule;
    }
    return currentOverview;
};
const selectAgentSignIn = async () => {
    fireEvent.click(
        await screen.findByRole('combobox', {
            name: 'Snowflake agent identity',
        }),
    );
    fireEvent.click(
        screen.getByRole('option', {
            name: /The person's agent sign-in/,
        }),
    );
};
const startUnconfigured = () => {
    mocks.configured = false;
    currentOverview.snowflakeConfigured = false;
    currentOverview.rules[0].source = 'marked_person';
    return renderSection();
};
const changeToMarkedPerson = async (name: string) => {
    fireEvent.click(
        await screen.findByRole('combobox', { name: `${name} agent identity` }),
    );
    fireEvent.click(
        screen.getByRole('option', {
            name: identityLabels.marked_person.label,
        }),
    );
};

const chooseServiceAccount = async (warehouseName = 'BigQuery') => {
    fireEvent.click(
        await screen.findByRole('combobox', {
            name: `${warehouseName} agent identity`,
        }),
    );
    fireEvent.click(
        screen.getByRole('option', {
            name: identityLabels.ai_service_account.label,
        }),
    );
};

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
        currentOverview = overview();
        missingProjects = [];
        verification = {
            checkedAt: new Date(),
            passed: true,
            checks: [
                {
                    id: 'oauth_client',
                    label: 'OAuth client settings',
                    required: true,
                    status: 'passed',
                    detail: 'All OAuth client settings are set.',
                },
                {
                    id: 'authorize_endpoint',
                    label: 'Authorization endpoint',
                    required: true,
                    status: 'passed',
                    detail: "Snowflake's sign-in page responded.",
                },
                {
                    id: 'agent_session',
                    label: 'Agent session',
                    required: false,
                    status: 'not_checked',
                    detail: 'No one has connected their agent yet.',
                },
            ],
        };
        vi.mocked(lightdashApi).mockImplementation(apiHandler);
    });
    it('shows two warehouse rows with shared copy and no switch or status badges', async () => {
        const { container } = renderSection();
        expect(await screen.findAllByRole('combobox')).toHaveLength(2);
        expect(screen.queryByRole('switch')).not.toBeInTheDocument();
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
    it('uses the settings grid for warehouse labels and equal-width controls', async () => {
        currentOverview.rules.push({
            warehouseType: WarehouseTypes.DATABRICKS,
            source: 'marked_person',
            projectsMissingAiServiceAccount: null,
        });
        const { container } = renderSection();
        expect(await screen.findAllByRole('combobox')).toHaveLength(3);
        expect(
            screen.getByText('Choose who agents run as on each warehouse.'),
        ).toBeInTheDocument();
        for (const [warehouseType, warehouseName] of [
            [WarehouseTypes.SNOWFLAKE, 'Snowflake'],
            [WarehouseTypes.BIGQUERY, 'BigQuery'],
            [WarehouseTypes.DATABRICKS, 'Databricks'],
        ]) {
            const row = screen.getByTestId(
                `${warehouseType}-agent-identity-rule`,
            );
            expect(row).toHaveClass(settingsClasses.settingsGrid);
            expect(row.children).toHaveLength(2);
            const [labelColumn, controlColumn] = Array.from(row.children);
            expect(
                within(labelColumn as HTMLElement).getByText(warehouseName),
            ).toBeVisible();
            const select = within(controlColumn as HTMLElement).getByRole(
                'combobox',
                {
                    name: `${warehouseName} agent identity`,
                },
            );
            expect(select.closest('.mantine-Select-root')).toHaveStyle({
                width: 'calc(21.25rem * var(--mantine-scale))',
            });
        }
        for (const helper of [
            "Agents get the access of the person asking. Their queries are labelled, but warehouse rules can't act on the label.",
            'Each person signs in to Snowflake once for their agent. Snowflake marks these sessions, so your policies can limit them.',
            'A project admin adds one account to each project. All agents run as it and get only its access.',
        ]) {
            expect(screen.getByText(helper)).toBeVisible();
        }
        expect(
            screen.queryByText(/When AI agents query/),
        ).not.toBeInTheDocument();
        expect(container).not.toHaveTextContent(/organisation/i);
    });
    it('uses organization spelling in the expanded Snowflake setup', async () => {
        mocks.configured = false;
        renderSection();
        fireEvent.click(
            await screen.findByRole('button', { name: 'View setup' }),
        );
        expect(
            await screen.findByLabelText('Client secret'),
        ).toBeInTheDocument();
        expect(document.body).toHaveTextContent(
            'Stored encrypted for your organization. Only organization admins can replace it; it is never shown again.',
        );
        expect(document.body).not.toHaveTextContent(/organisation/i);
    });
    it.each([
        ['Snowflake', 'snowflake'],
        ['BigQuery', 'bigquery'],
    ])('saves only the source for %s', async (name, warehouseType) => {
        const { invalidate } = renderSection();
        await changeToMarkedPerson(name);
        expect(await screen.findByRole('dialog')).toHaveTextContent(
            `Run agents as the person on ${name}?`,
        );
        expect(screen.getByRole('dialog')).toHaveTextContent(
            `Agents will get the same ${name} access as the person asking. Your warehouse can't limit agent queries separately.`,
        );
        expect(lightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({ method: 'PUT' }),
        );
        expect(lightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({
                url: expect.stringContaining(
                    '/projects-without-ai-service-account',
                ),
            }),
        );
        fireEvent.click(
            screen.getByRole('button', {
                name: 'Run as the person',
            }),
        );
        await waitFor(() =>
            expect(lightdashApi).toHaveBeenCalledWith({
                version: 'v2',
                url: `/org/agent-identity/${warehouseType}`,
                method: 'PUT',
                body: JSON.stringify({ source: 'marked_person' }),
            }),
        );
        await waitFor(() =>
            expect(mocks.toast).toHaveBeenCalledWith({
                title: 'Agent identity saved.',
            }),
        );
        expect(invalidate).toHaveBeenCalledWith(['ai-access']);
    });
    it('confirms the AI service account before sending exactly one PUT', async () => {
        const data = overview();
        data.rules[1].source = 'marked_person';
        currentOverview = data;
        renderSection();
        fireEvent.click(
            await screen.findByRole('combobox', {
                name: 'BigQuery agent identity',
            }),
        );
        fireEvent.click(
            screen.getByRole('option', {
                name: identityLabels.ai_service_account.label,
            }),
        );
        expect(await screen.findByRole('dialog')).toHaveTextContent(
            'Use a shared agent account for BigQuery?',
        );
        expect(screen.getByRole('dialog')).toHaveTextContent(
            "Agents on BigQuery will run as each project's shared agent account, not as the person asking.",
        );
        expect(lightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({ method: 'PUT' }),
        );
        expect(
            screen.getByRole('combobox', {
                name: 'BigQuery agent identity',
            }),
        ).toHaveValue(identityLabels.marked_person.label);
        const confirm = screen.getByRole('button', {
            name: 'Use a shared agent account',
        });
        await waitFor(() => expect(confirm).toBeEnabled());
        fireEvent.click(confirm);
        await waitFor(() =>
            expect(lightdashApi).toHaveBeenCalledWith({
                version: 'v2',
                url: '/org/agent-identity/bigquery',
                method: 'PUT',
                body: JSON.stringify({ source: 'ai_service_account' }),
            }),
        );
        await waitFor(() =>
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
        );
        expect(
            vi
                .mocked(lightdashApi)
                .mock.calls.filter(([request]) => request.method === 'PUT'),
        ).toHaveLength(1);
    });
    it.each([1, 2, 5])(
        'lists %s affected projects before saving',
        async (count) => {
            missingProjects = Array.from({ length: count }, (_, index) => ({
                projectUuid: `project-${index}`,
                name: `Project ${index}`,
            }));
            currentOverview.rules[1].source = 'marked_person';
            renderSection();
            await chooseServiceAccount();
            const alert = await screen.findByRole('alert');
            expect(alert).toHaveTextContent(
                `${count} ${count === 1 ? 'project has' : 'projects have'} no shared agent account yet:`,
            );
            expect(alert).toHaveTextContent(
                `Agents stop working on ${count === 1 ? 'it' : 'them'} until a project admin adds one.`,
            );
            const links = within(alert).getAllByRole('link');
            expect(links).toHaveLength(Math.min(count, 3));
            links.forEach((link, index) => {
                expect(link).toHaveTextContent(`Project ${index}`);
                expect(link).toHaveAttribute(
                    'href',
                    `/generalSettings/projectManagement/project-${index}/agentIdentity`,
                );
            });
            if (count > 3)
                expect(alert).toHaveTextContent(
                    'Project 0, Project 1, Project 2 and 2 more.',
                );
            expect(lightdashApi).toHaveBeenCalledWith({
                version: 'v2',
                url: '/org/agent-identity/bigquery/projects-without-ai-service-account',
                method: 'GET',
                body: undefined,
            });
            expect(lightdashApi).not.toHaveBeenCalledWith(
                expect.objectContaining({ method: 'PUT' }),
            );
        },
    );
    it.each(['Cancel', 'Close'])(
        'dismisses with %s without saving',
        async (name) => {
            currentOverview.rules[1].source = 'marked_person';
            renderSection();
            await chooseServiceAccount();
            fireEvent.click(await screen.findByRole('button', { name }));
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
            expect(
                screen.getByRole('combobox', {
                    name: 'BigQuery agent identity',
                }),
            ).toHaveValue(identityLabels.marked_person.label);
            expect(lightdashApi).not.toHaveBeenCalledWith(
                expect.objectContaining({ method: 'PUT' }),
            );
        },
    );
    it('waits for the affected-project read before allowing confirmation', async () => {
        vi.mocked(lightdashApi).mockImplementation((request) =>
            request.url.endsWith('/projects-without-ai-service-account')
                ? new Promise(() => {})
                : apiHandler(request),
        );
        currentOverview.rules[1].source = 'marked_person';
        renderSection();
        await chooseServiceAccount();
        expect(
            await screen.findByLabelText('Checking shared agent accounts'),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Use a shared agent account' }),
        ).toBeDisabled();
    });
    it('requires a successful retry before confirming after the affected-project read fails', async () => {
        const readProjects = vi
            .fn()
            .mockRejectedValueOnce({ error: { message: 'Read failed' } })
            .mockResolvedValueOnce([
                { projectUuid: 'missing-project', name: 'Missing project' },
            ]);
        vi.mocked(lightdashApi).mockImplementation((request) =>
            request.url.endsWith('/projects-without-ai-service-account')
                ? readProjects()
                : apiHandler(request),
        );
        currentOverview.rules[1].source = 'marked_person';
        renderSection();
        await chooseServiceAccount();
        expect(
            await screen.findByText(
                'Could not check which projects have a shared agent account.',
            ),
        ).toBeInTheDocument();
        const confirm = screen.getByRole('button', {
            name: 'Use a shared agent account',
        });
        expect(confirm).toBeDisabled();
        expect(readProjects).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(await screen.findByRole('alert')).toHaveTextContent(
            '1 project has no shared agent account yet: Missing project.',
        );
        expect(readProjects).toHaveBeenCalledTimes(2);
        expect(confirm).toBeEnabled();
        expect(lightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({ method: 'PUT' }),
        );
    });
    it('keeps the modal open and prevents duplicate confirmation while saving', async () => {
        vi.mocked(lightdashApi).mockImplementation((request) =>
            request.method === 'PUT'
                ? new Promise(() => {})
                : apiHandler(request),
        );
        renderSection();
        await changeToMarkedPerson('BigQuery');
        const confirm = await screen.findByRole('button', {
            name: 'Run as the person',
        });
        fireEvent.click(confirm);
        await waitFor(() =>
            expect(confirm).toHaveAttribute('data-loading', 'true'),
        );
        fireEvent.click(confirm);
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(
            vi
                .mocked(lightdashApi)
                .mock.calls.filter(([request]) => request.method === 'PUT'),
        ).toHaveLength(1);
    });
    it('keeps the modal open after a save error', async () => {
        vi.mocked(lightdashApi).mockImplementation((request) =>
            request.method === 'PUT'
                ? Promise.reject({ error: { message: 'Save failed' } })
                : apiHandler(request),
        );
        renderSection();
        await changeToMarkedPerson('BigQuery');
        fireEvent.click(
            await screen.findByRole('button', {
                name: 'Run as the person',
            }),
        );
        await waitFor(() => expect(mocks.errorToast).toHaveBeenCalled());
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(
            screen.getByRole('button', {
                name: 'Run as the person',
            }),
        ).toBeEnabled();
        expect(
            screen.getByRole('combobox', { name: 'BigQuery agent identity' }),
        ).toHaveValue(identityLabels.ai_service_account.label);
    });
    it('offers the Databricks AI service account rule without per-person sign-in', async () => {
        currentOverview.rules.push({
            warehouseType: WarehouseTypes.DATABRICKS,
            source: 'marked_person',
            projectsMissingAiServiceAccount: null,
        });
        renderSection();
        fireEvent.click(
            await screen.findByRole('combobox', {
                name: 'Databricks agent identity',
            }),
        );
        expect(
            screen.queryByRole('option', {
                name: /The person's agent sign-in/,
            }),
        ).not.toBeInTheDocument();
        fireEvent.click(
            screen.getByRole('option', {
                name: identityLabels.ai_service_account.label,
            }),
        );
        expect(await screen.findByRole('dialog')).toHaveTextContent(
            'Use a shared agent account for Databricks?',
        );
        const confirm = screen.getByRole('button', {
            name: 'Use a shared agent account',
        });
        await waitFor(() => expect(confirm).toBeEnabled());
        fireEvent.click(confirm);
        await waitFor(() =>
            expect(lightdashApi).toHaveBeenCalledWith({
                version: 'v2',
                url: '/org/agent-identity/databricks',
                method: 'PUT',
                body: JSON.stringify({ source: 'ai_service_account' }),
            }),
        );
    });
    it('offers the Athena AI service account rule without per-person sign-in', async () => {
        currentOverview.rules.push({
            warehouseType: WarehouseTypes.ATHENA,
            source: 'marked_person',
            projectsMissingAiServiceAccount: null,
        });
        missingProjects = [
            { projectUuid: 'athena-project', name: 'Athena reporting' },
        ];
        renderSection();
        fireEvent.click(
            await screen.findByRole('combobox', {
                name: 'Athena agent identity',
            }),
        );
        expect(
            screen.queryByRole('option', {
                name: /The person's agent sign-in/,
            }),
        ).not.toBeInTheDocument();
        fireEvent.click(
            screen.getByRole('option', {
                name: identityLabels.ai_service_account.label,
            }),
        );
        expect(await screen.findByRole('dialog')).toHaveTextContent(
            'Use a shared agent account for Athena?',
        );
        const confirm = screen.getByRole('button', {
            name: 'Use a shared agent account',
        });
        await waitFor(() => expect(confirm).toBeEnabled());
        expect(
            screen.getByRole('link', { name: 'Athena reporting' }),
        ).toHaveAttribute(
            'href',
            '/generalSettings/projectManagement/athena-project/agentIdentity',
        );
        expect(lightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({ method: 'PUT' }),
        );
        fireEvent.click(confirm);
        await waitFor(() =>
            expect(lightdashApi).toHaveBeenCalledWith({
                version: 'v2',
                url: '/org/agent-identity/athena',
                method: 'PUT',
                body: JSON.stringify({ source: 'ai_service_account' }),
            }),
        );
    });
    it('offers the Postgres AI service account rule without per-person sign-in', async () => {
        currentOverview.rules.push({
            warehouseType: WarehouseTypes.POSTGRES,
            source: 'marked_person',
            projectsMissingAiServiceAccount: null,
        });
        missingProjects = [
            { projectUuid: 'postgres-project', name: 'Postgres reporting' },
        ];
        renderSection();
        fireEvent.click(
            await screen.findByRole('combobox', {
                name: 'Postgres agent identity',
            }),
        );
        expect(
            screen.queryByRole('option', {
                name: /The person's agent sign-in/,
            }),
        ).not.toBeInTheDocument();
        fireEvent.click(
            screen.getByRole('option', {
                name: identityLabels.ai_service_account.label,
            }),
        );
        expect(await screen.findByRole('dialog')).toHaveTextContent(
            'Use a shared agent account for Postgres?',
        );
        const confirm = screen.getByRole('button', {
            name: 'Use a shared agent account',
        });
        await waitFor(() => expect(confirm).toBeEnabled());
        expect(
            screen.getByRole('link', { name: 'Postgres reporting' }),
        ).toHaveAttribute(
            'href',
            '/generalSettings/projectManagement/postgres-project/agentIdentity',
        );
        expect(lightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({ method: 'PUT' }),
        );
        fireEvent.click(confirm);
        await waitFor(() =>
            expect(lightdashApi).toHaveBeenCalledWith({
                version: 'v2',
                url: '/org/agent-identity/postgres',
                method: 'PUT',
                body: JSON.stringify({ source: 'ai_service_account' }),
            }),
        );
    });
    it('offers the Redshift AI service account rule without per-person sign-in', async () => {
        currentOverview.rules.push({
            warehouseType: WarehouseTypes.REDSHIFT,
            source: 'marked_person',
            projectsMissingAiServiceAccount: null,
        });
        missingProjects = [
            { projectUuid: 'redshift-project', name: 'Redshift reporting' },
        ];
        renderSection();
        fireEvent.click(
            await screen.findByRole('combobox', {
                name: 'Redshift agent identity',
            }),
        );
        expect(
            screen.queryByRole('option', {
                name: /The person's agent sign-in/,
            }),
        ).not.toBeInTheDocument();
        fireEvent.click(
            screen.getByRole('option', {
                name: identityLabels.ai_service_account.label,
            }),
        );
        expect(await screen.findByRole('dialog')).toHaveTextContent(
            'Use a shared agent account for Redshift?',
        );
        const confirm = screen.getByRole('button', {
            name: 'Use a shared agent account',
        });
        await waitFor(() => expect(confirm).toBeEnabled());
        expect(
            screen.getByRole('link', { name: 'Redshift reporting' }),
        ).toHaveAttribute(
            'href',
            '/generalSettings/projectManagement/redshift-project/agentIdentity',
        );
        expect(lightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({ method: 'PUT' }),
        );
        fireEvent.click(confirm);
        await waitFor(() =>
            expect(lightdashApi).toHaveBeenCalledWith({
                version: 'v2',
                url: '/org/agent-identity/redshift',
                method: 'PUT',
                body: JSON.stringify({ source: 'ai_service_account' }),
            }),
        );
    });
    it('offers the Trino AI service account rule without per-person sign-in', async () => {
        currentOverview.rules.push({
            warehouseType: WarehouseTypes.TRINO,
            source: 'marked_person',
            projectsMissingAiServiceAccount: null,
        });
        missingProjects = [
            { projectUuid: 'trino-project', name: 'Trino reporting' },
        ];
        renderSection();
        fireEvent.click(
            await screen.findByRole('combobox', {
                name: 'Trino agent identity',
            }),
        );
        expect(
            screen.queryByRole('option', {
                name: /The person's agent sign-in/,
            }),
        ).not.toBeInTheDocument();
        fireEvent.click(
            screen.getByRole('option', {
                name: identityLabels.ai_service_account.label,
            }),
        );
        expect(await screen.findByRole('dialog')).toHaveTextContent(
            'Use a shared agent account for Trino?',
        );
        const confirm = screen.getByRole('button', {
            name: 'Use a shared agent account',
        });
        await waitFor(() => expect(confirm).toBeEnabled());
        expect(
            screen.getByRole('link', { name: 'Trino reporting' }),
        ).toHaveAttribute(
            'href',
            '/generalSettings/projectManagement/trino-project/agentIdentity',
        );
        expect(lightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({ method: 'PUT' }),
        );
        fireEvent.click(confirm);
        await waitFor(() =>
            expect(lightdashApi).toHaveBeenCalledWith({
                version: 'v2',
                url: '/org/agent-identity/trino',
                method: 'PUT',
                body: JSON.stringify({ source: 'ai_service_account' }),
            }),
        );
    });
    it('offers the ClickHouse AI service account rule without per-person sign-in', async () => {
        currentOverview.rules.push({
            warehouseType: WarehouseTypes.CLICKHOUSE,
            source: 'marked_person',
            projectsMissingAiServiceAccount: null,
        });
        missingProjects = [
            { projectUuid: 'clickhouse-project', name: 'ClickHouse reporting' },
        ];
        renderSection();
        fireEvent.click(
            await screen.findByRole('combobox', {
                name: 'ClickHouse agent identity',
            }),
        );
        expect(
            screen.queryByRole('option', {
                name: /The person's agent sign-in/,
            }),
        ).not.toBeInTheDocument();
        expect(screen.getAllByRole('option')).toHaveLength(2);
        fireEvent.click(
            screen.getByRole('option', {
                name: identityLabels.ai_service_account.label,
            }),
        );
        expect(await screen.findByRole('dialog')).toHaveTextContent(
            'Use a shared agent account for ClickHouse?',
        );
        const confirm = screen.getByRole('button', {
            name: 'Use a shared agent account',
        });
        await waitFor(() => expect(confirm).toBeEnabled());
        expect(
            screen.getByRole('link', { name: 'ClickHouse reporting' }),
        ).toHaveAttribute(
            'href',
            '/generalSettings/projectManagement/clickhouse-project/agentIdentity',
        );
        expect(lightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({ method: 'PUT' }),
        );
        fireEvent.click(confirm);
        await waitFor(() =>
            expect(lightdashApi).toHaveBeenCalledWith({
                version: 'v2',
                url: '/org/agent-identity/clickhouse',
                method: 'PUT',
                body: JSON.stringify({ source: 'ai_service_account' }),
            }),
        );
        await waitFor(() =>
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
        );
        expect(
            screen.getByRole('combobox', { name: 'ClickHouse agent identity' }),
        ).toHaveValue(identityLabels.ai_service_account.label);
    });
    describe('ClickHouse rule visibility and failures', () => {
        beforeEach(() => {
            currentOverview.rules.push({
                warehouseType: WarehouseTypes.CLICKHOUSE,
                source: 'marked_person',
                projectsMissingAiServiceAccount: null,
            });
        });
        it.each(['flag', 'permission'])('hides controls for %s', (reason) => {
            mocks.enabled = reason !== 'flag';
            mocks.canManage = reason !== 'permission';
            renderSection();
            expect(
                screen.queryByRole('combobox', {
                    name: 'ClickHouse agent identity',
                }),
            ).not.toBeInTheDocument();
            expect(lightdashApi).not.toHaveBeenCalled();
        });
        it('keeps the previous ClickHouse rule when saving fails', async () => {
            vi.mocked(lightdashApi).mockImplementation((request) =>
                request.method === 'PUT'
                    ? Promise.reject({ error: { message: 'Save failed' } })
                    : apiHandler(request),
            );
            renderSection();
            fireEvent.click(
                await screen.findByRole('combobox', {
                    name: 'ClickHouse agent identity',
                }),
            );
            fireEvent.click(
                screen.getByRole('option', {
                    name: identityLabels.ai_service_account.label,
                }),
            );
            const confirm = await screen.findByRole('button', {
                name: 'Use a shared agent account',
            });
            await waitFor(() => expect(confirm).toBeEnabled());
            fireEvent.click(confirm);
            await waitFor(() => expect(mocks.errorToast).toHaveBeenCalled());
            expect(screen.getByRole('dialog')).toBeVisible();
            expect(
                screen.getByRole('combobox', {
                    name: 'ClickHouse agent identity',
                }),
            ).toHaveValue(identityLabels.marked_person.label);
        });
    });
    it('shows no setup in the default state and enables the sign-in option with a hint', async () => {
        startUnconfigured();
        await screen.findAllByRole('combobox');
        expect(
            screen.queryByText('Set up the Snowflake agent integration'),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'View setup' }),
        ).not.toBeInTheDocument();
        expect(lightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({
                url: '/org/agent-identity/snowflake/setup',
            }),
        );
        fireEvent.click(
            screen.getByRole('combobox', { name: 'Snowflake agent identity' }),
        );
        const option = screen.getByRole('option', {
            name: /The person's agent sign-in Needs a one-time Snowflake setup/,
        });
        expect(option).not.toHaveAttribute('data-combobox-disabled', 'true');
    });
    it('keeps selection pending, renders backend SQL and enables Turn on only after verification passes', async () => {
        startUnconfigured();
        await selectAgentSignIn();
        expect(
            screen.getByRole('combobox', { name: 'Snowflake agent identity' }),
        ).toHaveValue(identityLabels.marked_person.label);
        expect(
            screen.getByText(
                'Not saved. Finish the setup below, then select Turn on.',
            ),
        ).toBeInTheDocument();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(
            await screen.findByText('Set up the Snowflake agent integration'),
        ).toBeInTheDocument();
        const title = screen.getByRole('heading', {
            name: 'Set up the Snowflake agent integration',
        });
        expect(
            within(title.parentElement!).getByText('Not active yet'),
        ).toBeInTheDocument();
        expect(
            screen.getAllByText(/Run this once in Snowflake as ACCOUNTADMIN/),
        ).toHaveLength(1);
        expect(screen.getByText(backendSql)).toBeInTheDocument();
        expect(
            screen.getByText('Copy and run in Snowflake'),
        ).toBeInTheDocument();
        expect(
            screen.getByText('Add your Snowflake account and client details'),
        ).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Turn on' })).toBeDisabled();
        expect(lightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({ method: 'PUT' }),
        );
        fireEvent.click(
            screen.getByRole('button', { name: 'Copy integration SQL' }),
        );
        expect(screen.queryByLabelText('Step 1 done')).not.toBeInTheDocument();
        verification = {
            ...verification,
            passed: false,
            checks: verification.checks.map((check) =>
                check.id === 'oauth_client'
                    ? {
                          ...check,
                          status: 'failed',
                          detail: 'Not saved. Paste the account URL, client ID and client secret from Snowflake in step 2, then verify again.',
                      }
                    : { ...check, status: 'not_checked' },
            ),
        };
        fireEvent.click(
            screen.getByRole('button', { name: 'Verify integration' }),
        );
        expect(
            await screen.findByText(
                'Not saved. Paste the account URL, client ID and client secret from Snowflake in step 2, then verify again.',
            ),
        ).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Turn on' })).toBeDisabled();
        verification = {
            ...verification,
            passed: true,
            checks: verification.checks.map((check) => ({
                ...check,
                status: 'passed',
            })),
        };
        fireEvent.click(
            screen.getByRole('button', { name: 'Verify integration' }),
        );
        await waitFor(() =>
            expect(
                screen.getByRole('button', { name: 'Turn on' }),
            ).toBeEnabled(),
        );
        fireEvent.click(screen.getByRole('button', { name: 'Turn on' }));
        await waitFor(() =>
            expect(lightdashApi).toHaveBeenCalledWith({
                version: 'v2',
                url: '/org/agent-identity/snowflake',
                method: 'PUT',
                body: JSON.stringify({ source: 'agent_sign_in' }),
            }),
        );
        await waitFor(() =>
            expect(
                screen.queryByText('Not active yet'),
            ).not.toBeInTheDocument(),
        );
    });
    it.each([false, true])(
        'uses organisation configuration (%s) even when health disagrees',
        async (configured) => {
            currentOverview.snowflakeConfigured = configured;
            mocks.configured = !configured;
            mocks.healthError = true;
            renderSection();
            fireEvent.click(
                await screen.findByRole('combobox', {
                    name: 'Snowflake agent identity',
                }),
            );
            expect(
                screen.queryByText('Needs a one-time Snowflake setup') !== null,
            ).toBe(!configured);
        },
    );
    it('resets pending setup when a refetch returns an active saved rule', async () => {
        const { client } = startUnconfigured();
        await selectAgentSignIn();
        fireEvent.click(
            await screen.findByRole('button', { name: 'Verify integration' }),
        );
        await waitFor(() =>
            expect(
                screen.getByRole('button', { name: 'Turn on' }),
            ).toBeEnabled(),
        );
        expect(screen.getByText('Not active yet')).toBeInTheDocument();
        currentOverview = {
            ...currentOverview,
            rules: currentOverview.rules.map((rule) =>
                rule.warehouseType === WarehouseTypes.SNOWFLAKE
                    ? { ...rule, source: 'agent_sign_in' }
                    : rule,
            ),
        };
        await act(async () => {
            await client.invalidateQueries(['ai-access']);
        });
        expect(
            await screen.findByText(
                /Verified · Snowflake agent integration · checked/,
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'View setup' }),
        ).toBeInTheDocument();
        expect(screen.queryByText('Not active yet')).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Turn on' }),
        ).not.toBeInTheDocument();
        currentOverview = {
            ...currentOverview,
            rules: currentOverview.rules.map((rule) =>
                rule.warehouseType === WarehouseTypes.SNOWFLAKE
                    ? { ...rule, source: 'marked_person' }
                    : rule,
            ),
        };
        await act(async () => {
            await client.invalidateQueries(['ai-access']);
        });
        await waitFor(() =>
            expect(
                screen.getByRole('combobox', {
                    name: 'Snowflake agent identity',
                }),
            ).toHaveValue(identityLabels.marked_person.label),
        );
        await selectAgentSignIn();
        expect(
            await screen.findByRole('button', { name: 'Turn on' }),
        ).toBeDisabled();
        expect(
            screen.queryByText("Snowflake's sign-in page responded."),
        ).not.toBeInTheDocument();
    });
    it('cancels pending Snowflake setup when the saved option is selected again', async () => {
        startUnconfigured();
        await selectAgentSignIn();
        expect(
            await screen.findByRole('heading', {
                name: 'Set up the Snowflake agent integration',
            }),
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                'Not saved. Finish the setup below, then select Turn on.',
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('combobox', { name: 'Snowflake agent identity' }),
        ).toHaveValue(identityLabels.marked_person.label);
        await changeToMarkedPerson('Snowflake');
        expect(
            screen.queryByRole('heading', {
                name: 'Set up the Snowflake agent integration',
            }),
        ).not.toBeInTheDocument();
        expect(screen.queryByText(/Not saved\./)).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Turn on' }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByText(identityLabels.marked_person.helper),
        ).toBeInTheDocument();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(lightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({ method: 'PUT' }),
        );
    });
    it('cancels without saving and clears verification for the next attempt', async () => {
        startUnconfigured();
        await selectAgentSignIn();
        fireEvent.click(
            await screen.findByRole('button', { name: 'Verify integration' }),
        );
        await waitFor(() =>
            expect(
                screen.getByRole('button', { name: 'Turn on' }),
            ).toBeEnabled(),
        );
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(
            screen.getByRole('combobox', { name: 'Snowflake agent identity' }),
        ).toHaveValue(identityLabels.marked_person.label);
        expect(screen.queryByText('Not active yet')).not.toBeInTheDocument();
        expect(lightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({ method: 'PUT' }),
        );
        await selectAgentSignIn();
        await screen.findByRole('button', { name: 'Verify integration' });
        expect(screen.getByRole('button', { name: 'Turn on' })).toBeDisabled();
        expect(
            screen.queryByText("Snowflake's sign-in page responded."),
        ).not.toBeInTheDocument();
    });
    it('omits the setup hint for a configured integration when the rule is off', async () => {
        currentOverview.rules[0].source = 'marked_person';
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
        ).toBeInTheDocument();
        expect(
            screen.queryByText('Needs a one-time Snowflake setup'),
        ).not.toBeInTheDocument();
    });
    it.each([false, true])(
        'keeps setup and Turn on available during a background refetch when configured is %s',
        async (configured) => {
            mocks.configured = configured;
            currentOverview.rules[0].source = 'marked_person';
            const { client } = renderSection();
            await selectAgentSignIn();
            if (!configured) {
                fireEvent.click(
                    await screen.findByRole('button', {
                        name: 'Verify integration',
                    }),
                );
            }
            await waitFor(() =>
                expect(
                    screen.getByRole('button', { name: 'Turn on' }),
                ).toBeEnabled(),
            );
            let finishRefetch: (() => void) | undefined;
            vi.mocked(lightdashApi).mockImplementation(async (request) => {
                const response = await apiHandler(request);
                if (!request.url.endsWith('/setup')) return response;
                return new Promise<typeof response>((resolve) => {
                    finishRefetch = () => resolve(response);
                });
            });
            const queryKey = ['ai-access', 'org', 'org', 'snowflake-setup'];
            let refetch: Promise<void>;
            act(() => {
                refetch = client.refetchQueries({ queryKey });
            });
            await waitFor(() => expect(finishRefetch).toBeDefined());
            expect(client.isFetching({ queryKey })).toBe(1);
            expect(
                screen.getByRole('heading', {
                    name: configured
                        ? 'Turn on agent sign-in'
                        : 'Set up the Snowflake agent integration',
                }),
            ).toBeInTheDocument();
            if (!configured)
                expect(screen.getByText(backendSql)).toBeInTheDocument();
            expect(
                screen.getByRole('button', { name: 'Turn on' }),
            ).toBeEnabled();
            await act(async () => {
                finishRefetch!();
                await refetch;
            });
        },
    );
    it('confirms a configured integration without showing steps', async () => {
        currentOverview.rules[0].source = 'marked_person';
        renderSection();
        await selectAgentSignIn();
        expect(
            await screen.findByText(
                /The Snowflake agent integration is set up. Turn on agent sign-in/,
            ),
        ).toBeInTheDocument();
        const title = screen.getByRole('heading', {
            name: 'Turn on agent sign-in',
        });
        expect(
            within(title.parentElement!).getByText('Not active yet'),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('heading', {
                name: 'Set up the Snowflake agent integration',
            }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByText('Copy and run in Snowflake'),
        ).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Turn on' })).toBeEnabled();
        expect(lightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({ method: 'PUT' }),
        );
        fireEvent.click(screen.getByRole('button', { name: 'Turn on' }));
        await waitFor(() =>
            expect(lightdashApi).toHaveBeenCalledWith(
                expect.objectContaining({ method: 'PUT' }),
            ),
        );
    });
    it('shows a verified summary for an active rule and expands read-only setup', async () => {
        renderSection();
        expect(
            await screen.findByText(
                /Verified · Snowflake agent integration · checked/,
            ),
        ).toBeInTheDocument();
        expect(
            screen.queryByText('Copy and run in Snowflake'),
        ).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'View setup' }));
        expect(
            await screen.findByText('Copy and run in Snowflake'),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Verify integration' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Turn on' }),
        ).not.toBeInTheDocument();
        expect(
            vi
                .mocked(lightdashApi)
                .mock.calls.filter(([request]) =>
                    request.url.endsWith('/verify'),
                ),
        ).toHaveLength(1);
    });
    it('opens setup when verification of an active integration fails', async () => {
        verification.passed = false;
        renderSection();
        expect(
            await screen.findByText(
                /Snowflake agent integration needs attention · checked/,
            ),
        ).toBeInTheDocument();
        expect(
            await screen.findByText('Copy and run in Snowflake'),
        ).toBeInTheDocument();
    });
    it('keeps Turn on disabled after a verification request error and allows retry', async () => {
        startUnconfigured();
        await selectAgentSignIn();
        const button = await screen.findByRole('button', {
            name: 'Verify integration',
        });
        vi.mocked(lightdashApi).mockRejectedValueOnce({
            error: { message: 'Unavailable' },
        });
        fireEvent.click(button);
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Could not verify',
        );
        expect(screen.getByRole('button', { name: 'Turn on' })).toBeDisabled();
        fireEvent.click(button);
        await waitFor(() =>
            expect(
                screen.getByRole('button', { name: 'Turn on' }),
            ).toBeEnabled(),
        );
    });
    it('confirms the Snowflake AI service account source without OAuth setup', async () => {
        currentOverview.rules[0].source = 'marked_person';
        mocks.configured = false;
        currentOverview.snowflakeConfigured = false;
        missingProjects = [
            { projectUuid: 'snowflake-project-1', name: 'Snowflake project 1' },
            { projectUuid: 'snowflake-project-2', name: 'Snowflake project 2' },
        ];
        renderSection();
        await chooseServiceAccount('Snowflake');
        const dialog = await screen.findByRole('dialog', {
            name: 'Use a shared agent account for Snowflake?',
        });
        const alert = await within(dialog).findByRole('alert');
        expect(alert).toHaveTextContent(
            '2 projects have no shared agent account yet:',
        );
        expect(within(alert).getAllByRole('link')).toHaveLength(2);
        missingProjects.forEach(({ projectUuid, name }) =>
            expect(within(alert).getByRole('link', { name })).toHaveAttribute(
                'href',
                `/generalSettings/projectManagement/${projectUuid}/agentIdentity`,
            ),
        );
        expect(lightdashApi).toHaveBeenCalledWith({
            version: 'v2',
            url: '/org/agent-identity/snowflake/projects-without-ai-service-account',
            method: 'GET',
            body: undefined,
        });
        expect(lightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({ method: 'PUT' }),
        );
        expect(
            screen.getByRole('combobox', { name: 'Snowflake agent identity' }),
        ).toHaveValue(identityLabels.marked_person.label);
        expect(screen.queryByText(/Not saved/)).not.toBeInTheDocument();
        expect(
            screen.queryByText('Set up the Snowflake agent integration'),
        ).not.toBeInTheDocument();
        const confirm = within(dialog).getByRole('button', {
            name: 'Use a shared agent account',
        });
        await waitFor(() => expect(confirm).toBeEnabled());
        fireEvent.click(confirm);
        await waitFor(() =>
            expect(lightdashApi).toHaveBeenCalledWith({
                version: 'v2',
                url: '/org/agent-identity/snowflake',
                method: 'PUT',
                body: JSON.stringify({ source: 'ai_service_account' }),
            }),
        );
        await waitFor(() =>
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
        );
        expect(
            vi
                .mocked(lightdashApi)
                .mock.calls.filter(([request]) => request.method === 'PUT'),
        ).toHaveLength(1);
        expect(
            screen.getByRole('combobox', { name: 'Snowflake agent identity' }),
        ).toHaveValue(identityLabels.ai_service_account.label);
        expect(screen.queryByText(/Not saved/)).not.toBeInTheDocument();
        expect(
            screen.queryByText('Set up the Snowflake agent integration'),
        ).not.toBeInTheDocument();
        expect(lightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({
                url: '/org/agent-identity/snowflake/setup',
            }),
        );
    });
    it.each([
        ['ai_service_account', 'Use a shared agent account for Snowflake?'],
        ['marked_person', 'Run agents as the person on Snowflake?'],
    ] as const)(
        'keeps the saved Snowflake agent sign-in when cancelling %s',
        async (source, title) => {
            renderSection();
            if (source === 'ai_service_account') {
                await chooseServiceAccount('Snowflake');
            } else {
                await changeToMarkedPerson('Snowflake');
            }
            const dialog = await screen.findByRole('dialog', { name: title });
            expect(lightdashApi).not.toHaveBeenCalledWith(
                expect.objectContaining({ method: 'PUT' }),
            );
            fireEvent.click(
                within(dialog).getByRole('button', { name: 'Cancel' }),
            );
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
            expect(
                screen.getByRole('combobox', {
                    name: 'Snowflake agent identity',
                }),
            ).toHaveValue(identityLabels.agent_sign_in.label);
            expect(currentOverview.rules[0].source).toBe('agent_sign_in');
            expect(lightdashApi).not.toHaveBeenCalledWith(
                expect.objectContaining({ method: 'PUT' }),
            );
        },
    );
    it.each([
        [1, 0],
        [2, 0],
        [5, 0],
        [1, 1],
        [2, 1],
        [5, 1],
    ])(
        'lists %s missing projects with settings links and a three-name limit',
        async (count, ruleIndex) => {
            const data = overview();
            data.rules[ruleIndex].source = 'ai_service_account';
            const names = [
                'Jaffle shop',
                'Orders',
                'Sales',
                'Revenue',
                'Products',
            ];
            data.rules[ruleIndex].projectsMissingAiServiceAccount = names
                .slice(0, count)
                .map((name, index) => ({
                    projectUuid: `project-${index}`,
                    name,
                }));
            currentOverview = data;
            renderSection();
            const line = await screen.findByText(
                new RegExp(
                    `${count} ${count === 1 ? 'project has' : 'projects have'} no shared agent account:`,
                ),
            );
            expect(line).toHaveTextContent(
                count === 1
                    ? 'Agents are refused on it until a project admin adds one.'
                    : 'Agents are refused on them until a project admin adds one.',
            );
            const status = screen.getByRole('status');
            expect(status).toContainElement(line);
            expect(
                status.querySelector('.tabler-icon-alert-triangle'),
            ).toBeInTheDocument();
            expect(line).toHaveStyle({
                color: 'var(--mantine-color-orange-text)',
            });
            names
                .slice(0, Math.min(count, 3))
                .forEach((name, index) =>
                    expect(screen.getByRole('link', { name })).toHaveAttribute(
                        'href',
                        `/generalSettings/projectManagement/project-${index}/agentIdentity`,
                    ),
                );
            expect(
                screen.queryByRole('link', { name: 'Revenue' }),
            ).not.toBeInTheDocument();
            if (count > 3) expect(line).toHaveTextContent('and 2 more');
        },
    );
    it.each([null, []])(
        'hides the missing-project line for %s',
        async (missing) => {
            const data = overview();
            data.rules[1].projectsMissingAiServiceAccount = missing;
            currentOverview = data;
            renderSection();
            await screen.findAllByRole('combobox');
            expect(
                screen.queryByText(/no shared agent account:/),
            ).not.toBeInTheDocument();
        },
    );
    it('shows a green status when every Databricks project has an AI service account', async () => {
        currentOverview.rules.push({
            warehouseType: WarehouseTypes.DATABRICKS,
            source: 'ai_service_account',
            projectsMissingAiServiceAccount: [],
        });
        renderSection();
        const status = await screen.findByRole('status');
        const message = within(status).getByText(
            'Every Databricks project has a shared agent account.',
        );
        expect(message).toHaveStyle({
            color: 'var(--mantine-color-green-text)',
        });
        expect(status.querySelector('.tabler-icon-check')).toBeInTheDocument();
        const row = screen.getByTestId('databricks-agent-identity-rule');
        expect(row.children[1]).toContainElement(status);
    });
    it('shows no rule status when the missing-project lists are null', async () => {
        renderSection();
        await screen.findAllByRole('combobox');
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
    it('disables only the saving row', async () => {
        renderSection();
        await screen.findAllByRole('combobox');
        vi.mocked(lightdashApi).mockImplementation(() => new Promise(() => {}));
        await changeToMarkedPerson('Snowflake');
        fireEvent.click(
            await screen.findByRole('button', {
                name: 'Run as the person',
            }),
        );
        await waitFor(() =>
            expect(
                screen.getByRole('combobox', {
                    name: 'Snowflake agent identity',
                }),
            ).toBeDisabled(),
        );
        expect(
            screen.getByRole('combobox', { name: 'BigQuery agent identity' }),
        ).toBeEnabled();
    });
    it('waits for settings to load', () => {
        vi.mocked(lightdashApi).mockImplementation(() => new Promise(() => {}));
        renderSection();
        expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    });
    it('allows retry after a load failure', async () => {
        vi.mocked(lightdashApi).mockRejectedValue({
            error: { message: 'Unavailable' },
        });
        renderSection();
        expect(
            await screen.findByText('Could not load agent identity settings.'),
        ).toBeInTheDocument();
        vi.mocked(lightdashApi).mockImplementation(apiHandler);
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(await screen.findAllByRole('combobox')).toHaveLength(2);
    });
    it('reports failed saves and preserves the value', async () => {
        renderSection();
        await screen.findAllByRole('combobox');
        vi.mocked(lightdashApi).mockRejectedValue({
            error: { message: 'Unavailable' },
        });
        await changeToMarkedPerson('Snowflake');
        fireEvent.click(
            await screen.findByRole('button', {
                name: 'Run as the person',
            }),
        );
        await waitFor(() => expect(mocks.errorToast).toHaveBeenCalled());
        expect(
            screen.getByRole('combobox', { name: 'Snowflake agent identity' }),
        ).toHaveValue(identityLabels.agent_sign_in.label);
        expect(mocks.toast).not.toHaveBeenCalled();
    });
    it.each(['flag-off', 'non-admin'])('hides settings for %s', (mode) => {
        mocks.enabled = mode !== 'flag-off';
        mocks.canManage = mode !== 'non-admin';
        renderSection();
        expect(
            screen.queryByText(/Choose who agents run as/),
        ).not.toBeInTheDocument();
        expect(lightdashApi).not.toHaveBeenCalled();
    });
});
