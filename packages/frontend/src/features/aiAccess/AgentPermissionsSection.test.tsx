import {
    AGENT_CAPABILITY_DEFAULTS,
    AGENT_PILOT_CAPABILITIES,
    AgentCapability,
    OrganizationMemberRole,
    type AgentSystemRoleMatrix,
    type AgentCapabilityPolicy,
} from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../api';
import { AgentPermissionsSection } from './AgentPermissionsSection';

const mocks = vi.hoisted(() => ({
    enabled: true,
    canManage: true,
    errorToast: vi.fn(),
}));
vi.mock('../../api', () => ({ lightdashApi: vi.fn() }));
vi.mock('../../providers/App/useApp', () => ({
    default: () => ({
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
        showToastSuccess: vi.fn(),
        showToastApiError: mocks.errorToast,
    }),
}));
vi.mock('../../hooks/useProjects', () => ({
    useProjects: () => ({ data: [{ projectUuid: 'project', name: 'Sales' }] }),
}));
vi.mock('../../hooks/useOrganizationUsers', () => ({
    useOrganizationUsers: () => ({
        data: [
            {
                userUuid: 'person',
                firstName: 'Sam',
                lastName: 'Smith',
                email: 'sam@example.com',
            },
        ],
    }),
}));
const matrix = (capabilities: readonly AgentCapability[]) =>
    Object.fromEntries(
        Object.values(OrganizationMemberRole).map((role) => [
            role,
            [...capabilities],
        ]),
    ) as AgentSystemRoleMatrix;
const legacy = () => ({
    mode: 'legacy' as 'legacy' | 'managed',
    version: 0,
    allowedProjectUuids: null as string[] | null,
    allowedUserUuids: null as string[] | null,
    systemRoleMatrix: matrix([]),
    defaults: matrix(AGENT_CAPABILITY_DEFAULTS),
    pilotPreset: {
        description: 'Pilot limits',
        systemRoleMatrix: matrix(AGENT_PILOT_CAPABILITIES),
    },
});
let policy = legacy();
const renderSection = () => {
    const client = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });
    render(
        <MantineProvider env="test">
            <QueryClientProvider client={client}>
                <AgentPermissionsSection />
            </QueryClientProvider>
        </MantineProvider>,
    );
    return client;
};
const apiMock = vi.mocked(lightdashApi);
const mutations = () =>
    apiMock.mock.calls.filter(([request]) => request.method !== 'GET');
const save = async () =>
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }));
const enableLimits = async () => {
    const toggle = await screen.findByRole('switch', {
        name: 'Limit what agents can do',
    });
    if (!(toggle as HTMLInputElement).checked) fireEvent.click(toggle);
};
const pick = async (label: string, option: string) => {
    fireEvent.click(screen.getByRole('combobox', { name: label }));
    fireEvent.click(await screen.findByRole('option', { name: option }));
};
beforeEach(() => {
    vi.clearAllMocks();
    mocks.enabled = true;
    mocks.canManage = true;
    policy = legacy();
    vi.mocked(lightdashApi).mockImplementation(async (request) => {
        if (request.method !== 'GET') {
            policy = {
                ...policy,
                ...(request.body ? JSON.parse(String(request.body)) : {}),
                mode: request.url.endsWith('/reset') ? 'legacy' : 'managed',
                version: policy.version + 1,
            };
            if (request.url.endsWith('/pilot-preset'))
                policy.systemRoleMatrix = policy.pilotPreset.systemRoleMatrix;
        }
        return policy;
    });
});
describe('Agent permissions', () => {
    it('shows the backend starting limits in legacy before saving', async () => {
        renderSection();
        expect(
            await screen.findByText("Agents follow each person's permissions."),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('checkbox', { name: 'Admin: Raw SQL' }),
        ).not.toBeInTheDocument();
        await enableLimits();
        expect(
            screen.getByText('Not saved yet — these are the starting limits.'),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('checkbox', { name: 'Admin: Raw SQL' }),
        ).toBeChecked();
        expect(
            screen.getByRole('checkbox', { name: 'Member: Delete content' }),
        ).not.toBeChecked();
        expect(mutations()).toHaveLength(0);
        await save();
        await waitFor(() =>
            expect(mutations()[0]?.[0]).toMatchObject({
                version: 'v2',
                url: '/org/agent-permissions',
                method: 'PUT',
                body: JSON.stringify({
                    version: 0,
                    systemRoleMatrix: policy.defaults,
                    allowedProjectUuids: null,
                    allowedUserUuids: null,
                }),
            }),
        );
        expect(
            screen.getByRole('switch', { name: 'Limit what agents can do' }),
        ).toBeChecked();
        expect(
            screen.queryByText(
                'Not saved yet — these are the starting limits.',
            ),
        ).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });
    it('saves matrix edits, selected projects and named people', async () => {
        renderSection();
        await screen.findByText('Permissions');
        await enableLimits();
        fireEvent.click(
            screen.getByRole('checkbox', { name: 'Admin: Delete content' }),
        );
        fireEvent.click(
            screen.getByRole('radio', { name: 'Only these projects' }),
        );
        await pick('Projects', 'Sales');
        fireEvent.click(
            screen.getByRole('radio', { name: 'Only these people' }),
        );
        await pick('People', 'Sam Smith (sam@example.com)');
        await save();
        await waitFor(() => expect(mutations()).toHaveLength(1));
        const payload = JSON.parse(String(mutations()[0][0].body));
        expect(payload).toEqual({
            version: 0,
            systemRoleMatrix: {
                ...matrix(AGENT_CAPABILITY_DEFAULTS),
                admin: [...AGENT_CAPABILITY_DEFAULTS, AgentCapability.Delete],
            },
            allowedProjectUuids: ['project'],
            allowedUserUuids: ['person'],
        });
    });
    it('requires confirmation for no people; cancel restores the saved list and saves nothing', async () => {
        policy = {
            ...legacy(),
            mode: 'managed',
            allowedUserUuids: ['person'],
            systemRoleMatrix: matrix(AGENT_CAPABILITY_DEFAULTS),
        };
        renderSection();
        await screen.findByText('Permissions');
        await enableLimits();
        await userEvent
            .setup()
            .click(screen.getByRole('combobox', { name: 'People' }));
        await userEvent.setup().keyboard('{Backspace}');
        await waitFor(() =>
            expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled(),
        );
        await save();
        const dialog = await screen.findByRole('dialog', {
            name: "No one's agents can run",
        });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
        expect(mutations()).toHaveLength(0);
        expect(
            screen.getAllByText('Sam Smith (sam@example.com)')[0],
        ).toBeInTheDocument();
        await userEvent
            .setup()
            .click(screen.getByRole('combobox', { name: 'People' }));
        await userEvent.setup().keyboard('{Backspace}');
        await waitFor(() =>
            expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled(),
        );
        await save();
        fireEvent.click(
            within(
                await screen.findByRole('dialog', {
                    name: "No one's agents can run",
                }),
            ).getByRole('button', {
                name: 'Confirm',
            }),
        );
        await waitFor(() => expect(mutations()).toHaveLength(1));
        expect(
            JSON.parse(String(mutations()[0][0].body)).allowedUserUuids,
        ).toEqual([]);
    });
    it('saves null when switching back to Everyone the roles allow', async () => {
        policy.allowedUserUuids = ['person'];
        renderSection();
        await screen.findByText('Permissions');
        await enableLimits();
        fireEvent.click(
            screen.getByRole('radio', { name: 'Everyone the roles allow' }),
        );
        await save();
        await waitFor(() => expect(mutations()).toHaveLength(1));
        expect(
            JSON.parse(String(mutations()[0][0].body)).allowedUserUuids,
        ).toBeNull();
    });
    it('previews the pilot changes by role and applies the selected projects and people', async () => {
        renderSection();
        await enableLimits();
        fireEvent.click(
            await screen.findByRole('button', {
                name: 'Apply restricted pilot preset',
            }),
        );
        await pick('Pilot projects', 'Sales');
        await pick('Pilot people', 'Sam Smith (sam@example.com)');
        const dialog = screen.getByRole('dialog');
        expect(
            within(dialog).getByRole('row', { name: /Admin/ }),
        ).toHaveTextContent('Raw SQL');
        expect(
            within(dialog).getByRole('columnheader', { name: 'Turn off' }),
        ).toBeInTheDocument();
        fireEvent.click(within(dialog).getByRole('button', { name: 'Apply' }));
        await waitFor(() =>
            expect(mutations()[0]?.[0]).toMatchObject({
                url: '/org/agent-permissions/pilot-preset',
                method: 'POST',
                body: JSON.stringify({
                    version: 0,
                    allowedProjectUuids: ['project'],
                    allowedUserUuids: ['person'],
                }),
            }),
        );
    });
    it('confirms an empty pilot list before applying the preset', async () => {
        renderSection();
        await enableLimits();
        fireEvent.click(
            await screen.findByRole('button', {
                name: 'Apply restricted pilot preset',
            }),
        );
        await pick('Pilot projects', 'Sales');
        fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
        const dialog = await screen.findByRole('dialog', {
            name: "No one's agents can run",
        });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
        expect(mutations()).toHaveLength(0);
        fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
        fireEvent.click(
            within(
                await screen.findByRole('dialog', {
                    name: "No one's agents can run",
                }),
            ).getByRole('button', {
                name: 'Confirm',
            }),
        );
        await waitFor(() => expect(mutations()).toHaveLength(1));
        expect(
            JSON.parse(String(mutations()[0][0].body)).allowedUserUuids,
        ).toEqual([]);
    });
    it('confirms turning off limits', async () => {
        policy.mode = 'managed';
        renderSection();
        fireEvent.click(
            await screen.findByRole('switch', {
                name: 'Limit what agents can do',
            }),
        );
        fireEvent.click(
            within(screen.getByRole('dialog')).getByRole('button', {
                name: 'Cancel',
            }),
        );
        expect(mutations()).toHaveLength(0);
        expect(
            screen.getByRole('switch', { name: 'Limit what agents can do' }),
        ).toBeChecked();
        fireEvent.click(
            screen.getByRole('switch', { name: 'Limit what agents can do' }),
        );
        fireEvent.click(
            within(screen.getByRole('dialog')).getByRole('button', {
                name: 'Turn off limits',
            }),
        );
        await waitFor(() =>
            expect(mutations()[0]?.[0]).toMatchObject({
                url: '/org/agent-permissions/reset',
                method: 'POST',
                body: JSON.stringify({ version: 0 }),
            }),
        );
        await waitFor(() =>
            expect(
                screen.getByRole('switch', {
                    name: 'Limit what agents can do',
                }),
            ).not.toBeChecked(),
        );
    });
    it('keeps edits on refetch and reports server errors', async () => {
        const client = renderSection();
        await screen.findByText('Permissions');
        await enableLimits();
        fireEvent.click(
            screen.getByRole('checkbox', { name: 'Admin: Delete content' }),
        );
        await act(() => client.invalidateQueries(['ai-access']));
        expect(
            screen.getByRole('checkbox', { name: 'Admin: Delete content' }),
        ).toBeChecked();
        vi.mocked(lightdashApi).mockRejectedValue({
            error: { message: 'People must belong to this organization' },
        });
        await act(() => client.invalidateQueries(['ai-access']));
        expect(
            screen.getByRole('checkbox', { name: 'Admin: Delete content' }),
        ).toBeChecked();
        await save();
        await waitFor(() =>
            expect(mocks.errorToast).toHaveBeenCalledWith(
                expect.objectContaining({
                    apiError: {
                        message: 'People must belong to this organization',
                    },
                }),
            ),
        );
    });
    it('disables edits and repeat saves while a save is in progress', async () => {
        renderSection();
        await screen.findByText('Permissions');
        await enableLimits();
        let finishSave: (value: AgentCapabilityPolicy) => void = () => {};
        vi.mocked(lightdashApi).mockImplementationOnce(
            () =>
                new Promise<AgentCapabilityPolicy>((resolve) => {
                    finishSave = resolve;
                }),
        );
        await save();
        await waitFor(() =>
            expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled(),
        );
        expect(
            screen.getByRole('checkbox', { name: 'Admin: Raw SQL' }),
        ).toBeDisabled();
        expect(
            screen.getByRole('radio', { name: 'Only these people' }),
        ).toBeDisabled();
        await act(async () => {
            finishSave({ ...policy, mode: 'managed', version: 1 });
        });
    });
    it('discards the starting draft when switched off before saving', async () => {
        renderSection();
        await enableLimits();
        fireEvent.click(
            screen.getByRole('checkbox', { name: 'Admin: Delete content' }),
        );
        fireEvent.click(
            screen.getByRole('switch', { name: 'Limit what agents can do' }),
        );
        expect(
            screen.queryByRole('checkbox', { name: 'Admin: Delete content' }),
        ).not.toBeInTheDocument();
        expect(mutations()).toHaveLength(0);
        await enableLimits();
        expect(
            screen.getByRole('checkbox', { name: 'Admin: Delete content' }),
        ).not.toBeChecked();
    });
    it('adopts a newer policy and baseline when the form is clean', async () => {
        policy = { ...legacy(), mode: 'managed', version: 1 };
        const client = renderSection();
        await screen.findByText('Permissions');
        policy = {
            ...policy,
            version: 2,
            allowedUserUuids: ['person'],
            systemRoleMatrix: matrix([AgentCapability.Query]),
        };
        await act(() => client.invalidateQueries(['ai-access']));
        await waitFor(() =>
            expect(
                screen.getByRole('radio', { name: 'Only these people' }),
            ).toBeChecked(),
        );
        expect(
            screen.getByRole('checkbox', { name: 'Admin: Query data' }),
        ).toBeChecked();
        expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
        fireEvent.click(
            screen.getByRole('checkbox', { name: 'Admin: Delete content' }),
        );
        await save();
        await waitFor(() => expect(mutations()).toHaveLength(1));
        expect(JSON.parse(String(mutations()[0][0].body))).toMatchObject({
            version: 2,
            allowedUserUuids: ['person'],
        });
    });
    it('blocks a dirty draft on a newer version and reload discards it', async () => {
        policy = { ...legacy(), mode: 'managed', version: 1 };
        const client = renderSection();
        await screen.findByText('Permissions');
        fireEvent.click(
            screen.getByRole('checkbox', { name: 'Admin: Delete content' }),
        );
        policy = { ...policy, version: 2, allowedUserUuids: [] };
        await act(() => client.invalidateQueries(['ai-access']));
        expect(
            await screen.findByText('Agent permissions changed'),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('checkbox', { name: 'Admin: Delete content' }),
        ).toBeChecked();
        expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
        expect(
            screen.getByRole('button', {
                name: 'Apply restricted pilot preset',
            }),
        ).toBeDisabled();
        expect(mutations()).toHaveLength(0);
        fireEvent.click(screen.getByRole('button', { name: 'Reload latest' }));
        expect(
            screen.queryByText('Agent permissions changed'),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole('checkbox', { name: 'Admin: Delete content' }),
        ).not.toBeChecked();
        await waitFor(() =>
            expect(
                screen.getByRole('radio', { name: 'Only these people' }),
            ).toBeChecked(),
        );
        expect(screen.getByRole('combobox', { name: 'People' })).toHaveValue(
            '',
        );
        fireEvent.click(
            screen.getByRole('checkbox', { name: 'Admin: Query data' }),
        );
        await save();
        expect(
            await screen.findByRole('dialog', {
                name: "No one's agents can run",
            }),
        ).toBeInTheDocument();
        expect(mutations()).toHaveLength(0);
    });
    it.each(['flag', 'permission'])('hides controls without %s', (gate) => {
        mocks.enabled = gate !== 'flag';
        mocks.canManage = gate !== 'permission';
        renderSection();
        expect(screen.queryByText('Permissions')).not.toBeInTheDocument();
        expect(lightdashApi).not.toHaveBeenCalled();
    });
});
