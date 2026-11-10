import { type McpProjectAccess } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../../../../testing/testUtils';
import { McpProjectAccessSettingsCard } from './McpProjectAccessSettingsCard';

const {
    settingsQuery,
    projectsQuery,
    mutation,
    updateSettings,
    refetchProjects,
} = vi.hoisted(() => {
    const settingsQuery: {
        current: {
            mcpEnabled: boolean;
            mcpProjectAccess: McpProjectAccess | undefined;
        };
    } = {
        current: {
            mcpEnabled: true,
            mcpProjectAccess: { mode: 'all' },
        },
    };
    return {
        settingsQuery,
        projectsQuery: { isInitialLoading: false, isError: false },
        mutation: { isLoading: false },
        updateSettings: vi.fn(),
        refetchProjects: vi.fn(),
    };
});

vi.mock('../../../hooks/useAiOrganizationSettings', () => ({
    useAiOrganizationAdminSettings: () => ({ data: settingsQuery.current }),
    useUpdateAiOrganizationSettings: () => ({
        mutate: updateSettings,
        isLoading: mutation.isLoading,
    }),
}));
vi.mock('../../../../../../hooks/useProjects', () => ({
    useProjects: () => ({
        ...projectsQuery,
        data: [
            { projectUuid: 'project-a', name: 'Project A' },
            { projectUuid: 'project-b', name: 'Project B' },
        ],
        refetch: refetchProjects,
    }),
}));

beforeEach(() => {
    settingsQuery.current = {
        mcpEnabled: true,
        mcpProjectAccess: { mode: 'all' },
    };
    mutation.isLoading = false;
    projectsQuery.isInitialLoading = false;
    projectsQuery.isError = false;
    updateSettings.mockReset();
    refetchProjects.mockReset();
});

test('hides the card when the server does not support the policy', () => {
    settingsQuery.current.mcpProjectAccess = undefined;
    renderWithProviders(<McpProjectAccessSettingsCard />);
    expect(screen.queryByText('Project access')).not.toBeInTheDocument();
});

test('choosing selected mode shows a draft without saving, and the first project applies it', async () => {
    const user = userEvent.setup();
    const view = renderWithProviders(<McpProjectAccessSettingsCard />);
    await user.click(
        screen.getByRole('radio', { name: 'Only selected projects' }),
    );
    expect(updateSettings).not.toHaveBeenCalled();
    expect(
        screen.getByText('Select at least one project to apply'),
    ).toBeInTheDocument();
    expect(screen.queryByText('No projects allowed')).not.toBeInTheDocument();
    await user.click(
        screen.getByRole('combobox', { name: 'Allowed projects' }),
    );
    await user.click(screen.getByRole('option', { name: 'Project A' }));
    expect(updateSettings).toHaveBeenCalledExactlyOnceWith({
        mcpProjectAccess: { mode: 'selected', projectUuids: ['project-a'] },
    });
    settingsQuery.current = {
        ...settingsQuery.current,
        mcpProjectAccess: { mode: 'selected', projectUuids: ['project-a'] },
    };
    view.rerender(<McpProjectAccessSettingsCard />);
    expect(
        screen.queryByText('Select at least one project to apply'),
    ).not.toBeInTheDocument();
    expect(
        screen.getByRole('radio', { name: 'Only selected projects' }),
    ).toBeChecked();
});

test('cancels an unsaved selection by switching back to all without a request', async () => {
    const user = userEvent.setup();
    renderWithProviders(<McpProjectAccessSettingsCard />);
    await user.click(
        screen.getByRole('radio', { name: 'Only selected projects' }),
    );
    await user.click(screen.getByRole('radio', { name: 'All projects' }));
    expect(updateSettings).not.toHaveBeenCalled();
    expect(
        screen.queryByRole('combobox', { name: 'Allowed projects' }),
    ).not.toBeInTheDocument();
});

test('resets the unsaved draft when server settings change', async () => {
    const user = userEvent.setup();
    const view = renderWithProviders(<McpProjectAccessSettingsCard />);
    await user.click(
        screen.getByRole('radio', { name: 'Only selected projects' }),
    );
    settingsQuery.current = {
        mcpEnabled: false,
        mcpProjectAccess: { mode: 'all' },
    };
    view.rerender(<McpProjectAccessSettingsCard />);
    expect(screen.getByRole('radio', { name: 'All projects' })).toBeChecked();
    expect(
        screen.queryByRole('combobox', { name: 'Allowed projects' }),
    ).not.toBeInTheDocument();
    expect(updateSettings).not.toHaveBeenCalled();
});

test('shows the warning for a saved empty selected policy', () => {
    settingsQuery.current.mcpProjectAccess = {
        mode: 'selected',
        projectUuids: [],
    };
    renderWithProviders(<McpProjectAccessSettingsCard />);
    expect(screen.getByText('No projects allowed')).toBeInTheDocument();
    expect(
        screen.getByText(/MCP clients cannot access any projects/),
    ).toBeInTheDocument();
    expect(
        screen.queryByText('Select at least one project to apply'),
    ).not.toBeInTheDocument();
});

test('saves an empty list when the last previously saved project is removed', async () => {
    settingsQuery.current.mcpProjectAccess = {
        mode: 'selected',
        projectUuids: ['project-a'],
    };
    const user = userEvent.setup();
    const view = renderWithProviders(<McpProjectAccessSettingsCard />);
    await user.click(
        screen.getByRole('combobox', { name: 'Allowed projects' }),
    );
    await user.keyboard('{Backspace}');
    expect(updateSettings).toHaveBeenCalledExactlyOnceWith({
        mcpProjectAccess: { mode: 'selected', projectUuids: [] },
    });
    settingsQuery.current = {
        ...settingsQuery.current,
        mcpProjectAccess: { mode: 'selected', projectUuids: [] },
    };
    view.rerender(<McpProjectAccessSettingsCard />);
    expect(screen.getByText('No projects allowed')).toBeInTheDocument();
});

test('saves a selected project without changing sibling settings', async () => {
    settingsQuery.current.mcpProjectAccess = {
        mode: 'selected',
        projectUuids: ['project-a'],
    };
    const user = userEvent.setup();
    renderWithProviders(<McpProjectAccessSettingsCard />);
    await user.click(
        screen.getByRole('combobox', { name: 'Allowed projects' }),
    );
    await user.click(screen.getByRole('option', { name: 'Project B' }));
    expect(updateSettings).toHaveBeenCalledExactlyOnceWith({
        mcpProjectAccess: {
            mode: 'selected',
            projectUuids: ['project-a', 'project-b'],
        },
    });
});

test('switches back to all projects', async () => {
    settingsQuery.current.mcpProjectAccess = {
        mode: 'selected',
        projectUuids: ['project-a'],
    };
    const user = userEvent.setup();
    renderWithProviders(<McpProjectAccessSettingsCard />);
    await user.click(screen.getByRole('radio', { name: 'All projects' }));
    expect(updateSettings).toHaveBeenCalledExactlyOnceWith({
        mcpProjectAccess: { mode: 'all' },
    });
});

test.each(['MCP off', 'update pending'] as const)(
    'preserves saved selection while disabled: %s',
    (reason) => {
        settingsQuery.current.mcpProjectAccess = {
            mode: 'selected',
            projectUuids: ['project-a'],
        };
        settingsQuery.current.mcpEnabled = reason !== 'MCP off';
        mutation.isLoading = reason === 'update pending';
        renderWithProviders(<McpProjectAccessSettingsCard />);
        expect(
            screen.getByRole('radio', { name: 'Only selected projects' }),
        ).toBeChecked();
        expect(
            screen.getByRole('radio', { name: 'All projects' }),
        ).toBeDisabled();
        expect(
            screen.getByRole('combobox', { name: 'Allowed projects' }),
        ).toBeDisabled();
        expect(screen.getAllByText('Project A')[0]).toBeVisible();
        expect(updateSettings).not.toHaveBeenCalled();
    },
);

test('disables the project picker during loading and offers retry on project-query failure', async () => {
    settingsQuery.current.mcpProjectAccess = {
        mode: 'selected',
        projectUuids: [],
    };
    projectsQuery.isInitialLoading = true;
    const view = renderWithProviders(<McpProjectAccessSettingsCard />);
    expect(
        screen.getByRole('combobox', { name: 'Allowed projects' }),
    ).toBeDisabled();
    projectsQuery.isInitialLoading = false;
    projectsQuery.isError = true;
    view.rerender(<McpProjectAccessSettingsCard />);
    expect(screen.getByText('Could not load projects')).toBeInTheDocument();
    await userEvent
        .setup()
        .click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetchProjects).toHaveBeenCalledOnce();
    expect(updateSettings).not.toHaveBeenCalled();
});
