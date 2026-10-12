import {
    AgentCapability,
    OrganizationMemberRole,
    type AgentCapabilityPolicyOverview,
    type AgentSystemRoleMatrix,
    type GroupWithMembers,
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
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../api';
import { AgentPermissionsSection } from './AgentPermissionsSection';

vi.mock('../../providers/App/useApp', () => ({
    default: () => ({
        user: {
            data: { organizationUuid: 'org', ability: { can: () => true } },
        },
    }),
}));
vi.mock('../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: true } }),
}));
vi.mock('../../hooks/useProjects', () => ({
    useProjects: () => ({ data: [] }),
}));
vi.mock('../../hooks/useOrganizationUsers', () => ({
    useOrganizationUsers: () => ({ data: [] }),
}));
vi.mock('../../api', () => ({ lightdashApi: vi.fn() }));
vi.mock('../../hooks/toaster/useToaster', () => ({
    default: () => ({ showToastSuccess: vi.fn(), showToastApiError: vi.fn() }),
}));
const all = Object.values(AgentCapability);
const matrix = (caps: AgentCapability[]) =>
    Object.fromEntries(
        Object.values(OrganizationMemberRole).map((role) => [role, [...caps]]),
    ) as AgentSystemRoleMatrix;
const legacy = (): AgentCapabilityPolicyOverview => ({
    mode: 'legacy',
    version: 1,
    allowedCapabilities: null,
    allowedGroupUuids: null,
    systemRoleMatrix: matrix([]),
    defaults: matrix(all),
    groupsAvailable: true,
});
let policy = legacy();
const groups: GroupWithMembers[] = [
    {
        uuid: 'a',
        createdAt: new Date(),
        updatedAt: new Date(),
        createdByUserUuid: null,
        updatedByUserUuid: null,
        organizationUuid: 'org',
        name: 'Data team',
        members: [],
        memberUuids: ['1', '2', '2'],
    },
    {
        uuid: 'b',
        createdAt: new Date(),
        updatedAt: new Date(),
        createdByUserUuid: null,
        updatedByUserUuid: null,
        organizationUuid: 'org',
        name: 'Analysts',
        members: [],
        memberUuids: ['2'],
    },
];
let availableGroups = groups;
let loadError = false;
const refetch = vi.fn();
const api = vi.mocked(lightdashApi);
const renderSection = () => {
    const client = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });
    client.setQueryData(
        ['ai-access', 'org', 'org', 'agent-permissions'],
        policy,
    );
    const content = () => (
        <MantineProvider env="test">
            <MemoryRouter>
                <QueryClientProvider client={client}>
                    <AgentPermissionsSection
                        policy={policy}
                        groups={availableGroups}
                        refetchPolicy={refetch}
                        loadError={loadError}
                        mcpSettings={null}
                    />
                </QueryClientProvider>
            </MemoryRouter>
        </MantineProvider>
    );
    const view = render(content());
    return { rerender: () => view.rerender(content()) };
};
const choose = (name: string) =>
    fireEvent.click(screen.getByRole('radio', { name }));
const toggle = (name: string) =>
    fireEvent.click(screen.getByRole('switch', { name }));
const review = () =>
    fireEvent.click(screen.getByRole('button', { name: 'Review and save' }));
const save = () =>
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
const custom = () => choose('Custom');
const expandWho = () =>
    fireEvent.click(
        screen.getByRole('button', { name: 'Change who can use agents' }),
    );
beforeEach(() => {
    vi.clearAllMocks();
    policy = legacy();
    availableGroups = groups;
    loadError = false;
    refetch.mockImplementation(async () => ({ data: policy, isError: false }));
    api.mockImplementation(async (request) => {
        if (request.method === 'GET') return policy;
        policy = {
            ...policy,
            ...JSON.parse(String(request.body)),
            version: policy.version + 1,
        };
        return policy;
    });
});
describe('reviewed agent permissions', () => {
    it('starts with the saved choice, a clean footer and no old pickers', () => {
        renderSection();
        expect(
            screen.getByRole('radio', { name: 'Same as the person' }),
        ).toBeChecked();
        expect(screen.getByText('Current')).toBeInTheDocument();
        expect(screen.getByText('No changes')).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Review and save' }),
        ).toBeDisabled();
        expect(screen.queryByText('Allowed projects')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('People')).not.toBeInTheDocument();
        expect(api).not.toHaveBeenCalled();
    });
    it('shows the Read and query chips and Raw SQL qualification', () => {
        renderSection();
        choose('Read and query');
        expect(
            screen.getByText(
                "Raw SQL runs with the person's warehouse permissions.",
            ),
        ).toBeInTheDocument();
        expect(screen.getByText('6 more')).toBeInTheDocument();
        expect(api).not.toHaveBeenCalled();
    });
    it('opens Custom from the preset without widening its limits', () => {
        renderSection();
        choose('Read and query');
        custom();
        expect(screen.getByRole('radio', { name: 'Custom' })).toBeChecked();
        expect(screen.getByRole('switch', { name: 'Raw SQL' })).toBeChecked();
        expect(
            screen.getByRole('switch', { name: 'Delete content' }),
        ).not.toBeChecked();
        expect(screen.getByText('8 unsaved changes')).toBeInTheDocument();
    });
    it('starts Custom on, with collapsed developer and role controls', () => {
        renderSection();
        custom();
        expect(screen.getAllByRole('switch')).toHaveLength(7);
        expect(
            screen
                .getAllByRole('switch')
                .every((input) => (input as HTMLInputElement).checked),
        ).toBe(true);
        expect(
            screen.getByRole('button', { name: /Developer and admin/ }),
        ).toHaveAttribute('aria-expanded', 'false');
        expect(
            screen.getByRole('button', { name: /Different limits per role/ }),
        ).toHaveAttribute('aria-expanded', 'false');
        expect(screen.getByText('1 unsaved change')).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: 'Custom roles' }),
        ).toHaveAttribute('href', '/generalSettings/customRoles');
    });
    it('reviews two global stops once each, keeps the draft on Back and saves only after review', async () => {
        renderSection();
        custom();
        toggle('Delete content');
        toggle('Publish and share');
        expect(screen.getByText('3 unsaved changes')).toBeInTheDocument();
        review();
        const modal = within(screen.getByRole('dialog'));
        expect(modal.getByText('STOPS')).toBeInTheDocument();
        expect(
            modal.getByText(
                'For every role, custom roles included. People can still do these themselves.',
            ),
        ).toBeInTheDocument();
        expect(modal.queryByText('ACTIVITY')).not.toBeInTheDocument();
        expect(api).not.toHaveBeenCalled();
        fireEvent.click(modal.getByRole('button', { name: 'Back' }));
        expect(
            screen.getByRole('switch', { name: 'Delete content' }),
        ).not.toBeChecked();
        review();
        save();
        await waitFor(() =>
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
        );
        expect(screen.getByText('No changes')).toBeInTheDocument();
        expect(JSON.parse(String(api.mock.calls[0][0].body))).toMatchObject({
            version: 1,
            mode: 'managed',
            allowedCapabilities: all.filter(
                (cap) =>
                    cap !== AgentCapability.Delete &&
                    cap !== AgentCapability.Publish,
            ),
        });
    });
    it('disables a role cell when its global capability is off', async () => {
        renderSection();
        custom();
        toggle('Delete content');
        fireEvent.click(
            screen.getByRole('button', { name: /Different limits per role/ }),
        );
        expect(
            await screen.findByRole('checkbox', {
                name: 'Admin: Delete content',
            }),
        ).toBeDisabled();
        toggle('Delete content');
        expect(
            await screen.findByRole('checkbox', {
                name: 'Admin: Delete content',
            }),
        ).toBeChecked();
    });
    it('reviews advanced row edits with the role name', async () => {
        policy = {
            ...policy,
            mode: 'managed',
            allowedCapabilities: all,
            systemRoleMatrix: matrix(all),
        };
        renderSection();
        fireEvent.click(
            screen.getByRole('button', { name: /Different limits per role/ }),
        );
        fireEvent.click(
            await screen.findByRole('checkbox', {
                name: 'Admin: Delete content',
            }),
        );
        expect(screen.getByText('1 unsaved change')).toBeInTheDocument();
        review();
        expect(
            within(screen.getByRole('dialog')).getByText(/Admin/),
        ).toBeInTheDocument();
    });
    it('shows historical managed limits as Custom, all global switches on and saved rows intact', async () => {
        policy = {
            ...policy,
            mode: 'managed',
            systemRoleMatrix: matrix([AgentCapability.Query]),
        };
        renderSection();
        expect(screen.getByRole('radio', { name: 'Custom' })).toBeChecked();
        expect(screen.getByText('No changes')).toBeInTheDocument();
        fireEvent.click(
            screen.getByRole('button', { name: /Different limits per role/ }),
        );
        expect(
            await screen.findByRole('checkbox', {
                name: 'Admin: Delete content',
            }),
        ).not.toBeChecked();
        expect(
            screen.getByRole('switch', { name: 'Delete content' }),
        ).toBeChecked();
        toggle('Delete content');
        review();
        save();
        await waitFor(() => expect(api).toHaveBeenCalled());
        expect(
            JSON.parse(String(api.mock.calls[0][0].body)).systemRoleMatrix,
        ).toEqual(matrix([AgentCapability.Query]));
    });
    it('collapses capabilities for group editing, shows member counts and reviews names without a people count', async () => {
        renderSection();
        expandWho();
        expect(
            screen.queryByRole('radio', { name: 'Custom' }),
        ).not.toBeInTheDocument();
        choose('Only these groups');
        expect(
            screen.getByText('Choose at least one group.'),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Review and save' }),
        ).toBeDisabled();
        fireEvent.click(screen.getByRole('combobox', { name: 'Groups' }));
        fireEvent.click(
            await screen.findByRole('option', { name: 'Data team (2)' }),
        );
        expect(screen.getAllByText('Data team (2)').length).toBeGreaterThan(0);
        expect(
            screen.getByText(
                'Only members of these groups can use Ask AI, the Slack agent, MCP clients and the CLI.',
            ),
        ).toBeInTheDocument();
        review();
        const dialog = within(screen.getByRole('dialog'));
        expect(dialog.getByText('WHO')).toBeInTheDocument();
        expect(dialog.getByText(/Only members of/)).toHaveTextContent(
            'Data team',
        );
        expect(dialog.queryByText(/\(2\)/)).not.toBeInTheDocument();
    });
    it('hides Who when groups are unavailable without a saved restriction', () => {
        policy = { ...policy, groupsAvailable: false };
        renderSection();
        expect(
            screen.queryByText('Who can use agents'),
        ).not.toBeInTheDocument();
    });
    it('keeps an unavailable saved restriction and clears it only through review', async () => {
        policy = {
            ...policy,
            groupsAvailable: false,
            allowedGroupUuids: ['hidden'],
        };
        renderSection();
        expect(
            screen.getByText(
                'Groups are unavailable. The saved group restriction still applies.',
            ),
        ).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Allow everyone' }));
        review();
        expect(
            within(screen.getByRole('dialog')).getByText(
                'Everyone whose role allows AI can use agents',
            ),
        ).toBeInTheDocument();
        save();
        await waitFor(() => expect(api).toHaveBeenCalled());
        expect(JSON.parse(String(api.mock.calls[0][0].body))).toHaveProperty(
            'allowedGroupUuids',
            null,
        );
    });
    it('shows missing visible groups neutrally and preserves their list on unrelated saves', async () => {
        policy = { ...policy, allowedGroupUuids: ['hidden'] };
        renderSection();
        expect(
            screen.getByText('Only these groups: A saved group.'),
        ).toBeInTheDocument();
        custom();
        review();
        save();
        await waitFor(() => expect(api).toHaveBeenCalled());
        expect(
            JSON.parse(String(api.mock.calls[0][0].body)),
        ).not.toHaveProperty('allowedGroupUuids');
    });
    it('preserves a deleted-group restriction on unrelated saves', async () => {
        policy = { ...policy, allowedGroupUuids: [] };
        renderSection();
        expect(
            screen.getByText(
                'No one can use agents. All chosen groups are deleted.',
            ),
        ).toBeInTheDocument();
        custom();
        review();
        save();
        await waitFor(() => expect(api).toHaveBeenCalled());
        expect(
            JSON.parse(String(api.mock.calls[0][0].body)),
        ).not.toHaveProperty('allowedGroupUuids');
    });
    it('says agents are off for everyone instead of listing eleven stops', async () => {
        renderSection();
        custom();
        fireEvent.click(
            screen.getByRole('button', { name: /Developer and admin/ }),
        );
        await screen.findByRole('switch', { name: 'Administration' });
        screen
            .getAllByRole('switch')
            .forEach((input) => fireEvent.click(input));
        expect(
            screen.getByText('Agents are turned off for everyone.'),
        ).toBeInTheDocument();
        review();
        const modal = within(screen.getByRole('dialog'));
        expect(
            modal.getByText('Agents are turned off for everyone'),
        ).toBeInTheDocument();
        expect(modal.queryByText('Delete content')).not.toBeInTheDocument();
        expect(
            modal.getByText(
                'No one can use Ask AI, the Slack agent, MCP clients or the CLI. People can still work themselves.',
            ),
        ).toBeInTheDocument();
    });
    it('reviews restored capabilities and removal of limits', () => {
        policy = {
            ...policy,
            mode: 'managed',
            allowedCapabilities: [],
            systemRoleMatrix: matrix([]),
        };
        renderSection();
        toggle('Delete content');
        review();
        expect(
            within(screen.getByRole('dialog')).getByText('ALLOWS'),
        ).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Back' }));
        choose('Same as the person');
        review();
        expect(
            within(screen.getByRole('dialog')).getByText(
                'Agents follow each person’s permissions again.',
            ),
        ).toBeInTheDocument();
    });
    it('keeps a dirty draft through background updates and Discard accepts the latest policy', () => {
        const view = renderSection();
        custom();
        toggle('Delete content');
        policy = { ...policy, version: 2, allowedGroupUuids: ['b'] };
        view.rerender();
        expect(
            screen.getByRole('switch', { name: 'Delete content' }),
        ).not.toBeChecked();
        expect(
            screen.getByText('Agent permissions changed'),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Review and save' }),
        ).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
        expect(screen.getByText('No changes')).toBeInTheDocument();
        expect(
            screen.getByText('Only these groups: Analysts.'),
        ).toBeInTheDocument();
    });
    it('retains the draft after a version conflict and never resubmits automatically', async () => {
        const view = renderSection();
        custom();
        api.mockRejectedValueOnce({
            error: {
                message: 'Agent permissions changed. Reload and try again.',
            },
        });
        policy = { ...policy, version: 2 };
        review();
        save();
        await waitFor(() => expect(refetch).toHaveBeenCalled());
        view.rerender();
        expect(
            screen.getByText('Agent permissions changed'),
        ).toBeInTheDocument();
        expect(screen.getByRole('radio', { name: 'Custom' })).toBeChecked();
        expect(api).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByRole('button', { name: 'Reload latest' }));
        await waitFor(() =>
            expect(screen.getByText('No changes')).toBeInTheDocument(),
        );
        expect(api).toHaveBeenCalledTimes(1);
    });
    it('keeps the modal and draft after failure and disables duplicate saves while pending', async () => {
        renderSection();
        custom();
        let reject: (value: unknown) => void = () => {};
        api.mockImplementationOnce(
            () =>
                new Promise((_resolve, fail) => {
                    reject = fail;
                }),
        );
        review();
        save();
        await waitFor(() =>
            expect(
                screen.getByRole('button', { name: 'Save changes' }),
            ).toBeDisabled(),
        );
        await act(async () => reject({ error: { message: 'Unavailable' } }));
        await waitFor(() =>
            expect(
                screen.getByRole('button', { name: 'Save changes' }),
            ).toBeEnabled(),
        );
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByText('1 unsaved change')).toBeInTheDocument();
    });
    it('shows an empty group picker and blocks a new empty restriction', () => {
        availableGroups = [];
        renderSection();
        expandWho();
        choose('Only these groups');
        expect(
            screen.getAllByText('No groups available').length,
        ).toBeGreaterThan(0);
        expect(
            screen.getByText('Choose at least one group.'),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Review and save' }),
        ).toBeDisabled();
    });
    it('updates a clean draft when newer saved data arrives', () => {
        const view = renderSection();
        policy = {
            ...policy,
            version: 2,
            mode: 'managed',
            allowedCapabilities: all,
            systemRoleMatrix: matrix(all),
        };
        view.rerender();
        expect(screen.getByRole('radio', { name: 'Custom' })).toBeChecked();
        expect(screen.getByText('No changes')).toBeInTheDocument();
    });
    it('keeps the draft and blocks saves and group edits on a stale-data error', () => {
        const view = renderSection();
        custom();
        expandWho();
        choose('Only these groups');
        loadError = true;
        view.rerender();
        expect(
            screen.getByRole('button', { name: 'Review and save' }),
        ).toBeDisabled();
        expect(screen.getByRole('combobox', { name: 'Groups' })).toBeDisabled();
    });
});
