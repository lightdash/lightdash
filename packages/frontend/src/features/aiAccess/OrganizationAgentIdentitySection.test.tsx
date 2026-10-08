import {
    WarehouseTypes,
    type OrganizationAgentIdentityOverview,
} from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, waitFor } from '@testing-library/react';
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
            healthLoading: false,
            healthError: false,
        });
        vi.mocked(lightdashApi).mockResolvedValue(overview());
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
        vi.mocked(lightdashApi).mockResolvedValue(data);
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
    it.each([
        ['agent_sign_in', true, true],
        ['agent_sign_in', false, true],
        ['marked_person', true, false],
        ['marked_person', false, true],
    ] as const)(
        'shows Snowflake setup for source=%s configured=%s: %s',
        async (source, configured, visible) => {
            mocks.configured = configured;
            const data = overview();
            data.rules[0].source = source;
            vi.mocked(lightdashApi).mockResolvedValue(data);
            renderSection();
            await screen.findAllByRole('combobox');
            const missingNote = screen.queryByText(
                'Agent sign-in needs the Snowflake agent integration.',
            );
            const configuredNote = screen.queryByText(
                'The Snowflake agent integration is set up on this instance.',
            );
            const setup = screen.queryByRole('button', {
                name: 'Set up the Snowflake agent integration',
            });
            if (visible) {
                expect(
                    configured ? configuredNote : missingNote,
                ).toBeInTheDocument();
                expect(
                    configured ? missingNote : configuredNote,
                ).not.toBeInTheDocument();
                fireEvent.click(setup!);
                expect(
                    screen.getByText(/CREATE SECURITY INTEGRATION/),
                ).toHaveTextContent(
                    "OAUTH_REDIRECT_URI = 'https://instance.example/api/v1/oauth/redirect/snowflake-ai'",
                );
            } else {
                expect(missingNote).not.toBeInTheDocument();
                expect(configuredNote).not.toBeInTheDocument();
                expect(setup).not.toBeInTheDocument();
            }
        },
    );
    it('explains why the agent sign-in option is disabled', async () => {
        mocks.configured = false;
        renderSection();
        fireEvent.click(
            await screen.findByRole('combobox', {
                name: 'Snowflake agent identity',
            }),
        );
        expect(
            screen.getByRole('option', {
                name: /A separate agent sign-in for each person Needs the Snowflake agent integration/,
            }),
        ).toHaveAttribute('data-combobox-disabled', 'true');
        expect(
            screen.getByText('Needs the Snowflake agent integration'),
        ).toBeInTheDocument();
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
            vi.mocked(lightdashApi).mockResolvedValue(data);
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
            vi.mocked(lightdashApi).mockResolvedValue(data);
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
        vi.mocked(lightdashApi).mockResolvedValue(overview());
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
        expect(screen.queryByText('Agent identity')).not.toBeInTheDocument();
        expect(lightdashApi).not.toHaveBeenCalled();
    });
});
