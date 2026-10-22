import { screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { agentSettingsMcpMock } from '../../../../../../features/aiAccess/agentSettings.mock';
import { renderWithProviders } from '../../../../../../testing/testUtils';
import { AiGeneralSettingsPage } from './AiGeneralSettingsPage';

const surfaces = vi.hoisted(() => ({
    mcpEnabled: true,
    aiAgentsVisible: false,
    slackEnabled: false,
}));
vi.mock('../../../../../../hooks/organization/useOrganization', () => ({
    useOrganization: () => ({
        isSuccess: true,
        data: { mcpEnabled: surfaces.mcpEnabled },
    }),
}));
vi.mock('../../../hooks/useAiOrganizationSettings', () => ({
    useAiOrganizationAdminSettings: () => ({
        data: {
            ...agentSettingsMcpMock(),
            aiAgentsVisible: surfaces.aiAgentsVisible,
        },
        isInitialLoading: false,
    }),
    useUpdateAiOrganizationSettings: () => ({
        mutate: vi.fn(),
        isLoading: false,
    }),
}));
vi.mock('../../../../../../hooks/slack/useSlack', () => ({
    useGetSlack: () => ({
        data: surfaces.slackEnabled
            ? { organizationUuid: 'org', aiAgentsEnabled: true }
            : undefined,
    }),
    useUpdateSlackAppCustomSettingsMutation: () => ({
        mutate: vi.fn(),
        isLoading: false,
    }),
}));
vi.mock('../../../hooks/useAiRouter', () => ({
    useAiRouterConfig: () => ({
        data: { enabled: true },
        isInitialLoading: false,
    }),
    useUpsertAiRouterConfig: () => ({ mutate: vi.fn(), isLoading: false }),
}));
vi.mock('../../../../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: false } }),
}));
vi.mock('./AiProvidersCard', () => ({ AiProvidersCard: () => null }));
vi.mock('./ReviewNotificationsSettings', () => ({
    ReviewNotificationsSettings: () => null,
}));
vi.mock('./AiRouterInstructionsCard', () => ({
    AiRouterInstructionsCard: () => <div>Router instructions</div>,
}));

beforeEach(() => {
    surfaces.mcpEnabled = true;
    surfaces.aiAgentsVisible = false;
    surfaces.slackEnabled = false;
});

it('disables the router when MCP is off and no other agent surface is enabled', () => {
    surfaces.mcpEnabled = false;
    renderWithProviders(<AiGeneralSettingsPage />);
    expect(screen.getByRole('switch', { name: 'AI Router' })).toBeDisabled();
    expect(screen.queryByText('Router instructions')).not.toBeInTheDocument();
});

it.each(['mcp', 'ui', 'slack'] as const)(
    'keeps the router available when the %s surface is enabled',
    (surface) => {
        surfaces.mcpEnabled = surface === 'mcp';
        surfaces.aiAgentsVisible = surface === 'ui';
        surfaces.slackEnabled = surface === 'slack';
        renderWithProviders(<AiGeneralSettingsPage />);
        expect(screen.getByRole('switch', { name: 'AI Router' })).toBeEnabled();
        expect(screen.getByText('Router instructions')).toBeInTheDocument();
    },
);
