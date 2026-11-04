import {
    WarehouseTypes,
    type OrganizationAgentIdentitySnowflakeVerify,
    type OrganizationAgentIdentityOverview,
} from '@lightdash/common';
import { Box } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
    act,
    fireEvent,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sharedLightdashApi } from '../../api';
import { useProjects } from '../../hooks/useProjects';
import { mockedLightdashApi } from '../../testing/mockedLightdashApi';
import { renderWithProviders } from '../../testing/testUtils';
import classes from './AgentIdentityChip.module.css';
import { useOrganizationAgentIdentitySettings } from './api';
import { identityChoiceStateLabels, identityLabels } from './identityLabels';
import { identityWarehouseNames } from './identityLabels';
import { OrganizationAgentIdentityCard } from './OrganizationAgentIdentitySection';

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
vi.mock('../../api');
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

const LocationProbe = () => (
    <output aria-label="Current URL">{useLocation().pathname}</output>
);

const IdentityCardHarness = () => {
    const overview = useOrganizationAgentIdentitySettings();
    const projects = useProjects();
    if (!overview.data || !projects.data) return null;
    return (
        <OrganizationAgentIdentityCard
            overview={overview.data}
            projects={projects.data}
            canEdit
        />
    );
};

const renderSection = (canEdit?: boolean) => {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    renderWithProviders(
        <QueryClientProvider client={client}>
            <MemoryRouter>
                {canEdit === undefined ? (
                    <IdentityCardHarness />
                ) : (
                    <OrganizationAgentIdentityCard
                        overview={currentOverview}
                        projects={projects}
                        canEdit={canEdit}
                    />
                )}
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
let projects: { warehouseType?: WarehouseTypes }[] = [];
let missingProjects: { projectUuid: string; name: string }[] = [];
const backendSql = 'CREATE SECURITY INTEGRATION BACKEND_PROVIDED;';
let verification: OrganizationAgentIdentitySnowflakeVerify;
const apiHandler = async ({
    url,
    method,
    body,
}: Parameters<typeof sharedLightdashApi>[0]) => {
    if (url === '/org/projects') return projects;
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
const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
};
const expectNoCardLoader = () => {
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(
        screen.queryByRole('status', { name: /loading/i }),
    ).not.toBeInTheDocument();
    expect(document.querySelector('.mantine-Loader-root')).toBeNull();
};
const selectAgentSignIn = async () => {
    fireEvent.click(
        await screen.findByRole('button', {
            name: /^Snowflake: agents run as/,
        }),
    );
    fireEvent.click(
        screen.getByRole('button', {
            name: /The person's agent sign-in/,
        }),
    );
};
const openSetup = async () => {
    fireEvent.click(
        await screen.findByRole('button', {
            name: /^Snowflake: agents run as/,
        }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'View setup' }));
};
const startUnconfigured = () => {
    mocks.configured = false;
    currentOverview.snowflakeConfigured = false;
    currentOverview.rules[0].source = 'marked_person';
    return renderSection();
};
const changeToMarkedPerson = async (name: string) => {
    fireEvent.click(
        await screen.findByRole('button', {
            name: new RegExp(`^${name}: agents run as`),
        }),
    );
    fireEvent.click(
        screen.getByRole('button', {
            name: identityLabels.marked_person.label,
        }),
    );
};

const chooseServiceAccount = async (warehouseName = 'BigQuery') => {
    fireEvent.click(
        await screen.findByRole('button', {
            name: new RegExp(`^${warehouseName}: agents run as`),
        }),
    );
    fireEvent.click(
        screen.getByRole('button', {
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
        projects = Object.keys(identityWarehouseNames).map((warehouseType) => ({
            warehouseType: warehouseType as WarehouseTypes,
        }));
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
        mockedLightdashApi.mockImplementation(apiHandler);
    });
    it('shows saved identity chips without a summary or raw source values', async () => {
        renderSection();
        expect(
            await screen.findAllByRole('button', { name: /: agents run as/ }),
        ).toHaveLength(2);
        expect(screen.getByRole('heading', { name: 'Identity' })).toBeVisible();
        expect(
            screen.queryByText(/^Agents run as the person asking/),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole('button', {
                name: "Snowflake: agents run as the person's agent sign-in. Change.",
            }),
        ).toHaveTextContent('Agent sign-in');
        expect(
            screen.getByRole('button', {
                name: 'BigQuery: agents run as a shared agent account. Change.',
            }),
        ).toHaveTextContent('Shared account');
        expect(screen.queryByRole('switch')).not.toBeInTheDocument();
        expect(
            screen.queryByText(
                /marked_person|ai_service_account|agent_sign_in/,
            ),
        ).not.toBeInTheDocument();
    });
    it('uses organization spelling in the expanded Snowflake setup', async () => {
        mocks.configured = false;
        renderSection();
        await openSetup();
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
        ['Postgres', 'postgres'],
        ['Redshift', 'redshift'],
        ['Databricks', 'databricks'],
        ['Trino', 'trino'],
        ['ClickHouse', 'clickhouse'],
        ['Athena', 'athena'],
    ])('saves only the source for %s', async (name, warehouseType) => {
        if (
            !currentOverview.rules.some(
                (rule) => rule.warehouseType === warehouseType,
            )
        )
            currentOverview.rules.push({
                warehouseType: warehouseType as WarehouseTypes,
                source: 'ai_service_account',
                projectsMissingAiServiceAccount: null,
            });
        const { invalidate } = renderSection();
        await changeToMarkedPerson(name);
        expect(await screen.findByRole('dialog')).toHaveTextContent(
            `Run agents as the person on ${name}?`,
        );
        expect(screen.getByRole('dialog')).toHaveTextContent(
            `Agents will get the same ${name} access as the person asking. Your warehouse can't limit agent queries separately.`,
        );
        expect(sharedLightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({ method: 'PUT' }),
        );
        expect(sharedLightdashApi).not.toHaveBeenCalledWith(
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
            expect(sharedLightdashApi).toHaveBeenCalledWith({
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
            await screen.findByRole('button', {
                name: /^BigQuery: agents run as/,
            }),
        );
        fireEvent.click(
            screen.getByRole('button', {
                name: identityLabels.ai_service_account.label,
            }),
        );
        expect(await screen.findByRole('dialog')).toHaveTextContent(
            'Use a shared agent account for BigQuery?',
        );
        expect(screen.getByRole('dialog')).toHaveTextContent(
            "Agents on BigQuery will run as each project's shared agent account, not as the person asking.",
        );
        expect(sharedLightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({ method: 'PUT' }),
        );
        expect(
            screen.getByRole('button', {
                name: /^BigQuery: agents run as/,
            }),
        ).toHaveAccessibleName(/agents run as the person\. Change\./);
        const confirm = screen.getByRole('button', {
            name: 'Use a shared agent account',
        });
        await waitFor(() => expect(confirm).toBeEnabled());
        fireEvent.click(confirm);
        await waitFor(() =>
            expect(sharedLightdashApi).toHaveBeenCalledWith({
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
            mockedLightdashApi.mock.calls.filter(
                ([request]) => request.method === 'PUT',
            ),
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
            expect(sharedLightdashApi).toHaveBeenCalledWith({
                version: 'v2',
                url: '/org/agent-identity/bigquery/projects-without-ai-service-account',
                method: 'GET',
                body: undefined,
            });
            expect(sharedLightdashApi).not.toHaveBeenCalledWith(
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
                screen.getByRole('button', {
                    name: /^BigQuery: agents run as/,
                }),
            ).toHaveAccessibleName(/agents run as the person\. Change\./);
            expect(sharedLightdashApi).not.toHaveBeenCalledWith(
                expect.objectContaining({ method: 'PUT' }),
            );
        },
    );
    it('waits for the affected-project read before allowing confirmation', async () => {
        mockedLightdashApi.mockImplementation((request) =>
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
        mockedLightdashApi.mockImplementation((request) =>
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
        expect(sharedLightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({ method: 'PUT' }),
        );
    });
    it('keeps the modal open and prevents duplicate confirmation while saving', async () => {
        mockedLightdashApi.mockImplementation((request) =>
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
            mockedLightdashApi.mock.calls.filter(
                ([request]) => request.method === 'PUT',
            ),
        ).toHaveLength(1);
    });
    it('keeps the modal open after a save error', async () => {
        mockedLightdashApi.mockImplementation((request) =>
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
            screen.getByRole('button', { name: /^BigQuery: agents run as/ }),
        ).toHaveAccessibleName(
            /agents run as a shared agent account\. Change\./,
        );
    });
    it('offers the Databricks AI service account rule without per-person sign-in', async () => {
        currentOverview.rules.push({
            warehouseType: WarehouseTypes.DATABRICKS,
            source: 'marked_person',
            projectsMissingAiServiceAccount: null,
        });
        renderSection();
        fireEvent.click(
            await screen.findByRole('button', {
                name: /^Databricks: agents run as/,
            }),
        );
        expect(
            screen.queryByRole('button', {
                name: /The person's agent sign-in/,
            }),
        ).not.toBeInTheDocument();
        fireEvent.click(
            screen.getByRole('button', {
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
            expect(sharedLightdashApi).toHaveBeenCalledWith({
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
            await screen.findByRole('button', {
                name: /^Athena: agents run as/,
            }),
        );
        expect(
            screen.queryByRole('button', {
                name: /The person's agent sign-in/,
            }),
        ).not.toBeInTheDocument();
        fireEvent.click(
            screen.getByRole('button', {
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
        expect(sharedLightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({ method: 'PUT' }),
        );
        fireEvent.click(confirm);
        await waitFor(() =>
            expect(sharedLightdashApi).toHaveBeenCalledWith({
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
            await screen.findByRole('button', {
                name: /^Postgres: agents run as/,
            }),
        );
        expect(
            screen.queryByRole('button', {
                name: /The person's agent sign-in/,
            }),
        ).not.toBeInTheDocument();
        fireEvent.click(
            screen.getByRole('button', {
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
        expect(sharedLightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({ method: 'PUT' }),
        );
        fireEvent.click(confirm);
        await waitFor(() =>
            expect(sharedLightdashApi).toHaveBeenCalledWith({
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
            await screen.findByRole('button', {
                name: /^Redshift: agents run as/,
            }),
        );
        expect(
            screen.queryByRole('button', {
                name: /The person's agent sign-in/,
            }),
        ).not.toBeInTheDocument();
        fireEvent.click(
            screen.getByRole('button', {
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
        expect(sharedLightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({ method: 'PUT' }),
        );
        fireEvent.click(confirm);
        await waitFor(() =>
            expect(sharedLightdashApi).toHaveBeenCalledWith({
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
            await screen.findByRole('button', {
                name: /^Trino: agents run as/,
            }),
        );
        expect(
            screen.queryByRole('button', {
                name: /The person's agent sign-in/,
            }),
        ).not.toBeInTheDocument();
        fireEvent.click(
            screen.getByRole('button', {
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
        expect(sharedLightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({ method: 'PUT' }),
        );
        fireEvent.click(confirm);
        await waitFor(() =>
            expect(sharedLightdashApi).toHaveBeenCalledWith({
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
            await screen.findByRole('button', {
                name: /^ClickHouse: agents run as/,
            }),
        );
        expect(
            screen.queryByRole('button', {
                name: /The person's agent sign-in/,
            }),
        ).not.toBeInTheDocument();
        expect(
            within(screen.getByRole('dialog')).getAllByRole('button'),
        ).toHaveLength(2);
        fireEvent.click(
            screen.getByRole('button', {
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
        expect(sharedLightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({ method: 'PUT' }),
        );
        fireEvent.click(confirm);
        await waitFor(() =>
            expect(sharedLightdashApi).toHaveBeenCalledWith({
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
            screen.getByRole('button', { name: /^ClickHouse: agents run as/ }),
        ).toHaveAccessibleName(
            /agents run as a shared agent account\. Change\./,
        );
    });
    describe('ClickHouse rule visibility and failures', () => {
        beforeEach(() => {
            currentOverview.rules.push({
                warehouseType: WarehouseTypes.CLICKHOUSE,
                source: 'marked_person',
                projectsMissingAiServiceAccount: null,
            });
        });
        it('keeps the previous ClickHouse rule when saving fails', async () => {
            mockedLightdashApi.mockImplementation((request) =>
                request.method === 'PUT'
                    ? Promise.reject({ error: { message: 'Save failed' } })
                    : apiHandler(request),
            );
            renderSection();
            fireEvent.click(
                await screen.findByRole('button', {
                    name: /^ClickHouse: agents run as/,
                }),
            );
            fireEvent.click(
                screen.getByRole('button', {
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
                screen.getByRole('button', {
                    name: /^ClickHouse: agents run as/,
                }),
            ).toHaveAccessibleName(/agents run as the person\. Change\./);
        });
    });
    it('shows no setup in the default state and enables the sign-in option with a hint', async () => {
        startUnconfigured();
        await screen.findAllByRole('button', { name: /: agents run as/ });
        expect(
            screen.queryByText('Set up the Snowflake agent integration'),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'View setup' }),
        ).not.toBeInTheDocument();
        expect(sharedLightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({
                url: '/org/agent-identity/snowflake/setup',
            }),
        );
        fireEvent.click(
            screen.getByRole('button', { name: /^Snowflake: agents run as/ }),
        );
        const option = screen.getByRole('button', {
            name: /The person's agent sign-in/,
        });
        expect(option).toBeEnabled();
        expect(within(option).getByText('Setup needed')).toBeVisible();
    });
    describe('Snowflake identity choice states', () => {
        const openMenu = async () => {
            fireEvent.click(
                await screen.findByRole('button', {
                    name: /^Snowflake: agents run as/,
                }),
            );
            return within(
                screen.getByRole('dialog', { name: 'Snowflake agents run as' }),
            );
        };
        const expectNormalMenu = (menu: ReturnType<typeof within>) => {
            const saved = menu.getByRole('button', {
                name: identityLabels.marked_person.label,
            });
            expect(saved).toHaveAttribute('aria-current', 'true');
            expect(
                within(saved).getByRole('img', { name: 'Saved choice' }),
            ).toBeVisible();
            expect(
                menu.getAllByRole('img', { name: 'Saved choice' }),
            ).toHaveLength(1);
            for (const label of Object.values(identityChoiceStateLabels))
                expect(menu.queryByText(label)).not.toBeInTheDocument();
            const signIn = menu.getByRole('button', {
                name: identityLabels.agent_sign_in.label,
            });
            expect(within(signIn).getByText('Setup needed')).toBeVisible();
            expect(signIn).not.toHaveAttribute('data-setting-up');
        };
        const expectSettingUpMenu = (
            menu: ReturnType<typeof within>,
            savedSource: 'marked_person' | 'ai_service_account',
            expectNoPut = true,
        ) => {
            expect(
                menu.queryByLabelText('Saved choice'),
            ).not.toBeInTheDocument();
            const saved = menu.getByRole('button', {
                name: `${identityLabels[savedSource].label}, ${identityChoiceStateLabels.current.toLowerCase()}`,
            });
            expect(saved).toBeVisible();
            expect(
                within(saved).getByText(identityChoiceStateLabels.current),
            ).toBeVisible();
            expect(saved).toHaveAttribute('aria-current', 'true');
            expect(saved).not.toHaveAttribute('data-setting-up');
            const signIn = menu.getByRole('button', {
                name: `${identityLabels.agent_sign_in.label}, ${identityChoiceStateLabels.settingUp.toLowerCase()}`,
            });
            expect(signIn).toBeVisible();
            expect(
                within(signIn).getByText(identityChoiceStateLabels.settingUp),
            ).toBeVisible();
            expect(signIn).toHaveAttribute('data-setting-up');
            expect(
                within(signIn).queryByText('Setup needed'),
            ).not.toBeInTheDocument();
            const otherSource =
                savedSource === 'marked_person'
                    ? 'ai_service_account'
                    : 'marked_person';
            const other = menu.getByRole('button', {
                name: identityLabels[otherSource].label,
            });
            for (const label of Object.values(identityChoiceStateLabels))
                expect(
                    within(other).queryByText(label),
                ).not.toBeInTheDocument();
            expect(other).not.toHaveAttribute('data-setting-up');
            expect(
                screen.getByRole('button', {
                    name: `Snowflake: agents run as ${identityLabels[savedSource].label.toLowerCase()}. Change.`,
                }),
            ).toBeVisible();
            if (expectNoPut)
                expect(sharedLightdashApi).not.toHaveBeenCalledWith(
                    expect.objectContaining({ method: 'PUT' }),
                );
        };

        it('shows the saved choice and setup hint when nothing is in progress', async () => {
            startUnconfigured();
            expectNormalMenu(await openMenu());
        });
        it('marks the current choice and agent sign-in being set up without saving', async () => {
            startUnconfigured();
            await selectAgentSignIn();
            expectSettingUpMenu(await openMenu(), 'marked_person');
        });
        it('marks agent sign-in being set up with a configured integration', async () => {
            currentOverview.rules[0].source = 'marked_person';
            renderSection();
            await selectAgentSignIn();
            expectSettingUpMenu(await openMenu(), 'marked_person');
        });
        it('marks the shared account as current while agent sign-in is being set up', async () => {
            currentOverview.rules[0].source = 'ai_service_account';
            renderSection();
            await selectAgentSignIn();
            expectSettingUpMenu(await openMenu(), 'ai_service_account');
        });
        it('shows the saved agent sign-in tick after Turn on saves and refetches', async () => {
            currentOverview.rules[0].source = 'marked_person';
            renderSection();
            await selectAgentSignIn();
            const turnOn = await screen.findByRole('button', {
                name: 'Turn on',
            });
            await waitFor(() => expect(turnOn).toBeEnabled());
            fireEvent.click(turnOn);
            await waitFor(() =>
                expect(sharedLightdashApi).toHaveBeenCalledWith({
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
            const menu = await openMenu();
            const saved = menu.getByRole('button', {
                name: identityLabels.agent_sign_in.label,
            });
            expect(saved).toHaveAttribute('aria-current', 'true');
            expect(
                within(saved).getByRole('img', { name: 'Saved choice' }),
            ).toBeVisible();
            expect(
                menu.getAllByRole('img', { name: 'Saved choice' }),
            ).toHaveLength(1);
            for (const label of Object.values(identityChoiceStateLabels))
                expect(menu.queryByText(label)).not.toBeInTheDocument();
            expect(saved).not.toHaveAttribute('data-setting-up');
            expect(
                mockedLightdashApi.mock.calls.filter(
                    ([request]) => request.method === 'PUT',
                ),
            ).toHaveLength(1);
        });
        it('restores the saved choice and setup hint after Cancel without saving', async () => {
            startUnconfigured();
            await selectAgentSignIn();
            fireEvent.click(
                await screen.findByRole('button', { name: 'Cancel' }),
            );
            expectNormalMenu(await openMenu());
            expect(sharedLightdashApi).not.toHaveBeenCalledWith(
                expect.objectContaining({ method: 'PUT' }),
            );
        });
        it('keeps the setting-up menu after Turn on fails', async () => {
            mockedLightdashApi.mockImplementation((request) =>
                request.method === 'PUT' &&
                request.url === '/org/agent-identity/snowflake'
                    ? Promise.reject({ error: { message: 'Save failed' } })
                    : apiHandler(request),
            );
            currentOverview.rules[0].source = 'marked_person';
            renderSection();
            await selectAgentSignIn();
            const turnOn = await screen.findByRole('button', {
                name: 'Turn on',
            });
            await waitFor(() => expect(turnOn).toBeEnabled());
            fireEvent.click(turnOn);
            await waitFor(() =>
                expect(sharedLightdashApi).toHaveBeenCalledWith({
                    version: 'v2',
                    url: '/org/agent-identity/snowflake',
                    method: 'PUT',
                    body: JSON.stringify({ source: 'agent_sign_in' }),
                }),
            );
            await waitFor(() => expect(mocks.errorToast).toHaveBeenCalled());
            await waitFor(() =>
                expect(
                    screen.getByRole('button', {
                        name: /^Snowflake: agents run as/,
                    }),
                ).toBeEnabled(),
            );
            expect(screen.getByText('Not active yet')).toBeVisible();
            expectSettingUpMenu(await openMenu(), 'marked_person', false);
        });
        it('restores the normal menu when the saved choice is selected again', async () => {
            startUnconfigured();
            await selectAgentSignIn();
            const menu = await openMenu();
            fireEvent.click(
                menu.getByRole('button', {
                    name: `${identityLabels.marked_person.label}, ${identityChoiceStateLabels.current.toLowerCase()}`,
                }),
            );
            expect(
                screen.queryByText('Not active yet'),
            ).not.toBeInTheDocument();
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
            expect(sharedLightdashApi).not.toHaveBeenCalledWith(
                expect.objectContaining({ method: 'PUT' }),
            );
            expectNormalMenu(await openMenu());
        });
        it('clears setup when choosing the shared account and restores the normal menu after Cancel', async () => {
            startUnconfigured();
            await selectAgentSignIn();
            const menu = await openMenu();
            fireEvent.click(
                menu.getByRole('button', {
                    name: identityLabels.ai_service_account.label,
                }),
            );
            expect(
                screen.queryByText('Not active yet'),
            ).not.toBeInTheDocument();
            const dialog = screen.getByRole('dialog', {
                name: 'Use a shared agent account for Snowflake?',
            });
            expect(dialog).toBeVisible();
            fireEvent.click(
                within(dialog).getByRole('button', { name: 'Cancel' }),
            );
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
            expect(
                screen.queryByText('Not active yet'),
            ).not.toBeInTheDocument();
            expect(sharedLightdashApi).not.toHaveBeenCalledWith(
                expect.objectContaining({ method: 'PUT' }),
            );
            expectNormalMenu(await openMenu());
        });
    });
    it('keeps selection pending, renders backend SQL and enables Turn on only after verification passes', async () => {
        startUnconfigured();
        await selectAgentSignIn();
        expect(
            screen.getByRole('button', { name: /^Snowflake: agents run as/ }),
        ).toHaveAccessibleName(/agents run as the person\. Change\./);
        expect(screen.getByText('Not active yet')).toBeInTheDocument();
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
        expect(sharedLightdashApi).not.toHaveBeenCalledWith(
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
            expect(sharedLightdashApi).toHaveBeenCalledWith({
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
                await screen.findByRole('button', {
                    name: /^Snowflake: agents run as/,
                }),
            );
            expect(screen.queryByText('Setup needed') !== null).toBe(
                !configured,
            );
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
            await screen.findByRole('status', {
                name: 'Snowflake agent sign-in verified',
            }),
        ).toBeInTheDocument();
        fireEvent.click(
            screen.getByRole('button', { name: /^Snowflake: agents run as/ }),
        );
        expect(
            screen.getByRole('button', { name: 'View setup' }),
        ).toBeInTheDocument();
        fireEvent.keyDown(screen.getByRole('button', { name: 'View setup' }), {
            key: 'Escape',
        });
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
                screen.getByRole('button', {
                    name: /^Snowflake: agents run as/,
                }),
            ).toHaveAccessibleName(/agents run as the person\. Change\./),
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
        expect(screen.getByText('Not active yet')).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: /^Snowflake: agents run as/ }),
        ).toHaveAccessibleName(/agents run as the person\. Change\./);
        fireEvent.click(
            screen.getByRole('button', { name: /^Snowflake: agents run as/ }),
        );
        fireEvent.click(
            within(
                screen.getByRole('dialog', { name: 'Snowflake agents run as' }),
            ).getByRole('button', {
                name: `${identityLabels.marked_person.label}, ${identityChoiceStateLabels.current.toLowerCase()}`,
            }),
        );
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
            screen.getByRole('button', {
                name: 'Snowflake: agents run as the person. Change.',
            }),
        ).toBeInTheDocument();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(sharedLightdashApi).not.toHaveBeenCalledWith(
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
            screen.getByRole('button', { name: /^Snowflake: agents run as/ }),
        ).toHaveAccessibleName(/agents run as the person\. Change\./);
        expect(screen.queryByText('Not active yet')).not.toBeInTheDocument();
        expect(sharedLightdashApi).not.toHaveBeenCalledWith(
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
            await screen.findByRole('button', {
                name: /^Snowflake: agents run as/,
            }),
        );
        expect(
            screen.getByRole('button', {
                name: identityLabels.agent_sign_in.label,
            }),
        ).toBeInTheDocument();
        expect(screen.queryByText('Setup needed')).not.toBeInTheDocument();
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
            mockedLightdashApi.mockImplementation(async (request) => {
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
        expect(sharedLightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({ method: 'PUT' }),
        );
        fireEvent.click(screen.getByRole('button', { name: 'Turn on' }));
        await waitFor(() =>
            expect(sharedLightdashApi).toHaveBeenCalledWith(
                expect.objectContaining({ method: 'PUT' }),
            ),
        );
    });
    it('shows a verified chip for an active rule and expands setup', async () => {
        renderSection();
        expect(
            await screen.findByRole('status', {
                name: 'Snowflake agent sign-in verified',
            }),
        ).toBeInTheDocument();
        expect(
            screen.queryByText('Copy and run in Snowflake'),
        ).not.toBeInTheDocument();
        await openSetup();
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
            mockedLightdashApi.mock.calls.filter(([request]) =>
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
        mockedLightdashApi.mockRejectedValueOnce({
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
        expect(sharedLightdashApi).toHaveBeenCalledWith({
            version: 'v2',
            url: '/org/agent-identity/snowflake/projects-without-ai-service-account',
            method: 'GET',
            body: undefined,
        });
        expect(sharedLightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({ method: 'PUT' }),
        );
        expect(
            screen.getByRole('button', { name: /^Snowflake: agents run as/ }),
        ).toHaveAccessibleName(/agents run as the person\. Change\./);
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
            expect(sharedLightdashApi).toHaveBeenCalledWith({
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
            mockedLightdashApi.mock.calls.filter(
                ([request]) => request.method === 'PUT',
            ),
        ).toHaveLength(1);
        expect(
            screen.getByRole('button', { name: /^Snowflake: agents run as/ }),
        ).toHaveAccessibleName(
            /agents run as a shared agent account\. Change\./,
        );
        expect(screen.queryByText(/Not saved/)).not.toBeInTheDocument();
        expect(
            screen.queryByText('Set up the Snowflake agent integration'),
        ).not.toBeInTheDocument();
        expect(sharedLightdashApi).not.toHaveBeenCalledWith(
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
            expect(sharedLightdashApi).not.toHaveBeenCalledWith(
                expect.objectContaining({ method: 'PUT' }),
            );
            fireEvent.click(
                within(dialog).getByRole('button', { name: 'Cancel' }),
            );
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
            expect(
                screen.getByRole('button', {
                    name: /^Snowflake: agents run as/,
                }),
            ).toHaveAccessibleName(
                /agents run as the person's agent sign-in\. Change\./,
            );
            expect(currentOverview.rules[0].source).toBe('agent_sign_in');
            expect(sharedLightdashApi).not.toHaveBeenCalledWith(
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
        'lists all %s missing projects in the chip popover with settings links',
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
            const warehouse = ruleIndex === 0 ? 'Snowflake' : 'BigQuery';
            const status = await screen.findByRole('status', {
                name: `${warehouse}: ${count} ${count === 1 ? 'project has' : 'projects have'} no shared agent account`,
            });
            expect(status).toHaveTextContent(String(count));
            expect(
                status.querySelector('svg.tabler-icon-alert-triangle-filled'),
            ).toBeInTheDocument();
            fireEvent.click(
                screen.getByRole('button', {
                    name: new RegExp(`^${warehouse}: agents run as`),
                }),
            );
            const warning = screen.getByRole('region', {
                name: `${count} ${count === 1 ? 'project has' : 'projects have'} no shared agent account`,
            });
            expect(warning).toHaveTextContent(
                count === 1
                    ? 'Agents are refused on it until a project admin adds one.'
                    : 'Agents are refused on them until a project admin adds one.',
            );
            expect(within(warning).getAllByRole('link')).toHaveLength(count);
            names
                .slice(0, count)
                .forEach((name, index) =>
                    expect(
                        within(warning).getByRole('link', { name }),
                    ).toHaveAttribute(
                        'href',
                        `/generalSettings/projectManagement/project-${index}/agentIdentity`,
                    ),
                );
        },
    );
    it.each([null, []])(
        'hides the missing-project line for %s',
        async (missing) => {
            const data = overview();
            data.rules[1].projectsMissingAiServiceAccount = missing;
            currentOverview = data;
            renderSection();
            const chip = await screen.findByRole('button', {
                name: /^BigQuery: agents run as/,
            });
            if (missing === null) {
                expect(
                    within(chip).queryByRole('status'),
                ).not.toBeInTheDocument();
            } else {
                const status = within(chip).getByRole('status', {
                    name: 'Every BigQuery project has a shared agent account.',
                });
                expect(status).toHaveClass('tabler-icon-circle-check-filled');
            }
            expect(
                within(chip).queryByRole('status', {
                    name: /no shared agent account/,
                }),
            ).not.toBeInTheDocument();
            fireEvent.click(chip);
            expect(
                screen.queryByRole('region', {
                    name: /no shared agent account/,
                }),
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
        const status = await screen.findByRole('status', {
            name: 'Every Databricks project has a shared agent account.',
        });
        expect(
            screen.getByRole('button', { name: /^Databricks: agents run as/ }),
        ).toContainElement(status);
        expect(status).toHaveClass('tabler-icon-circle-check-filled');
        expect(
            screen.queryByRole('status', { name: /no shared agent account/ }),
        ).not.toBeInTheDocument();
    });
    it('shows no rule status when the missing-project lists are null', async () => {
        currentOverview.rules[0].source = 'ai_service_account';
        renderSection();
        await screen.findAllByRole('button', { name: /: agents run as/ });
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
    it('disables only the saving chip and replaces its choice icon with a loader', async () => {
        renderSection();
        await screen.findAllByRole('button', { name: /: agents run as/ });
        mockedLightdashApi.mockImplementation(() => new Promise(() => {}));
        await changeToMarkedPerson('Snowflake');
        fireEvent.click(
            await screen.findByRole('button', {
                name: 'Run as the person',
            }),
        );
        await waitFor(() =>
            expect(
                screen.getByRole('button', {
                    name: /^Snowflake: agents run as/,
                }),
            ).toBeDisabled(),
        );
        expect(
            screen.getByRole('button', { name: /^BigQuery: agents run as/ }),
        ).toBeEnabled();
        const chip = screen.getByRole('button', {
            name: /^Snowflake: agents run as/,
        });
        expect(
            within(chip).getByRole('status', {
                name: 'Saving Snowflake identity',
            }),
        ).toBeVisible();
        expect(
            within(chip).queryByRole('img', {
                name: "The person's agent sign-in",
            }),
        ).not.toBeInTheDocument();
    });
    it('reports failed saves and preserves the value', async () => {
        renderSection();
        await screen.findAllByRole('button', { name: /: agents run as/ });
        mockedLightdashApi.mockRejectedValue({
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
            screen.getByRole('button', { name: /^Snowflake: agents run as/ }),
        ).toHaveAccessibleName(
            /agents run as the person's agent sign-in\. Change\./,
        );
        expect(mocks.toast).not.toHaveBeenCalled();
    });
    it('filters chips by project warehouse or non-default source in API order', async () => {
        currentOverview.rules = [
            {
                warehouseType: WarehouseTypes.BIGQUERY,
                source: 'marked_person',
                projectsMissingAiServiceAccount: null,
            },
            {
                warehouseType: WarehouseTypes.SNOWFLAKE,
                source: 'marked_person',
                projectsMissingAiServiceAccount: null,
            },
            {
                warehouseType: WarehouseTypes.POSTGRES,
                source: 'ai_service_account',
                projectsMissingAiServiceAccount: null,
            },
            {
                warehouseType: WarehouseTypes.TRINO,
                source: 'marked_person',
                projectsMissingAiServiceAccount: null,
            },
            {
                warehouseType: WarehouseTypes.DUCKDB,
                source: 'marked_person',
                projectsMissingAiServiceAccount: null,
            },
        ];
        projects = [
            { warehouseType: WarehouseTypes.SNOWFLAKE },
            {},
            { warehouseType: WarehouseTypes.BIGQUERY },
            { warehouseType: WarehouseTypes.DUCKDB },
        ];
        renderSection();
        const chips = await screen.findAllByRole('button', {
            name: /: agents run as/,
        });
        expect(
            screen.queryByText(/^Agents run as the person asking/),
        ).not.toBeInTheDocument();
        expect(chips.map((chip) => chip.getAttribute('aria-label'))).toEqual([
            'BigQuery: agents run as the person. Change.',
            'Snowflake: agents run as the person. Change.',
            'Postgres: agents run as a shared agent account. Change.',
        ]);
    });
    it('shows only the title and empty row without projects', async () => {
        projects = [{}];
        currentOverview.rules.forEach((rule) => {
            rule.source = 'marked_person';
        });
        renderSection();
        expect(
            await screen.findByText('No warehouses in use yet.'),
        ).toBeVisible();
        expect(screen.getByRole('heading', { name: 'Identity' })).toBeVisible();
        expect(
            screen.queryByText(/^Agents run as the person asking/),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: /: agents run as/ }),
        ).not.toBeInTheDocument();
    });
    it('renders all eight warehouse chips with person icons', async () => {
        currentOverview.rules = Object.keys(identityWarehouseNames).map(
            (warehouseType) => ({
                warehouseType: warehouseType as WarehouseTypes,
                source: 'marked_person',
                projectsMissingAiServiceAccount: null,
            }),
        );
        renderSection();
        const chips = await screen.findAllByRole('button', {
            name: /: agents run as the person\. Change\./,
        });
        expect(chips).toHaveLength(8);
        expect(
            screen.queryByText(/^Agents run as the person asking/),
        ).not.toBeInTheDocument();
        for (const chip of chips)
            expect(
                within(chip).getByRole('img', { name: 'The person' }),
            ).toBeInTheDocument();
    });
    it.each([
        [
            'marked_person',
            "Snowflake: agents run as the person asking, with that person's access. Click to change.",
        ],
        [
            'ai_service_account',
            "Snowflake: agents run as each project's shared agent account. Click to change.",
        ],
        [
            'agent_sign_in',
            "Snowflake: agents run as each person's agent sign-in. Click to change.",
        ],
    ] as const)(
        'shows the %s tooltip and saved choice tick',
        async (source, tooltip) => {
            currentOverview.rules[0].source = source;
            renderSection();
            const chip = await screen.findByRole('button', {
                name: /^Snowflake: agents run as/,
            });
            expect(
                within(chip).getByRole('img', {
                    name: identityLabels[source].label,
                }),
            ).toBeInTheDocument();
            fireEvent.mouseEnter(chip);
            expect(await screen.findByRole('tooltip')).toHaveTextContent(
                tooltip,
            );
            fireEvent.mouseLeave(chip);
            fireEvent.click(chip);
            const choice = screen.getByRole('button', {
                name: identityLabels[source].label,
            });
            expect(choice).toHaveAttribute('aria-current', 'true');
            expect(choice).not.toHaveAttribute('aria-pressed');
            for (const other of screen
                .getAllByRole('button')
                .filter((button) => button !== choice)) {
                expect(other).not.toHaveAttribute('aria-current', 'true');
                expect(other).not.toHaveAttribute('aria-pressed');
            }
            expect(
                within(choice).getByRole('img', { name: 'Saved choice' }),
            ).toBeInTheDocument();
            expect(
                screen.getByText(
                    "Gets the access of the person asking, so the warehouse can't limit agents separately.",
                ),
            ).toBeVisible();
            fireEvent.click(choice);
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
            expect(sharedLightdashApi).not.toHaveBeenCalledWith(
                expect.objectContaining({ method: 'PUT' }),
            );
        },
    );
    it('shows all five warning links in the hover card', async () => {
        currentOverview.rules[1].projectsMissingAiServiceAccount = Array.from(
            { length: 5 },
            (_, index) => ({
                projectUuid: `project-${index}`,
                name: `Project ${index}`,
            }),
        );
        renderSection();
        fireEvent.mouseEnter(
            await screen.findByRole('status', {
                name: 'BigQuery: 5 projects have no shared agent account',
            }),
        );
        const warning = await screen.findByRole('region', {
            name: '5 projects have no shared agent account',
        });
        expect(warning).toHaveTextContent(
            'Agents are refused on them until a project admin adds one.',
        );
        expect(within(warning).getAllByRole('link')).toHaveLength(5);
        for (let index = 0; index < 5; index++)
            expect(
                within(warning).getByRole('link', { name: `Project ${index}` }),
            ).toHaveAttribute(
                'href',
                `/generalSettings/projectManagement/project-${index}/agentIdentity`,
            );
    });
    it('renders read-only chips with tooltips and clickable warnings without any requests', async () => {
        currentOverview.rules[1].projectsMissingAiServiceAccount = [
            { projectUuid: 'project', name: 'Project' },
        ];
        const user = userEvent.setup();
        renderSection(false);
        const chip = screen.getByRole('group', {
            name: 'BigQuery: agents run as a shared agent account.',
        });
        expect(
            screen.queryByRole('button', { name: /agents run as/ }),
        ).not.toBeInTheDocument();
        expect(
            within(
                screen.getByRole('group', {
                    name: /^Snowflake: agents run as/,
                }),
            ).queryByRole('status'),
        ).not.toBeInTheDocument();
        await user.click(chip);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        await user.hover(chip);
        expect(await screen.findByRole('tooltip')).toHaveTextContent(
            "BigQuery: agents run as each project's shared agent account.",
        );
        expect(screen.getByRole('tooltip')).not.toHaveTextContent(
            'Click to change',
        );
        await user.click(
            screen.getByRole('button', {
                name: 'BigQuery: 1 project has no shared agent account',
            }),
        );
        expect(
            await screen.findByRole('link', { name: 'Project' }),
        ).toHaveAttribute(
            'href',
            '/generalSettings/projectManagement/project/agentIdentity',
        );
        expect(
            screen.queryByRole('button', { name: 'The person' }),
        ).not.toBeInTheDocument();
        expect(sharedLightdashApi).not.toHaveBeenCalled();
    });
    it.each(['{Enter}', ' '])(
        'opens read-only warnings with %s and returns focus on Escape',
        async (key) => {
            currentOverview.rules[1].projectsMissingAiServiceAccount = [
                { projectUuid: 'project', name: 'Project' },
            ];
            const user = userEvent.setup();
            renderSection(false);
            await user.tab();
            const count = screen.getByRole('button', {
                name: 'BigQuery: 1 project has no shared agent account',
            });
            expect(count).toHaveFocus();
            await user.keyboard(key);
            const warning = await screen.findByRole('region', {
                name: '1 project has no shared agent account',
            });
            expect(warning).toHaveTextContent(
                'Agents are refused on it until a project admin adds one.',
            );
            const link = within(warning).getByRole('link', { name: 'Project' });
            expect(link).toHaveAttribute(
                'href',
                '/generalSettings/projectManagement/project/agentIdentity',
            );
            await waitFor(() => expect(link).toHaveFocus());
            expect(
                screen.queryByRole('button', { name: 'The person' }),
            ).not.toBeInTheDocument();
            await user.keyboard('{Escape}');
            await waitFor(() =>
                expect(
                    screen.queryByRole('region', {
                        name: /no shared agent account/,
                    }),
                ).not.toBeInTheDocument(),
            );
            await waitFor(() => expect(count).toHaveFocus());
            expect(sharedLightdashApi).not.toHaveBeenCalled();
        },
    );
    it('explains the default chip on keyboard focus and click without a summary', async () => {
        currentOverview.rules = [
            {
                warehouseType: WarehouseTypes.SNOWFLAKE,
                source: 'marked_person',
                projectsMissingAiServiceAccount: null,
            },
        ];
        const user = userEvent.setup();
        renderSection();
        const chip = await screen.findByRole('button', {
            name: 'Snowflake: agents run as the person. Change.',
        });
        expect(
            screen.queryByText(/^Agents run as the person asking/),
        ).not.toBeInTheDocument();
        await user.tab();
        expect(chip).toHaveFocus();
        expect(await screen.findByRole('tooltip')).toHaveTextContent(
            "Snowflake: agents run as the person asking, with that person's access. Click to change.",
        );
        await user.click(chip);
        expect(screen.getByText('Snowflake agents run as')).toBeVisible();
        expect(
            screen.getByRole('button', { name: 'The person', current: true }),
        ).toBeVisible();
    });
    it.each(['click', 'Enter', 'Space'])(
        'isolates warning link %s events from the editable chip',
        async (activation) => {
            currentOverview.rules[0].source = 'marked_person';
            currentOverview.rules[1].projectsMissingAiServiceAccount = [
                { projectUuid: 'project', name: 'Project' },
            ];
            const user = userEvent.setup();
            const clickListener = vi.fn();
            const keyDownListener = vi.fn();
            const keyUpListener = vi.fn();
            const client = new QueryClient({
                defaultOptions: { queries: { retry: false } },
            });
            renderWithProviders(
                <QueryClientProvider client={client}>
                    <MemoryRouter>
                        <LocationProbe />
                        <Box
                            onClick={clickListener}
                            onKeyDown={keyDownListener}
                            onKeyUp={keyUpListener}
                        >
                            <OrganizationAgentIdentityCard
                                overview={currentOverview}
                                projects={projects}
                                canEdit
                            />
                        </Box>
                    </MemoryRouter>
                </QueryClientProvider>,
            );
            const chip = screen.getByRole('button', {
                name: /^BigQuery: agents run as/,
            });
            await user.hover(
                within(chip).getByRole('status', {
                    name: 'BigQuery: 1 project has no shared agent account',
                }),
            );
            const warning = await screen.findByRole('region', {
                name: '1 project has no shared agent account',
            });
            const link = within(warning).getByRole('link', { name: 'Project' });
            expect(link).toHaveAttribute(
                'href',
                '/generalSettings/projectManagement/project/agentIdentity',
            );
            if (activation === 'click') await user.click(link);
            else {
                act(() => link.focus());
                expect(link).toHaveFocus();
                await user.keyboard(activation === 'Enter' ? '{Enter}' : ' ');
            }
            expect(
                screen.getByRole('status', { name: 'Current URL' }),
            ).toHaveTextContent(
                activation === 'Space'
                    ? /^\/$/
                    : '/generalSettings/projectManagement/project/agentIdentity',
            );
            expect(
                screen.queryByRole('button', { name: 'The person' }),
            ).not.toBeInTheDocument();
            expect(chip).toHaveAttribute('aria-expanded', 'false');
            expect(sharedLightdashApi).not.toHaveBeenCalled();
            expect(clickListener).not.toHaveBeenCalled();
            expect(keyDownListener).not.toHaveBeenCalled();
            expect(keyUpListener).not.toHaveBeenCalled();
        },
    );
    it('keeps a default BigQuery chip and its save lock through successful project removal and return', async () => {
        currentOverview.rules = [
            {
                warehouseType: WarehouseTypes.BIGQUERY,
                source: 'marked_person',
                projectsMissingAiServiceAccount: null,
            },
        ];
        projects = [{ warehouseType: WarehouseTypes.BIGQUERY }];
        const saveRequest = deferred<Awaited<ReturnType<typeof apiHandler>>>();
        let projectsRequest = deferred<typeof projects>();
        let refetching = false;
        mockedLightdashApi.mockImplementation((request) => {
            if (request.method === 'PUT') return saveRequest.promise;
            if (request.url === '/org/projects' && refetching)
                return projectsRequest.promise;
            return apiHandler(request);
        });
        const { client } = renderSection();
        await chooseServiceAccount();
        const confirm = await screen.findByRole('button', {
            name: 'Use a shared agent account',
        });
        fireEvent.click(confirm);
        const chip = screen.getByRole('button', {
            name: /^BigQuery: agents run as/,
        });
        await waitFor(() => expect(chip).toBeDisabled());
        const savingStatus = within(chip).getByRole('status', {
            name: 'Saving BigQuery identity',
        });
        refetching = true;
        for (const nextProjects of [[], projects]) {
            projectsRequest = deferred<typeof projects>();
            let refetch: Promise<void>;
            act(() => {
                refetch = client.invalidateQueries(['projects']);
            });
            await waitFor(() =>
                expect(client.getQueryState(['projects'])?.fetchStatus).toBe(
                    'fetching',
                ),
            );
            await act(async () => {
                projectsRequest.resolve(nextProjects);
                await refetch;
                await new Promise((resolve) => setTimeout(resolve, 0));
            });
            expect(client.getQueryData(['projects'])).toEqual(nextProjects);
            expect(client.getQueryState(['projects'])?.status).toBe('success');
            expect(
                screen.getByRole('button', {
                    name: /^BigQuery: agents run as/,
                }),
            ).toBe(chip);
            expect(chip).toBeDisabled();
            expect(
                within(chip).getByRole('status', {
                    name: 'Saving BigQuery identity',
                }),
            ).toBe(savingStatus);
            expect(confirm).toBeDisabled();
            fireEvent.click(chip);
            fireEvent.click(confirm);
            expect(
                mockedLightdashApi.mock.calls.filter(
                    ([request]) => request.method === 'PUT',
                ),
            ).toHaveLength(1);
            expect(
                screen.queryByText('No warehouses in use yet.'),
            ).not.toBeInTheDocument();
        }
        await act(async () => {
            saveRequest.resolve(
                await apiHandler({
                    version: 'v2',
                    url: '/org/agent-identity/bigquery',
                    method: 'PUT',
                    body: JSON.stringify({ source: 'ai_service_account' }),
                }),
            );
        });
        expect(
            await screen.findByRole('button', {
                name: 'BigQuery: agents run as a shared agent account. Change.',
            }),
        ).toBeEnabled();
        expect(
            mockedLightdashApi.mock.calls.filter(
                ([request]) => request.method === 'PUT',
            ),
        ).toHaveLength(1);
    });
    it('keeps pending Snowflake setup and manual verification after successful project removal', async () => {
        mocks.configured = false;
        currentOverview.snowflakeConfigured = false;
        currentOverview.rules = [
            {
                warehouseType: WarehouseTypes.SNOWFLAKE,
                source: 'marked_person',
                projectsMissingAiServiceAccount: null,
            },
        ];
        projects = [{ warehouseType: WarehouseTypes.SNOWFLAKE }];
        const verifyRequest =
            deferred<OrganizationAgentIdentitySnowflakeVerify>();
        const projectsRequest = deferred<typeof projects>();
        let refetching = false;
        mockedLightdashApi.mockImplementation((request) => {
            if (request.url.endsWith('/verify')) return verifyRequest.promise;
            if (request.url === '/org/projects' && refetching)
                return projectsRequest.promise;
            return apiHandler(request);
        });
        const { client } = renderSection();
        await selectAgentSignIn();
        const panel = await screen.findByText('Copy and run in Snowflake');
        const pending = screen.getByText('Not active yet');
        const turnOn = screen.getByRole('button', { name: 'Turn on' });
        expect(turnOn).toBeDisabled();
        fireEvent.click(
            screen.getByRole('button', { name: 'Verify integration' }),
        );
        await waitFor(() =>
            expect(sharedLightdashApi).toHaveBeenCalledWith(
                expect.objectContaining({
                    method: 'POST',
                    url: '/org/agent-identity/snowflake/verify',
                }),
            ),
        );
        await act(async () => verifyRequest.resolve(verification));
        await waitFor(() => expect(turnOn).toBeEnabled());
        const result = screen.getByText('OAuth client settings · Passed');
        expect(result).toBeVisible();
        const callsBefore = mockedLightdashApi.mock.calls.length;
        refetching = true;
        let refetch: Promise<void>;
        act(() => {
            refetch = client.invalidateQueries(['projects']);
        });
        await waitFor(() =>
            expect(sharedLightdashApi).toHaveBeenCalledTimes(callsBefore + 1),
        );
        await act(async () => {
            projectsRequest.resolve([]);
            await refetch;
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
        expect(client.getQueryData(['projects'])).toEqual([]);
        expect(client.getQueryState(['projects'])?.status).toBe('success');
        expect(screen.getByText('Copy and run in Snowflake')).toBe(panel);
        expect(panel).toBeVisible();
        expect(screen.getByText('Not active yet')).toBe(pending);
        expect(screen.getByText('OAuth client settings · Passed')).toBe(result);
        expect(result).toBeVisible();
        expect(screen.getByRole('button', { name: 'Turn on' })).toBe(turnOn);
        expect(turnOn).toBeEnabled();
        expect(
            screen.queryByText('No warehouses in use yet.'),
        ).not.toBeInTheDocument();
        expect(
            mockedLightdashApi.mock.calls.filter(([request]) =>
                request.url.endsWith('/setup'),
            ),
        ).toHaveLength(1);
        expect(
            mockedLightdashApi.mock.calls.filter(([request]) =>
                request.url.endsWith('/verify'),
            ),
        ).toHaveLength(1);
        expect(
            mockedLightdashApi.mock.calls
                .slice(callsBefore)
                .map(([request]) => [request.method, request.url]),
        ).toEqual([['GET', '/org/projects']]);
    });
    it('never mounts an unused default warehouse before or after successful projects refetches', async () => {
        currentOverview.rules = [
            {
                warehouseType: WarehouseTypes.SNOWFLAKE,
                source: 'marked_person',
                projectsMissingAiServiceAccount: null,
            },
            {
                warehouseType: WarehouseTypes.BIGQUERY,
                source: 'marked_person',
                projectsMissingAiServiceAccount: null,
            },
        ];
        projects = [];
        const { client } = renderSection();
        expect(
            await screen.findByText('No warehouses in use yet.'),
        ).toBeVisible();
        expect(
            screen.queryByRole('button', { name: /: agents run as/ }),
        ).not.toBeInTheDocument();
        for (const nextProjects of [
            [{ warehouseType: WarehouseTypes.BIGQUERY }],
            [],
        ]) {
            const projectsRequest = deferred<typeof projects>();
            mockedLightdashApi.mockImplementation((request) =>
                request.url === '/org/projects'
                    ? projectsRequest.promise
                    : apiHandler(request),
            );
            let refetch: Promise<void>;
            act(() => {
                refetch = client.invalidateQueries(['projects']);
            });
            await act(async () => {
                projectsRequest.resolve(nextProjects);
                await refetch;
                await new Promise((resolve) => setTimeout(resolve, 0));
            });
            expect(client.getQueryData(['projects'])).toEqual(nextProjects);
            expect(
                screen.queryByRole('button', {
                    name: /^Snowflake: agents run as/,
                }),
            ).not.toBeInTheDocument();
            expect(
                screen.getAllByRole('button', { name: /: agents run as/ }),
            ).toHaveLength(1);
            expect(
                screen.queryByText('No warehouses in use yet.'),
            ).not.toBeInTheDocument();
        }
        expect(
            mockedLightdashApi.mock.calls.filter(
                ([request]) =>
                    request.url.endsWith('/setup') ||
                    request.url.endsWith('/verify'),
            ),
        ).toHaveLength(0);
    });
    it('shows no status while active verification is checking', async () => {
        mockedLightdashApi.mockImplementation(async (request) =>
            request.url.endsWith('/verify')
                ? new Promise(() => {})
                : apiHandler(request),
        );
        renderSection();
        const chip = await screen.findByRole('button', {
            name: /^Snowflake: agents run as/,
        });
        expect(within(chip).queryByRole('status')).not.toBeInTheDocument();
        expect(
            within(chip).getByRole('img', {
                name: "The person's agent sign-in",
            }),
        ).toBeInTheDocument();
        expect(
            screen.queryByText('Copy and run in Snowflake'),
        ).not.toBeInTheDocument();
    });
    it('shows an attention icon and opens setup after an active verification error', async () => {
        mockedLightdashApi.mockImplementation(async (request) => {
            if (request.url.endsWith('/verify'))
                throw { error: { message: 'Unavailable' } };
            return apiHandler(request);
        });
        renderSection();
        expect(
            await screen.findByRole('status', {
                name: 'Snowflake agent sign-in needs attention',
            }),
        ).toBeInTheDocument();
        expect(
            await screen.findByText('Copy and run in Snowflake'),
        ).toBeVisible();
    });
    it('toggles active setup without a second verification request', async () => {
        renderSection();
        await screen.findByRole('status', {
            name: 'Snowflake agent sign-in verified',
        });
        await openSetup();
        expect(
            await screen.findByText(
                /Verified · Snowflake agent integration · checked/,
            ),
        ).toBeVisible();
        fireEvent.click(
            screen.getByRole('button', { name: /^Snowflake: agents run as/ }),
        );
        fireEvent.click(
            within(
                screen.getByRole('dialog', { name: 'Snowflake agents run as' }),
            ).getByRole('button', { name: 'Hide setup' }),
        );
        expect(
            screen.queryByText('Copy and run in Snowflake'),
        ).not.toBeInTheDocument();
        expect(
            mockedLightdashApi.mock.calls.filter(([request]) =>
                request.url.endsWith('/verify'),
            ),
        ).toHaveLength(1);
    });
    it('opens with Enter and Space, tabs to a choice, and restores focus on Escape', async () => {
        currentOverview.rules[0].source = 'marked_person';
        const user = userEvent.setup();
        renderSection();
        const chip = await screen.findByRole('button', {
            name: /^Snowflake: agents run as/,
        });
        chip.focus();
        await user.keyboard('{Enter}');
        expect(
            screen.getByRole('dialog', { name: 'Snowflake agents run as' }),
        ).toBeVisible();
        await user.keyboard('{Escape}');
        await waitFor(() => expect(chip).toHaveFocus());
        await user.keyboard(' ');
        await waitFor(() =>
            expect(
                screen.getByRole('button', { name: 'The person' }),
            ).toHaveFocus(),
        );
        await user.tab();
        expect(
            screen.getByRole('button', { name: "The person's agent sign-in" }),
        ).toHaveFocus();
        await user.keyboard('{Enter}');
        expect(await screen.findByText('Not active yet')).toBeVisible();
        expect(sharedLightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({ method: 'PUT' }),
        );
    });
    it.each(['marked_person', 'agent_sign_in'] as const)(
        'makes only the expected first-load requests for %s',
        async (source) => {
            currentOverview.rules[0].source = source;
            renderSection();
            await screen.findByRole('button', {
                name: /^Snowflake: agents run as/,
            });
            if (source === 'agent_sign_in')
                await screen.findByRole('status', {
                    name: 'Snowflake agent sign-in verified',
                });
            const expected = [
                {
                    version: 'v2',
                    url: '/org/agent-identity',
                    method: 'GET',
                    body: undefined,
                },
                { url: '/org/projects', method: 'GET' },
            ];
            if (source === 'agent_sign_in')
                expected.push(
                    {
                        version: 'v2',
                        url: '/org/agent-identity/snowflake/verify',
                        method: 'POST',
                        body: undefined,
                    },
                    {
                        version: 'v2',
                        url: '/org/agent-identity/snowflake/setup',
                        method: 'GET',
                        body: undefined,
                    },
                );
            expect(
                mockedLightdashApi.mock.calls.map(([request]) => request),
            ).toEqual(expect.arrayContaining(expected));
            expect(sharedLightdashApi).toHaveBeenCalledTimes(expected.length);
        },
    );
    it.each(Object.entries(identityWarehouseNames))(
        'offers the ordered choices and descriptions for %s',
        async (warehouseType, name) => {
            currentOverview.rules = [
                {
                    warehouseType: warehouseType as WarehouseTypes,
                    source: 'marked_person',
                    projectsMissingAiServiceAccount: null,
                },
            ];
            renderSection();
            fireEvent.click(
                await screen.findByRole('button', {
                    name: `${name}: agents run as the person. Change.`,
                }),
            );
            const choices = within(screen.getByRole('dialog')).getAllByRole(
                'button',
            );
            expect(
                choices.map((choice) => choice.getAttribute('aria-label')),
            ).toEqual(
                warehouseType === WarehouseTypes.SNOWFLAKE
                    ? [
                          'The person',
                          "The person's agent sign-in",
                          'A shared agent account',
                      ]
                    : ['The person', 'A shared agent account'],
            );
            expect(
                screen.getByText(
                    "Gets the access of the person asking, so the warehouse can't limit agents separately.",
                ),
            ).toBeVisible();
            expect(
                screen.getByText(
                    'One account per project, added by a project admin.',
                ),
            ).toBeVisible();
            if (warehouseType === WarehouseTypes.SNOWFLAKE)
                expect(
                    screen.getByText(
                        'People sign in once, so Snowflake can limit agents.',
                    ),
                ).toBeVisible();
        },
    );
    it('shares manual verification and client-save reset between the active panel and chip', async () => {
        renderSection();
        await screen.findByRole('status', {
            name: 'Snowflake agent sign-in verified',
        });
        await openSetup();
        verification = { ...verification, passed: false };
        fireEvent.click(
            await screen.findByRole('button', { name: 'Verify integration' }),
        );
        await screen.findByRole('status', {
            name: 'Snowflake agent sign-in needs attention',
        });
        expect(
            mockedLightdashApi.mock.calls.filter(([request]) =>
                request.url.endsWith('/verify'),
            ),
        ).toHaveLength(2);
        fireEvent.click(screen.getByRole('button', { name: 'Replace client' }));
        fireEvent.change(screen.getByLabelText('Snowflake account URL'), {
            target: { value: 'https://test.snowflakecomputing.com' },
        });
        fireEvent.change(screen.getByLabelText('Client ID'), {
            target: { value: 'test-client' },
        });
        fireEvent.change(screen.getByLabelText('Client secret'), {
            target: { value: 'test-secret' },
        });
        mockedLightdashApi.mockImplementation(async (request) => {
            if (request.url.endsWith('/client'))
                return apiHandler({
                    ...request,
                    method: 'GET',
                    url: '/org/agent-identity/snowflake/setup',
                });
            if (request.url.endsWith('/verify')) return new Promise(() => {});
            return apiHandler(request);
        });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() =>
            expect(
                mockedLightdashApi.mock.calls.filter(([request]) =>
                    request.url.endsWith('/verify'),
                ),
            ).toHaveLength(3),
        );
        const chip = screen.getByRole('button', {
            name: /^Snowflake: agents run as/,
        });
        expect(within(chip).queryByRole('status')).not.toBeInTheDocument();
        expect(
            screen.queryByText('OAuth client settings · Passed'),
        ).not.toBeInTheDocument();
    });
    it('allows explicitly hiding attention setup while keeping the warning on the chip', async () => {
        verification.passed = false;
        renderSection();
        await screen.findByText('Copy and run in Snowflake');
        fireEvent.click(
            screen.getByRole('button', { name: /^Snowflake: agents run as/ }),
        );
        fireEvent.click(
            within(screen.getByRole('dialog')).getByRole('button', {
                name: 'Hide setup',
            }),
        );
        expect(
            screen.queryByText('Copy and run in Snowflake'),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole('status', {
                name: 'Snowflake agent sign-in needs attention',
            }),
        ).toBeVisible();
        await openSetup();
        expect(
            await screen.findByText('Copy and run in Snowflake'),
        ).toBeVisible();
        expect(
            mockedLightdashApi.mock.calls.filter(([request]) =>
                request.url.endsWith('/verify'),
            ),
        ).toHaveLength(1);
    });
    it.each(['failure', 'error'] as const)(
        'waits for setup before opening after verification %s without a loader',
        async (outcome) => {
            const setupRequest =
                deferred<Awaited<ReturnType<typeof apiHandler>>>();
            const verifyRequest =
                deferred<OrganizationAgentIdentitySnowflakeVerify>();
            mockedLightdashApi.mockImplementation(async (request) => {
                if (request.url.endsWith('/setup')) return setupRequest.promise;
                if (request.url.endsWith('/verify'))
                    return verifyRequest.promise;
                return apiHandler(request);
            });
            const user = userEvent.setup();
            renderSection();
            const chip = await screen.findByRole('button', {
                name: /^Snowflake: agents run as/,
            });
            await act(async () => {
                if (outcome === 'error')
                    verifyRequest.reject({ error: { message: 'Unavailable' } });
                else verifyRequest.resolve({ ...verification, passed: false });
            });
            await screen.findByRole('status', {
                name: 'Snowflake agent sign-in needs attention',
            });
            expectNoCardLoader();
            expect(
                screen.queryByText('Copy and run in Snowflake'),
            ).not.toBeInTheDocument();
            expect(
                document.querySelector(`.${classes.setup}`),
            ).toBeEmptyDOMElement();
            await user.click(chip);
            expect(
                screen.getByRole('button', { name: 'View setup' }),
            ).toBeVisible();
            expect(
                screen.queryByRole('button', { name: 'Hide setup' }),
            ).not.toBeInTheDocument();
            await user.keyboard('{Escape}');
            await act(async () =>
                setupRequest.resolve(
                    await apiHandler({
                        url: '/org/agent-identity/snowflake/setup',
                        method: 'GET',
                        body: undefined,
                    }),
                ),
            );
            expect(
                await screen.findByText('Copy and run in Snowflake'),
            ).toBeVisible();
            expectNoCardLoader();
            await user.click(chip);
            expect(
                within(screen.getByRole('dialog')).getByRole('button', {
                    name: 'Hide setup',
                }),
            ).toBeVisible();
            for (const suffix of ['/setup', '/verify'])
                expect(
                    mockedLightdashApi.mock.calls.filter(([request]) =>
                        request.url.endsWith(suffix),
                    ),
                ).toHaveLength(1);
        },
    );
    it('shows a setup error and Retry after setup fails before verification fails', async () => {
        const setupRequest = deferred<never>();
        const verifyRequest =
            deferred<OrganizationAgentIdentitySnowflakeVerify>();
        mockedLightdashApi.mockImplementation(async (request) => {
            if (request.url.endsWith('/setup')) return setupRequest.promise;
            if (request.url.endsWith('/verify')) return verifyRequest.promise;
            return apiHandler(request);
        });
        const { client } = renderSection();
        await screen.findByRole('button', {
            name: /^Snowflake: agents run as/,
        });
        await act(async () =>
            setupRequest.reject({ error: { message: 'Unavailable' } }),
        );
        await waitFor(() =>
            expect(
                client.getQueryState([
                    'ai-access',
                    'org',
                    'org',
                    'snowflake-setup',
                ])?.status,
            ).toBe('error'),
        );
        expectNoCardLoader();
        expect(
            document.querySelector(`.${classes.setup}`),
        ).toBeEmptyDOMElement();
        await act(async () =>
            verifyRequest.resolve({ ...verification, passed: false }),
        );
        expect(
            await screen.findByText('Could not load the Snowflake setup.'),
        ).toBeVisible();
        expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible();
        expectNoCardLoader();
        mockedLightdashApi.mockImplementation(apiHandler);
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(
            await screen.findByText('Copy and run in Snowflake'),
        ).toBeVisible();
        expectNoCardLoader();
        expect(
            mockedLightdashApi.mock.calls.filter(([request]) =>
                request.url.endsWith('/verify'),
            ),
        ).toHaveLength(1);
    });
    it('allows a loader when View setup is chosen before setup has loaded', async () => {
        const setupRequest = deferred<Awaited<ReturnType<typeof apiHandler>>>();
        verification.passed = false;
        mockedLightdashApi.mockImplementation(async (request) =>
            request.url.endsWith('/setup')
                ? setupRequest.promise
                : apiHandler(request),
        );
        renderSection();
        await screen.findByRole('status', {
            name: 'Snowflake agent sign-in needs attention',
        });
        expectNoCardLoader();
        await openSetup();
        expect(
            document.querySelector('.mantine-Loader-root'),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Hide setup' }),
        ).toBeVisible();
        await act(async () =>
            setupRequest.resolve(
                await apiHandler({
                    url: '/org/agent-identity/snowflake/setup',
                    method: 'GET',
                    body: undefined,
                }),
            ),
        );
        expect(
            await screen.findByText('Copy and run in Snowflake'),
        ).toBeVisible();
        expectNoCardLoader();
    });
    it('keeps a verified integration panel empty until View setup is chosen', async () => {
        const setupRequest = deferred<Awaited<ReturnType<typeof apiHandler>>>();
        mockedLightdashApi.mockImplementation(async (request) =>
            request.url.endsWith('/setup')
                ? setupRequest.promise
                : apiHandler(request),
        );
        renderSection();
        await screen.findByRole('status', {
            name: 'Snowflake agent sign-in verified',
        });
        expectNoCardLoader();
        expect(
            document.querySelector(`.${classes.setup}`),
        ).toBeEmptyDOMElement();
        await act(async () =>
            setupRequest.resolve(
                await apiHandler({
                    url: '/org/agent-identity/snowflake/setup',
                    method: 'GET',
                    body: undefined,
                }),
            ),
        );
        await waitFor(() =>
            expect(document.querySelector('.mantine-Loader-root')).toBeNull(),
        );
        expect(
            document.querySelector(`.${classes.setup}`),
        ).toBeEmptyDOMElement();
        expect(
            screen.queryByText('Copy and run in Snowflake'),
        ).not.toBeInTheDocument();
        await openSetup();
        expect(
            await screen.findByText('Copy and run in Snowflake'),
        ).toBeVisible();
        expectNoCardLoader();
    });
    it('gives the warning hover card priority over the editable chip tooltip', async () => {
        currentOverview.rules[1].projectsMissingAiServiceAccount = [
            { projectUuid: 'project', name: 'Project' },
        ];
        const user = userEvent.setup();
        renderSection(true);
        const chip = screen.getByRole('button', {
            name: /^BigQuery: agents run as/,
        });
        await user.hover(chip);
        expect(await screen.findByRole('tooltip')).toHaveTextContent(
            "BigQuery: agents run as each project's shared agent account.",
        );
        await user.hover(within(chip).getByRole('status'));
        expect(
            await screen.findByRole('region', {
                name: '1 project has no shared agent account',
            }),
        ).toBeVisible();
        await waitFor(() =>
            expect(screen.queryByRole('tooltip')).not.toBeInTheDocument(),
        );
        await user.hover(chip);
        expect(await screen.findByRole('tooltip')).toBeVisible();
        await waitFor(() =>
            expect(
                screen.queryByRole('region', {
                    name: '1 project has no shared agent account',
                }),
            ).not.toBeInTheDocument(),
        );
    });
});
