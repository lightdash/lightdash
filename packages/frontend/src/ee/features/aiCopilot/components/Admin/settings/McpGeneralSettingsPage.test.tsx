import {
    type ApiAiOrganizationSettingsResponse,
    type ApiError,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../../testing/testUtils';
import { McpGeneralSettingsPage } from './McpGeneralSettingsPage';

type SettingsQuery = {
    data:
        | Pick<
              ApiAiOrganizationSettingsResponse['results'],
              'mcpAgentsEnabled' | 'mcpContentWritesEnabled'
          >
        | undefined;
    isInitialLoading: boolean;
    isError: boolean;
    error: ApiError | undefined;
};

const { mutationState, refetchSettings, settingsQuery, updateSettings } =
    vi.hoisted(() => {
        const settingsQuery: { current: SettingsQuery } = {
            current: {
                data: {
                    mcpAgentsEnabled: true,
                    mcpContentWritesEnabled: false,
                },
                isInitialLoading: false,
                isError: false,
                error: undefined,
            },
        };

        return {
            mutationState: { isLoading: false },
            refetchSettings: vi.fn(),
            settingsQuery,
            updateSettings: vi.fn(),
        };
    });

vi.mock('../../../hooks/useAiOrganizationSettings', () => ({
    useAiOrganizationAdminSettings: () => ({
        ...settingsQuery.current,
        refetch: refetchSettings,
    }),
    useUpdateAiOrganizationSettings: () => ({
        mutate: updateSettings,
        isLoading: mutationState.isLoading,
    }),
}));

const renderPage = () =>
    renderWithProviders(
        <MemoryRouter>
            <McpGeneralSettingsPage />
        </MemoryRouter>,
    );

describe('McpGeneralSettingsPage', () => {
    beforeEach(() => {
        settingsQuery.current = {
            data: {
                mcpAgentsEnabled: true,
                mcpContentWritesEnabled: false,
            },
            isInitialLoading: false,
            isError: false,
            error: undefined,
        };
        mutationState.isLoading = false;
        refetchSettings.mockReset();
        updateSettings.mockReset();
    });

    it('updates agent access without changing content write access', async () => {
        const user = userEvent.setup();
        renderPage();

        await user.click(
            screen.getByRole('switch', { name: 'Enable agents over MCP' }),
        );

        expect(updateSettings).toHaveBeenCalledExactlyOnceWith({
            mcpAgentsEnabled: false,
        });
        expect(
            screen.getByRole('switch', {
                name: 'Allow content changes via MCP',
            }),
        ).not.toBeChecked();
    });

    it('updates content write access without changing agent access', async () => {
        const user = userEvent.setup();
        renderPage();

        await user.click(
            screen.getByRole('switch', {
                name: 'Allow content changes via MCP',
            }),
        );

        expect(updateSettings).toHaveBeenCalledExactlyOnceWith({
            mcpContentWritesEnabled: true,
        });
        expect(
            screen.getByRole('switch', { name: 'Enable agents over MCP' }),
        ).toBeChecked();
    });

    it('disables both switches while a settings update is pending', () => {
        mutationState.isLoading = true;
        renderPage();

        expect(
            screen.getByRole('switch', { name: 'Enable agents over MCP' }),
        ).toBeDisabled();
        expect(
            screen.getByRole('switch', {
                name: 'Allow content changes via MCP',
            }),
        ).toBeDisabled();
    });

    it('shows a settings query error and allows retrying', async () => {
        const user = userEvent.setup();
        settingsQuery.current = {
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
        renderPage();

        expect(
            screen.getByText('Could not load MCP settings'),
        ).toBeInTheDocument();
        expect(screen.queryByRole('switch')).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Try again' }));

        expect(refetchSettings).toHaveBeenCalledOnce();
        expect(updateSettings).not.toHaveBeenCalled();
    });
});
