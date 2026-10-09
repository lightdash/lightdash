import {
    WarehouseTypes,
    SNOWFLAKE_AGENT_OAUTH_SETTINGS,
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
import { renderWithProviders } from '../../testing/testUtils';
import { identityLabels } from './identityLabels';
import OrganizationAgentIdentitySection from './OrganizationAgentIdentitySection';

const mocks = vi.hoisted(() => ({
    enabled: true,
    canManage: true,
    configured: true,
    missingAccount: false,
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
const backendSql = 'CREATE SECURITY INTEGRATION BACKEND_PROVIDED;';
let verification: OrganizationAgentIdentitySnowflakeVerify;
const apiHandler = async ({
    url,
    method,
    body,
}: Parameters<typeof lightdashApi>[0]) => {
    if (url.endsWith('/setup'))
        return {
            redirectUri:
                'https://backend.example/api/v1/oauth/redirect/snowflake-ai',
            integrationSql: backendSql,
            configured: mocks.configured,
            missingSettings: mocks.missingAccount
                ? ['SNOWFLAKE_AI_OAUTH_ACCOUNT']
                : mocks.configured
                  ? []
                  : SNOWFLAKE_AGENT_OAUTH_SETTINGS.map(({ envVar }) => envVar),
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
            name: /A separate agent sign-in for each person/,
        }),
    );
};
const startUnconfigured = () => {
    mocks.configured = false;
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

describe('Organisation agent identity settings', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Object.assign(mocks, {
            enabled: true,
            canManage: true,
            configured: true,
            missingAccount: false,
            healthLoading: false,
            healthError: false,
        });
        currentOverview = overview();
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
                    detail: 'Snowflake answered (HTTP 400).',
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
    it.each([
        ['Snowflake', 'snowflake'],
        ['BigQuery', 'bigquery'],
    ])('saves only the source for %s', async (name, warehouseType) => {
        const { invalidate } = renderSection();
        await changeToMarkedPerson(name);
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
    it('selects the AI service account without a requirement field', async () => {
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
        await waitFor(() =>
            expect(lightdashApi).toHaveBeenCalledWith({
                version: 'v2',
                url: '/org/agent-identity/bigquery',
                method: 'PUT',
                body: JSON.stringify({ source: 'ai_service_account' }),
            }),
        );
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
            name: /A separate agent sign-in for each person Needs a one-time Snowflake setup/,
        });
        expect(option).not.toHaveAttribute('data-combobox-disabled', 'true');
    });
    it('keeps selection pending, renders backend SQL and enables Turn on only after verification passes', async () => {
        startUnconfigured();
        await selectAgentSignIn();
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
            screen.getByText(
                'Give the client ID and secret to your instance operator',
            ),
        ).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Turn on' })).toBeDisabled();
        expect(lightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({ method: 'PUT' }),
        );
        fireEvent.click(
            screen.getByRole('button', { name: 'Copy integration SQL' }),
        );
        expect(screen.getByLabelText('Step 1 done')).toBeInTheDocument();
        verification = {
            ...verification,
            passed: false,
            checks: verification.checks.map((check) =>
                check.id === 'oauth_client'
                    ? {
                          ...check,
                          status: 'failed',
                          detail: `Missing: ${SNOWFLAKE_AGENT_OAUTH_SETTINGS.map(({ envVar }) => envVar).join(', ')}.`,
                      }
                    : { ...check, status: 'not_checked' },
            ),
        };
        fireEvent.click(
            screen.getByRole('button', { name: 'Verify integration' }),
        );
        const failure = await screen.findByText(
            /^Missing: SNOWFLAKE_AI_OAUTH_CLIENT_ID/,
        );
        SNOWFLAKE_AGENT_OAUTH_SETTINGS.forEach(({ envVar }) =>
            expect(failure).toHaveTextContent(envVar),
        );
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
        'shows the account row only when it is missing (%s)',
        async (missingAccount) => {
            mocks.missingAccount = missingAccount;
            startUnconfigured();
            await selectAgentSignIn();
            await screen.findByText(backendSql);
            SNOWFLAKE_AGENT_OAUTH_SETTINGS.forEach(({ envVar }) =>
                expect(screen.getByText(envVar)).toBeInTheDocument(),
            );
            const accountRow = screen.queryByText('SNOWFLAKE_AI_OAUTH_ACCOUNT');
            if (missingAccount) {
                expect(accountRow).toBeInTheDocument();
                expect(
                    screen.getByText(
                        'Account (needed when the token endpoint is not on snowflakecomputing.com)',
                    ),
                ).toBeInTheDocument();
            } else {
                expect(accountRow).not.toBeInTheDocument();
            }
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
            screen.queryByText('Snowflake answered (HTTP 400).'),
        ).not.toBeInTheDocument();
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
            screen.queryByText('Snowflake answered (HTTP 400).'),
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
    it.each([1, 2, 5])(
        'lists %s missing projects with settings links and a three-name limit',
        async (count) => {
            const data = overview();
            const names = [
                'Jaffle shop',
                'Orders',
                'Sales',
                'Revenue',
                'Products',
            ];
            data.rules[1].projectsMissingAiServiceAccount = names
                .slice(0, count)
                .map((name, index) => ({
                    projectUuid: `project-${index}`,
                    name,
                }));
            currentOverview = data;
            renderSection();
            const line = await screen.findByText(
                new RegExp(
                    `${count} ${count === 1 ? 'project has' : 'projects have'} no AI service account:`,
                ),
            );
            expect(line).toHaveTextContent(
                count === 1
                    ? 'Agents are refused on it until a project admin adds one.'
                    : 'Agents are refused on them until a project admin adds one.',
            );
            names
                .slice(0, Math.min(count, 3))
                .forEach((name, index) =>
                    expect(screen.getByRole('link', { name })).toHaveAttribute(
                        'href',
                        `/generalSettings/projectManagement/project-${index}/settings`,
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
                screen.queryByText(/no AI service account:/),
            ).not.toBeInTheDocument();
        },
    );
    it('disables only the saving row', async () => {
        renderSection();
        await screen.findAllByRole('combobox');
        vi.mocked(lightdashApi).mockImplementation(() => new Promise(() => {}));
        await changeToMarkedPerson('Snowflake');
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
            screen.queryByText(/Choose who AI agents run as/),
        ).not.toBeInTheDocument();
        expect(lightdashApi).not.toHaveBeenCalled();
    });
});
