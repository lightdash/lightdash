import {
    type ApiError,
    type AiOrganizationRuntimeSettings,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../../testing/testUtils';
import { McpConnectSettingsPage } from './McpConnectSettingsPage';

type RuntimeSettingsQuery = {
    data: Pick<AiOrganizationRuntimeSettings, 'mcpEnabled'> | undefined;
    isSuccess: boolean;
    isError: boolean;
    error: ApiError | undefined;
};
const query = vi.hoisted(() => {
    const current: RuntimeSettingsQuery = {
        data: { mcpEnabled: true },
        isSuccess: true,
        isError: false,
        error: undefined,
    };
    return { current, refetch: vi.fn() };
});
vi.mock('../../../hooks/useAiOrganizationSettings', () => ({
    useAiOrganizationSettings: () => ({
        ...query.current,
        refetch: query.refetch,
    }),
}));
vi.mock('./McpInstallationCard', () => ({
    McpInstallationCard: () => <div>Client configuration</div>,
}));

beforeEach(() => {
    query.current = {
        data: { mcpEnabled: true },
        isSuccess: true,
        isError: false,
        error: undefined,
    };
    query.refetch.mockReset();
});

it.each([true, undefined])(
    'offers client setup for organization consent %s',
    (mcpEnabled) => {
        query.current.data = { mcpEnabled };
        renderWithProviders(<McpConnectSettingsPage />);
        expect(screen.getByText('Client configuration')).toBeInTheDocument();
    },
);

it('blocks client setup when MCP is disabled', () => {
    query.current.data = { mcpEnabled: false };
    renderWithProviders(<McpConnectSettingsPage />);
    expect(screen.getByText('MCP access is disabled')).toBeInTheDocument();
    expect(screen.queryByText('Client configuration')).not.toBeInTheDocument();
});

it('does not offer setup while consent is loading or unavailable', async () => {
    query.current = {
        data: undefined,
        isSuccess: false,
        isError: false,
        error: undefined,
    };
    const view = renderWithProviders(<McpConnectSettingsPage />);
    expect(screen.queryByText('Client configuration')).not.toBeInTheDocument();
    query.current.isError = true;
    query.current.error = {
        status: 'error',
        error: {
            name: 'Error',
            message: 'Organization unavailable',
            statusCode: 500,
            data: {},
        },
    };
    view.rerender(<McpConnectSettingsPage />);
    expect(screen.queryByText('Client configuration')).not.toBeInTheDocument();
    await userEvent
        .setup()
        .click(screen.getByRole('button', { name: 'Try again' }));
    expect(query.refetch).toHaveBeenCalledOnce();
});
