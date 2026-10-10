import {
    AgentCapability,
    AiAccessRefusalReason,
    AiAccessRefusedError,
    getAgentCapabilityName,
    OrganizationMemberRole,
    type AgentCapabilitySourceAssignment,
    type AgentPermissionCheck,
    type AgentPermissionExplanation,
} from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../api';
import { AgentAccessPreview } from './AgentAccessPreview';

vi.mock('../../api', () => ({ lightdashApi: vi.fn() }));
vi.mock('../../hooks/useProjects', () => ({
    useProjects: () => ({
        data: [
            { projectUuid: 'project', name: 'Demo project' },
            { projectUuid: 'other-project', name: 'Other project' },
        ],
    }),
}));
vi.mock('../../hooks/useOrganizationUsers', () => ({
    useOrganizationUsers: () => ({
        data: [
            {
                userUuid: 'person',
                firstName: 'Ana',
                lastName: 'Ruiz',
                email: 'ana@example.com',
            },
            {
                userUuid: 'other-person',
                firstName: '',
                lastName: '',
                email: 'person@example.com',
            },
        ],
    }),
}));
const check = (
    kind: AgentPermissionCheck['kind'],
    status: AgentPermissionCheck['status'],
    label: string,
    message: string,
): AgentPermissionCheck => ({
    id: kind,
    kind,
    status,
    label,
    message,
    capability: null,
    reason: null,
    policyLayer: null,
    settingsUrl: null,
    sourceAssignments: [],
});
const delivery = (): AgentPermissionExplanation => ({
    mode: 'managed',
    policyVersion: 1,
    actionId: 'schedule_delivery',
    result: 'refused',
    allowedByCheckedPermissionsOnly: false,
    requiredCapabilities: [
        AgentCapability.ContentWrite,
        AgentCapability.Publish,
    ],
    mainReason: new AiAccessRefusedError(
        AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
        { capability: AgentCapability.Publish, policyLayer: 'org_ceiling' },
    ).refusal,
    policyMainReason: null,
    blockers: [],
    coverage: 'checked_permissions_only',
    warehouseAccess: 'not_verified',
    connectionGrant: 'not_checked_yet',
    checks: [
        {
            ...check(
                'person_permission',
                'not_checked',
                "Person's permissions",
                'The chart is checked when the agent acts.',
            ),
            settingsUrl:
                '/generalSettings/projectManagement/project/projectAccess',
        },
        ...[AgentCapability.ContentWrite, AgentCapability.Publish].map(
            (capability) => ({
                ...check(
                    'capability',
                    capability === AgentCapability.Publish
                        ? 'refused'
                        : 'allowed',
                    getAgentCapabilityName(capability),
                    capability === AgentCapability.Publish
                        ? 'No role grants this capability.'
                        : "This person's roles grant Create and edit content to agents.",
                ),
                id: `capability:${capability}`,
                capability,
            }),
        ),
        check(
            'warehouse_confirmation',
            'not_checked',
            'Raw SQL confirmation',
            'Not needed for this action.',
        ),
        check(
            'connection_grant',
            'not_checked',
            'Connection grant',
            'Not checked yet.',
        ),
        check(
            'warehouse_access',
            'not_checked',
            'Warehouse access',
            'Warehouse access is not verified.',
        ),
    ],
});
const apiMock = vi.mocked(lightdashApi);
const renderPreview = (dirty = false, hash = '') => {
    const client = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const view = render(
        <MantineProvider env="test">
            <QueryClientProvider client={client}>
                <MemoryRouter
                    initialEntries={[`/generalSettings/agentIdentity${hash}`]}
                >
                    <AgentAccessPreview dirty={dirty} />
                </MemoryRouter>
            </QueryClientProvider>
        </MantineProvider>,
    );
    return { ...view, invalidate };
};
const pick = async (label: string, option: string) => {
    fireEvent.click(screen.getByRole('combobox', { name: label }));
    fireEvent.click(await screen.findByRole('option', { name: option }));
};
const choose = async (action = 'Schedule a delivery') => {
    await pick('Person', 'Ana Ruiz');
    await pick('Project', 'Demo project');
    await pick('Action', action);
};
const testAccess = () =>
    fireEvent.click(screen.getByRole('button', { name: 'Test' }));
beforeEach(() => {
    apiMock.mockReset().mockResolvedValue(delivery());
});
describe('Test agent access', () => {
    it('waits for Test then posts just the three selected inputs without invalidating policy', async () => {
        const { invalidate } = renderPreview();
        expect(screen.getByRole('button', { name: 'Test' })).toBeDisabled();
        await choose();
        expect(lightdashApi).not.toHaveBeenCalled();
        testAccess();
        await screen.findByText(
            'An agent cannot schedule a delivery for Ana in Demo project.',
        );
        expect(lightdashApi).toHaveBeenCalledExactlyOnceWith({
            version: 'v2',
            url: '/org/agent-permissions/explain',
            method: 'POST',
            body: JSON.stringify({
                personUuid: 'person',
                projectUuid: 'project',
                actionId: 'schedule_delivery',
            }),
        });
        expect(invalidate).not.toHaveBeenCalled();
    });
    it('renders both capability rows, the main reason and explicit exclusions with no raw keys', async () => {
        renderPreview();
        await choose();
        testAccess();
        expect(
            await screen.findByText(delivery().mainReason!.message),
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                'Needs: Create and edit content + Publish and share',
            ),
        ).toBeInTheDocument();
        expect(
            within(
                screen.getByRole('region', { name: 'Agent access result' }),
            ).getByText('Create and edit content'),
        ).toBeInTheDocument();
        expect(
            within(
                screen.getByRole('region', { name: 'Agent access result' }),
            ).getByText('Publish and share'),
        ).toBeInTheDocument();
        expect(screen.getByText("Ana's permissions")).toBeInTheDocument();
        expect(
            screen.getByText(
                "This person's roles grant Create and edit content to agents.",
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: 'Project access' }),
        ).toHaveAttribute(
            'href',
            '/generalSettings/projectManagement/project/projectAccess',
        );
        expect(
            screen.queryByText('Not needed for this action.'),
        ).not.toBeInTheDocument();
        expect(screen.queryByText('Warehouse access')).not.toBeInTheDocument();
        expect(
            screen.getByText(
                'This test runs no query and changes nothing. Warehouse access is not verified.',
            ),
        ).toBeInTheDocument();
        for (const capability of Object.values(AgentCapability)) {
            expect(
                screen.queryByText(capability, { exact: true }),
            ).not.toBeInTheDocument();
            if (capability.includes('_'))
                expect(document.body.textContent).not.toContain(capability);
        }
        expect(
            screen
                .getByText(
                    'An agent cannot schedule a delivery for Ana in Demo project.',
                )
                .closest('[aria-live]'),
        ).toHaveAttribute('aria-live', 'polite');
    });
    it('uses a plain capability name in the summary when testing a capability', async () => {
        renderPreview();
        await choose('Raw SQL');
        testAccess();
        expect(
            await screen.findByText(
                'An agent cannot use Raw SQL for Ana in Demo project.',
            ),
        ).toBeInTheDocument();
    });

    it('does not hide a refused or setup-needed row with not-needed copy', async () => {
        apiMock.mockResolvedValue({
            ...delivery(),
            checks: [
                {
                    ...check(
                        'agent_enabled',
                        'refused',
                        'Agents',
                        'Not needed for this action.',
                    ),
                    settingsUrl: '/generalSettings/mcp/general',
                },
                check(
                    'warehouse_confirmation',
                    'setup_needed',
                    'Warehouse confirmation',
                    'Not needed for this action.',
                ),
            ],
        });
        renderPreview();
        await choose();
        testAccess();
        expect(
            await screen.findByRole('link', { name: 'MCP settings' }),
        ).toHaveAttribute('href', '/generalSettings/mcp/general');
        expect(screen.getByText('Warehouse confirmation')).toBeInTheDocument();
    });

    it('shows setup needed and the warehouse confirmation link', async () => {
        const result = delivery();
        result.result = 'setup_needed';
        result.actionId = 'run_raw_sql';
        result.requiredCapabilities = [AgentCapability.RawSql];
        result.mainReason = new AiAccessRefusedError(
            AiAccessRefusalReason.AGENT_RAW_SQL_UNCONFIRMED,
        ).refusal;
        result.checks = [
            {
                ...check(
                    'warehouse_confirmation',
                    'setup_needed',
                    'Raw SQL confirmation',
                    'Not confirmed for the current connection.',
                ),
                settingsUrl:
                    '/generalSettings/projectManagement/project/agentIdentity',
            },
        ];
        apiMock.mockResolvedValue(result);
        renderPreview();
        await choose('Run raw SQL');
        testAccess();
        expect(
            await screen.findByText(
                'An agent cannot run raw SQL for Ana in Demo project yet.',
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('heading', { name: 'Warehouse' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: 'Confirm in Identity' }),
        ).toHaveAttribute(
            'href',
            '/generalSettings/projectManagement/project/agentIdentity',
        );
        expect(screen.getAllByText('Setup needed')).toHaveLength(2);
    });
    it('renders legacy notice without capability requirements or rows', async () => {
        apiMock.mockResolvedValue({
            ...delivery(),
            mode: 'legacy',
            result: 'not_checked',
            mainReason: null,
            requiredCapabilities: [],
            checks: [delivery().checks[0]],
        });
        renderPreview();
        await choose();
        testAccess();
        expect(
            await screen.findByText(
                "Limits are off. Agents follow each person's permissions.",
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                'Turn on "Limit what agents can do" to set agent capabilities. Other agent settings still apply.',
            ),
        ).toBeInTheDocument();
        expect(
            within(
                screen.getByRole('region', { name: 'Agent access result' }),
            ).queryByText('Publish and share'),
        ).not.toBeInTheDocument();
        expect(screen.queryByText(/^Needs:/)).not.toBeInTheDocument();
    });
    it.each(['allowed', 'not_checked'] as const)(
        'qualifies an allowed result when the person check is %s',
        async (status) => {
            const result = delivery();
            apiMock.mockResolvedValue({
                ...result,
                result: 'allowed',
                allowedByCheckedPermissionsOnly: true,
                mainReason: null,
                checks: [{ ...result.checks[0], status }],
            });
            renderPreview();
            await choose();
            testAccess();
            expect(
                await screen.findByText('Allowed by checked permissions.'),
            ).toBeInTheDocument();
        },
    );
    it('uses the person reason when that is the only refusal', async () => {
        apiMock.mockResolvedValue({
            ...delivery(),
            mainReason: null,
            checks: [
                check(
                    'person_permission',
                    'refused',
                    "Person's permissions",
                    'This person cannot use SQL Runner here.',
                ),
            ],
        });
        renderPreview();
        await choose();
        testAccess();
        await screen.findByText(
            'An agent cannot schedule a delivery for Ana in Demo project.',
        );
        expect(
            screen.getAllByText('This person cannot use SQL Runner here.'),
        ).toHaveLength(2);
    });
    it.each([
        ['Person', 'person@example.com'],
        ['Project', 'Other project'],
        ['Action', 'Run raw SQL'],
    ])('clears the old result when %s changes', async (label, option) => {
        renderPreview();
        await choose();
        testAccess();
        await screen.findByText(delivery().mainReason!.message);
        await pick(label, option);
        expect(
            screen.queryByText(delivery().mainReason!.message),
        ).not.toBeInTheDocument();
        expect(lightdashApi).toHaveBeenCalledTimes(1);
    });
    it('shows saved-permissions copy for a dirty form', () => {
        renderPreview(true);
        expect(
            screen.getByText(
                'This test uses saved permissions. Save your changes to test them.',
            ),
        ).toBeInTheDocument();
    });
    it('keeps selections while loading and discards a late result after input changes', async () => {
        let finish!: (value: AgentPermissionExplanation) => void;
        apiMock.mockImplementation(
            () =>
                new Promise((resolve) => {
                    finish = resolve;
                }),
        );
        renderPreview();
        await choose();
        testAccess();
        expect(await screen.findByRole('status')).toHaveTextContent(
            'Checking saved permissions…',
        );
        expect(screen.getByRole('combobox', { name: 'Person' })).toHaveValue(
            'Ana Ruiz',
        );
        await pick('Person', 'person@example.com');
        await act(async () => finish(delivery()));
        expect(
            screen.queryByText(delivery().mainReason!.message),
        ).not.toBeInTheDocument();
    });
    it('shows an inline error and retries the same selections', async () => {
        apiMock.mockRejectedValueOnce({
            error: {
                message: 'The selected person or project is not available.',
            },
        });
        renderPreview();
        await choose();
        testAccess();
        expect(
            await screen.findByText('Could not test agent access.'),
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                'The selected person or project is not available.',
            ),
        ).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        await screen.findByText(delivery().mainReason!.message);
        expect(apiMock).toHaveBeenCalledTimes(2);
        expect(apiMock.mock.calls[1]).toEqual(apiMock.mock.calls[0]);
    });
    it('scrolls to the panel when it mounts after async loading with the hash', () => {
        const scroll = vi.spyOn(HTMLElement.prototype, 'scrollIntoView');
        renderPreview(false, '#test-agent-access');
        expect(document.getElementById('test-agent-access')).toContainElement(
            screen.getByRole('heading', { name: 'Test agent access' }),
        );
        expect(scroll).toHaveBeenCalled();
        scroll.mockRestore();
    });
});

const grantingSources: {
    source: AgentCapabilitySourceAssignment;
    label: string;
}[] = [
    ...Object.values(OrganizationMemberRole).map((role) => ({
        source: {
            role: { kind: 'system' as const, role },
            assignment: 'organization' as const,
            projectUuid: null,
            groupUuid: null,
        },
        label: `Granted by ${{ member: 'Member', viewer: 'Viewer', interactive_viewer: 'Interactive viewer', editor: 'Editor', developer: 'Developer', admin: 'Admin' }[role]} (organization role)`,
    })),
    {
        source: {
            role: { kind: 'system', role: OrganizationMemberRole.EDITOR },
            assignment: 'project_user',
            projectUuid: 'private-project-uuid',
            groupUuid: null,
        },
        label: 'Granted by Editor (project role)',
    },
    {
        source: {
            role: {
                kind: 'custom',
                roleUuid: 'private-role-uuid',
                name: 'Analyst',
            },
            assignment: 'project_group',
            projectUuid: 'private-project-uuid',
            groupUuid: 'private-group-uuid',
        },
        label: 'Granted by Analyst (custom role, project group)',
    },
    {
        source: {
            role: {
                kind: 'custom',
                roleUuid: 'private-extra-role-uuid',
                name: null,
            },
            assignment: 'extra_organization',
            projectUuid: null,
            groupUuid: null,
        },
        label: 'Granted by a custom role (custom role, additional organization role)',
    },
];

it('lists every granting role source with plain names and assignment descriptions', async () => {
    const result = delivery();
    result.checks = result.checks.map((row) =>
        row.capability === AgentCapability.ContentWrite
            ? {
                  ...row,
                  sourceAssignments: grantingSources.map(
                      ({ source }) => source,
                  ),
              }
            : row,
    );
    apiMock.mockResolvedValue(result);
    renderPreview();
    await choose();
    testAccess();
    await screen.findByRole('region', { name: 'Agent access result' });
    for (const { label } of grantingSources) {
        expect(screen.getByText(label)).toBeInTheDocument();
    }
    const region = screen.getByRole('region', { name: 'Agent access result' });
    expect(region).not.toHaveTextContent(
        /private-.*-uuid|interactive_viewer|project_user|project_group|extra_organization/,
    );
});

it.each(['refused', 'not_checked', 'setup_needed'] as const)(
    'does not describe %s capabilities as grants',
    async (status) => {
        const result = delivery();
        result.checks = [
            {
                ...result.checks[1],
                status,
                sourceAssignments: grantingSources.map(({ source }) => source),
            },
        ];
        apiMock.mockResolvedValue(result);
        renderPreview();
        await choose();
        testAccess();
        await screen.findByRole('region', { name: 'Agent access result' });
        expect(screen.queryByText(/^Granted by/)).not.toBeInTheDocument();
    },
);
