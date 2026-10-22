import {
    type ApiError,
    type ApiAiOrganizationSettingsResponse,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../../../../testing/testUtils';
import { McpAccessSettingsCard } from './McpAccessSettingsCard';

type SettingsQuery = {
    data:
        | Pick<ApiAiOrganizationSettingsResponse['results'], 'mcpEnabled'>
        | undefined;
    isInitialLoading: boolean;
    isError: boolean;
    error: ApiError | undefined;
};

const { query, mutation, updateSettings, refetch } = vi.hoisted(() => {
    const query: { current: SettingsQuery } = {
        current: {
            data: { mcpEnabled: true },
            isInitialLoading: false,
            isError: false,
            error: undefined,
        },
    };
    return {
        query,
        mutation: { isLoading: false },
        updateSettings: vi.fn(),
        refetch: vi.fn(),
    };
});

vi.mock('../../../hooks/useAiOrganizationSettings', () => ({
    useAiOrganizationAdminSettings: () => ({ ...query.current, refetch }),
    useUpdateAiOrganizationSettings: () => ({
        mutate: updateSettings,
        isLoading: mutation.isLoading,
    }),
}));

beforeEach(() => {
    query.current = {
        data: { mcpEnabled: true },
        isInitialLoading: false,
        isError: false,
        error: undefined,
    };
    mutation.isLoading = false;
    updateSettings.mockReset();
    refetch.mockReset();
});

test.each([true, false])(
    'saves the organization MCP setting from %s',
    async (mcpEnabled) => {
        query.current.data = { mcpEnabled };
        const user = userEvent.setup();
        renderWithProviders(<McpAccessSettingsCard />);
        await user.click(
            screen.getByRole('switch', { name: 'Allow MCP access' }),
        );
        expect(updateSettings).toHaveBeenCalledExactlyOnceWith({
            mcpEnabled: !mcpEnabled,
        });
    },
);

test('hides the control when the server does not support MCP access settings', () => {
    query.current.data = {};
    renderWithProviders(<McpAccessSettingsCard />);
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(updateSettings).not.toHaveBeenCalled();
});

test('keeps the saved value while disabling the switch during an update', () => {
    query.current.data = { mcpEnabled: false };
    mutation.isLoading = true;
    renderWithProviders(<McpAccessSettingsCard />);
    const control = screen.getByRole('switch', { name: 'Allow MCP access' });
    expect(control).toBeDisabled();
    expect(control).not.toBeChecked();
});

test('does not show an enabled switch before settings have loaded', () => {
    query.current.data = undefined;
    query.current.isInitialLoading = true;
    renderWithProviders(<McpAccessSettingsCard />);
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
});

test('shows the read error and lets an administrator retry', async () => {
    query.current = {
        data: undefined,
        isInitialLoading: false,
        isError: true,
        error: {
            status: 'error',
            error: {
                name: 'NetworkError',
                message: 'Could not load MCP settings',
                statusCode: 500,
                data: {},
            },
        },
    };
    const user = userEvent.setup();
    renderWithProviders(<McpAccessSettingsCard />);
    expect(screen.getByText('Could not load MCP settings')).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalledOnce();
    expect(updateSettings).not.toHaveBeenCalled();
});
