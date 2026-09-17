import { FeatureFlags } from '@lightdash/common';
import { Button } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useManagedAgentLatestRun } from '../../ee/features/managedAgent/hooks/useManagedAgentLatestRun';
import { useManagedAgentSettings } from '../../ee/features/managedAgent/hooks/useManagedAgentSettings';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../providers/App/useApp';
import MantineBaseProvider from '../../providers/MantineBaseProvider';
import { AutopilotNavButton } from './AutopilotNavButton';

vi.mock(
    '../../ee/features/managedAgent/hooks/useManagedAgentLatestRun',
    () => ({ useManagedAgentLatestRun: vi.fn() }),
);

vi.mock('../../ee/features/managedAgent/hooks/useManagedAgentSettings', () => ({
    useManagedAgentSettings: vi.fn(),
}));

vi.mock('../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: vi.fn(),
}));

vi.mock('../../providers/App/useApp', () => ({ default: vi.fn() }));

vi.mock('../../ee/features/managedAgent/ManagedAgentSetupModal', () => ({
    ManagedAgentSetupModal: ({ opened }: { opened: boolean }) =>
        opened ? <div role="dialog">Autopilot setup</div> : null,
}));

const projectUuid = 'project-1';

describe('AutopilotNavButton', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(useApp).mockReturnValue({
            user: {
                data: {
                    organizationUuid: 'organization-1',
                    ability: { can: () => true },
                },
            },
        } as unknown as ReturnType<typeof useApp>);
        vi.mocked(useServerFeatureFlag).mockReturnValue({
            data: { id: FeatureFlags.AiAutopilot, enabled: true },
            isLoading: false,
        } as ReturnType<typeof useServerFeatureFlag>);
        vi.mocked(useManagedAgentSettings).mockReturnValue({
            data: undefined,
        } as ReturnType<typeof useManagedAgentSettings>);
        vi.mocked(useManagedAgentLatestRun).mockReturnValue({
            data: undefined,
        } as ReturnType<typeof useManagedAgentLatestRun>);
    });

    it('keeps setup reachable when Autopilot has not been configured', () => {
        const queryClient = new QueryClient();
        render(
            <QueryClientProvider client={queryClient}>
                <MantineBaseProvider env="test">
                    <MemoryRouter>
                        <AutopilotNavButton projectUuid={projectUuid} />
                    </MemoryRouter>
                </MantineBaseProvider>
            </QueryClientProvider>,
        );

        fireEvent.click(
            screen.getByRole('button', { name: 'Set up Autopilot' }),
        );

        expect(screen.getByRole('dialog')).toHaveTextContent('Autopilot setup');
    });

    it('keeps the setup button as the last element in a button group', () => {
        const queryClient = new QueryClient();
        render(
            <QueryClientProvider client={queryClient}>
                <MantineBaseProvider env="test">
                    <MemoryRouter>
                        <Button.Group>
                            <Button>Browse</Button>
                            <AutopilotNavButton projectUuid={projectUuid} />
                        </Button.Group>
                    </MemoryRouter>
                </MantineBaseProvider>
            </QueryClientProvider>,
        );

        const button = screen.getByRole('button', {
            name: 'Set up Autopilot',
        });

        expect(button.parentElement).toHaveAttribute('role', 'group');
        expect(button.parentElement?.lastElementChild).toBe(button);
    });
});
