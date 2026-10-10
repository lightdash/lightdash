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
        description: 'Restricted capabilities',
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
    apiMock.mockReset();
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
        expect(screen.getByText('Who can use agents')).toBeInTheDocument();
        expect(screen.getByText('Allowed projects')).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: /preset/i }),
        ).not.toBeInTheDocument();
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
        expect(
            screen.queryByText('Agent permissions changed'),
        ).not.toBeInTheDocument();
        expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
    });
    it('starts from all projects and everyone after limits were turned off', async () => {
        policy = {
            ...legacy(),
            allowedProjectUuids: ['project'],
            allowedUserUuids: ['person'],
        };
        renderSection();
        await enableLimits();
        expect(
            screen.getByRole('radio', { name: 'All projects' }),
        ).toBeChecked();
        expect(
            screen.getByRole('radio', { name: 'Everyone the roles allow' }),
        ).toBeChecked();
        await save();
        await waitFor(() =>
            expect(mutations()[0]?.[0]).toMatchObject({
                method: 'PUT',
                body: JSON.stringify({
                    version: 0,
                    systemRoleMatrix: policy.defaults,
                    allowedProjectUuids: null,
                    allowedUserUuids: null,
                }),
            }),
        );
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
        await waitFor(() =>
            expect(
                screen.queryByText('Unsaved changes'),
            ).not.toBeInTheDocument(),
        );
        expect(
            screen.queryByText('Agent permissions changed'),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole('checkbox', { name: 'Admin: Delete content' }),
        ).toBeChecked();
        expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
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
    it('confirms turning off limits and discards dirty edits without a conflict', async () => {
        policy.mode = 'managed';
        renderSection();
        fireEvent.click(
            await screen.findByRole('checkbox', {
                name: 'Admin: Delete content',
            }),
        );
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
        expect(
            screen.queryByText('Agent permissions changed'),
        ).not.toBeInTheDocument();
        expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
        expect(
            screen.queryByRole('checkbox', { name: 'Admin: Delete content' }),
        ).not.toBeInTheDocument();
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
    it('shows no conflict when a refetch of its own pending save lands first', async () => {
        policy = { ...legacy(), mode: 'managed', version: 1 };
        const client = renderSection();
        await screen.findByText('Permissions');
        fireEvent.click(
            screen.getByRole('checkbox', { name: 'Admin: Delete content' }),
        );
        let finish: (value: typeof policy) => void = () => undefined;
        const respond = apiMock.getMockImplementation()!;
        apiMock.mockImplementation(async (request) => {
            if (request.method !== 'PUT') return respond(request);
            policy = {
                ...policy,
                ...JSON.parse(String(request.body)),
                mode: 'managed',
                version: policy.version + 1,
            };
            return new Promise((resolve) => {
                finish = resolve;
            });
        });
        await save();
        await waitFor(() => expect(mutations()).toHaveLength(1));
        await act(() => client.invalidateQueries(['ai-access']));
        await waitFor(() =>
            expect(
                apiMock.mock.calls.filter(
                    ([request]) => request.method === 'GET',
                ).length,
            ).toBeGreaterThan(1),
        );
        expect(
            screen.queryByText('Agent permissions changed'),
        ).not.toBeInTheDocument();
        await act(async () => finish(policy));
        await waitFor(() =>
            expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled(),
        );
        expect(
            screen.queryByText('Agent permissions changed'),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole('checkbox', { name: 'Admin: Delete content' }),
        ).toBeChecked();
    });

    it.each(['save', 'reset'])(
        'reloads after a stale save so the next %s uses the fresh version',
        async (nextAction) => {
            policy = { ...legacy(), mode: 'managed', version: 1 };
            renderSection();
            fireEvent.click(
                await screen.findByRole('checkbox', {
                    name: 'Admin: Delete content',
                }),
            );
            const conflictError = {
                error: {
                    message:
                        'Agent permissions changed. Reload the latest permissions before saving.',
                },
            };
            policy = { ...policy, version: 2, allowedUserUuids: ['person'] };
            apiMock.mockRejectedValueOnce(conflictError);
            await save();
            expect(
                await screen.findByText('Agent permissions changed'),
            ).toBeInTheDocument();
            expect(
                screen.getByText(
                    'Someone changed the saved permissions. Reload the latest permissions before making more changes. This will discard your unsaved changes.',
                ),
            ).toBeInTheDocument();
            expect(mocks.errorToast).toHaveBeenCalledExactlyOnceWith({
                title: 'Could not save agent permissions.',
                apiError: conflictError.error,
            });
            expect(JSON.parse(String(mutations()[0][0].body)).version).toBe(1);
            expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
            policy = {
                ...policy,
                version: 3,
                allowedProjectUuids: ['project'],
            };
            fireEvent.click(
                screen.getByRole('button', { name: 'Reload latest' }),
            );
            await waitFor(() =>
                expect(
                    screen.queryByText('Agent permissions changed'),
                ).not.toBeInTheDocument(),
            );
            expect(
                screen.getByRole('checkbox', { name: 'Admin: Delete content' }),
            ).not.toBeChecked();
            expect(
                screen.getByRole('radio', { name: 'Only these projects' }),
            ).toBeChecked();
            expect(
                screen.getByRole('radio', { name: 'Only these people' }),
            ).toBeChecked();
            expect(
                screen.queryByText('Unsaved changes'),
            ).not.toBeInTheDocument();
            fireEvent.click(
                screen.getByRole('checkbox', { name: 'Admin: Delete content' }),
            );
            if (nextAction === 'save') {
                await save();
            } else {
                fireEvent.click(
                    screen.getByRole('button', { name: 'Discard changes' }),
                );
                fireEvent.click(
                    screen.getByRole('switch', {
                        name: 'Limit what agents can do',
                    }),
                );
                fireEvent.click(
                    within(screen.getByRole('dialog')).getByRole('button', {
                        name: 'Turn off limits',
                    }),
                );
            }
            await waitFor(() => expect(mutations()).toHaveLength(2));
            expect(JSON.parse(String(mutations()[1][0].body)).version).toBe(3);
            await waitFor(() =>
                expect(
                    screen.queryByText('Unsaved changes'),
                ).not.toBeInTheDocument(),
            );
            if (nextAction === 'reset') {
                await waitFor(() =>
                    expect(
                        screen.getByRole('switch', {
                            name: 'Limit what agents can do',
                        }),
                    ).not.toBeChecked(),
                );
            }
            expect(mocks.errorToast).toHaveBeenCalledTimes(1);
        },
    );

    it('turns off limits with the fresh version after a stale save and discard', async () => {
        policy = { ...legacy(), mode: 'managed', version: 1 };
        renderSection();
        fireEvent.click(
            await screen.findByRole('checkbox', {
                name: 'Admin: Delete content',
            }),
        );
        policy = { ...policy, version: 2, allowedUserUuids: ['person'] };
        apiMock.mockRejectedValueOnce({ error: { message: 'Conflict' } });
        await save();
        expect(
            await screen.findByText('Agent permissions changed'),
        ).toBeInTheDocument();
        expect(JSON.parse(String(mutations()[0][0].body)).version).toBe(1);
        fireEvent.click(
            screen.getByRole('button', { name: 'Discard changes' }),
        );
        const toggle = screen.getByRole('switch', {
            name: 'Limit what agents can do',
        });
        expect(toggle).toBeEnabled();
        expect(
            screen.queryByText('Agent permissions changed'),
        ).not.toBeInTheDocument();
        expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
        expect(
            screen.getByRole('radio', { name: 'Only these people' }),
        ).toBeChecked();
        fireEvent.click(toggle);
        fireEvent.click(
            within(screen.getByRole('dialog')).getByRole('button', {
                name: 'Turn off limits',
            }),
        );
        await waitFor(() => expect(toggle).not.toBeChecked());
        expect(mutations()).toHaveLength(2);
        expect(mutations()[1][0]).toMatchObject({
            url: '/org/agent-permissions/reset',
            method: 'POST',
            body: JSON.stringify({ version: 2 }),
        });
        expect(mocks.errorToast).toHaveBeenCalledExactlyOnceWith({
            title: 'Could not save agent permissions.',
            apiError: { message: 'Conflict' },
        });
    });

    it('shows a conflict after a stale reset of a clean form and closes the modal on reload', async () => {
        policy = { ...legacy(), mode: 'managed', version: 1 };
        renderSection();
        fireEvent.click(
            await screen.findByRole('switch', {
                name: 'Limit what agents can do',
            }),
        );
        policy = { ...policy, version: 2 };
        apiMock.mockRejectedValueOnce({ error: { message: 'Conflict' } });
        fireEvent.click(
            within(screen.getByRole('dialog')).getByRole('button', {
                name: 'Turn off limits',
            }),
        );
        expect(
            await screen.findByText('Agent permissions changed'),
        ).toBeInTheDocument();
        expect(mocks.errorToast).toHaveBeenCalledExactlyOnceWith({
            title: 'Could not turn off limits.',
            apiError: { message: 'Conflict' },
        });
        expect(
            screen.getByText(
                'Someone changed the saved permissions. Reload the latest permissions before making more changes.',
            ),
        ).toBeInTheDocument();
        expect(
            screen.queryByText(/This will discard your unsaved changes\./),
        ).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Reload latest' }));
        await waitFor(() =>
            expect(
                screen.queryByText('Agent permissions changed'),
            ).not.toBeInTheDocument(),
        );
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        fireEvent.click(
            screen.getByRole('switch', { name: 'Limit what agents can do' }),
        );
        fireEvent.click(
            within(screen.getByRole('dialog')).getByRole('button', {
                name: 'Turn off limits',
            }),
        );
        await waitFor(() =>
            expect(
                screen.getByRole('switch', {
                    name: 'Limit what agents can do',
                }),
            ).not.toBeChecked(),
        );
        expect(JSON.parse(String(mutations()[1][0].body))).toEqual({
            version: 2,
        });
    });

    it('keeps edits without a conflict when a failed save refetches the same version', async () => {
        policy = { ...legacy(), mode: 'managed', version: 1 };
        renderSection();
        fireEvent.click(
            await screen.findByRole('checkbox', {
                name: 'Admin: Delete content',
            }),
        );
        apiMock.mockRejectedValueOnce({ error: { message: 'Save failed' } });
        await save();
        await waitFor(() =>
            expect(
                apiMock.mock.calls.filter(
                    ([request]) => request.method === 'GET',
                ),
            ).toHaveLength(2),
        );
        await waitFor(() =>
            expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled(),
        );
        expect(
            screen.queryByText('Agent permissions changed'),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole('checkbox', { name: 'Admin: Delete content' }),
        ).toBeChecked();
        expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
        expect(mocks.errorToast).toHaveBeenCalledExactlyOnceWith({
            title: 'Could not save agent permissions.',
            apiError: { message: 'Save failed' },
        });
    });

    it('recovers controls and keeps edits when the automatic reload fails, then retries save', async () => {
        policy = { ...legacy(), mode: 'managed', version: 1 };
        renderSection();
        const checkbox = await screen.findByRole('checkbox', {
            name: 'Admin: Delete content',
        });
        fireEvent.click(checkbox);
        let failReload: (error: unknown) => void = () => {};
        apiMock.mockRejectedValueOnce({ error: { message: 'Save failed' } });
        apiMock.mockImplementationOnce(
            () =>
                new Promise((_resolve, reject) => {
                    failReload = reject;
                }),
        );
        await save();
        await waitFor(() =>
            expect(
                apiMock.mock.calls.filter(
                    ([request]) => request.method === 'GET',
                ),
            ).toHaveLength(2),
        );
        expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
        expect(checkbox).toBeDisabled();
        await act(async () =>
            failReload({ error: { message: 'Reload failed' } }),
        );
        await waitFor(() =>
            expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled(),
        );
        expect(checkbox).toBeEnabled();
        expect(checkbox).toBeChecked();
        expect(
            screen.getByRole('switch', { name: 'Limit what agents can do' }),
        ).toBeEnabled();
        expect(
            screen.getByRole('button', { name: 'Discard changes' }),
        ).toBeEnabled();
        expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
        expect(
            screen.queryByText('Agent permissions changed'),
        ).not.toBeInTheDocument();
        expect(mocks.errorToast).toHaveBeenCalledTimes(2);
        expect(mocks.errorToast).toHaveBeenNthCalledWith(1, {
            title: 'Could not save agent permissions.',
            apiError: { message: 'Save failed' },
        });
        expect(mocks.errorToast).toHaveBeenNthCalledWith(2, {
            title: 'Could not reload agent permissions.',
            apiError: { message: 'Reload failed' },
        });
        await save();
        await waitFor(() =>
            expect(
                screen.queryByText('Unsaved changes'),
            ).not.toBeInTheDocument(),
        );
        expect(mutations()).toHaveLength(2);
        expect(JSON.parse(String(mutations()[1][0].body))).toMatchObject({
            version: 1,
            systemRoleMatrix: {
                ...matrix([]),
                admin: [AgentCapability.Delete],
            },
        });
        expect(checkbox).toBeChecked();
        expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
        expect(mocks.errorToast).toHaveBeenCalledTimes(2);
    });

    it('keeps the conflict and draft when reloading fails and allows a retry', async () => {
        policy = { ...legacy(), mode: 'managed', version: 1 };
        const client = renderSection();
        fireEvent.click(
            await screen.findByRole('checkbox', {
                name: 'Admin: Delete content',
            }),
        );
        policy = { ...policy, version: 2 };
        await act(() => client.invalidateQueries(['ai-access']));
        const reload = await screen.findByRole('button', {
            name: 'Reload latest',
        });
        let failReload: (error: unknown) => void = () => {};
        apiMock.mockImplementationOnce(
            () =>
                new Promise((_resolve, reject) => {
                    failReload = reject;
                }),
        );
        fireEvent.click(reload);
        await waitFor(() => expect(reload).toBeDisabled());
        await act(async () =>
            failReload({ error: { message: 'Reload failed' } }),
        );
        await waitFor(() => expect(reload).toBeEnabled());
        expect(
            screen.getByText('Agent permissions changed'),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('checkbox', { name: 'Admin: Delete content' }),
        ).toBeChecked();
        expect(mocks.errorToast).toHaveBeenCalledExactlyOnceWith({
            title: 'Could not reload agent permissions.',
            apiError: { message: 'Reload failed' },
        });
        fireEvent.click(reload);
        await waitFor(() =>
            expect(
                screen.queryByText('Agent permissions changed'),
            ).not.toBeInTheDocument(),
        );
        expect(
            screen.getByRole('checkbox', { name: 'Admin: Delete content' }),
        ).not.toBeChecked();
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
        expect(mutations()).toHaveLength(0);
        fireEvent.click(screen.getByRole('button', { name: 'Reload latest' }));
        await waitFor(() =>
            expect(
                screen.queryByText('Agent permissions changed'),
            ).not.toBeInTheDocument(),
        );
        expect(
            apiMock.mock.calls.filter(([request]) => request.method === 'GET'),
        ).toHaveLength(3);
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
