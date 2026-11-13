import { type AiAgentSummary } from '@lightdash/common';
import { MantineProvider, Text } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useDefaultAiAgent } from '../../ee/features/aiCopilot/components/Launcher/useDefaultAiAgent';
import {
    openDefaultAgentPanel,
    resetActivePanel,
} from '../../ee/features/aiCopilot/store/aiAgentLauncherSlice';
import { AnalyticsAskAiButton } from './AnalyticsAskAiButton';

const dispatch = vi.hoisted(() => vi.fn());
vi.mock('../../ee/features/aiCopilot/store/hooks', () => ({
    useAiAgentStoreDispatch: () => dispatch,
}));
vi.mock(
    '../../ee/features/aiCopilot/components/Launcher/useDefaultAiAgent',
    () => ({ useDefaultAiAgent: vi.fn() }),
);
vi.mock(
    '../../ee/features/aiCopilot/components/Launcher/AiAgentsLauncher',
    () => ({
        AiAgentsLauncher: ({
            projectUuid,
            forceVisible,
        }: {
            projectUuid: string;
            forceVisible: boolean;
        }) => (
            <Text>
                {forceVisible ? 'Open' : 'Hidden'} agent in {projectUuid}
            </Text>
        ),
    }),
);

const agent = { uuid: 'agent-1', name: 'Analytics agent' } as AiAgentSummary;
const readyAgent: ReturnType<typeof useDefaultAiAgent> = {
    agent,
    selectedAgent: agent,
    agents: [agent],
    agentsUpdatedAt: 1,
    isResolving: false,
};

const renderButton = () =>
    render(
        <MantineProvider env="test">
            <AnalyticsAskAiButton projectUuid="analytics-project" />
        </MantineProvider>,
    );

describe('AnalyticsAskAiButton', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(useDefaultAiAgent).mockReturnValue(readyAgent);
    });

    it('opens the analytics launcher only on click and clears previous thread context', async () => {
        const { unmount } = renderButton();
        expect(useDefaultAiAgent).toHaveBeenCalledWith('analytics-project');
        expect(dispatch).not.toHaveBeenCalled();
        expect(screen.queryByText(/Open agent/)).not.toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: 'Ask AI' }));

        expect(dispatch).toHaveBeenCalledExactlyOnceWith(
            openDefaultAgentPanel({}),
        );
        expect(
            await screen.findByText('Open agent in analytics-project'),
        ).toBeVisible();
        unmount();
        expect(dispatch).toHaveBeenLastCalledWith(resetActivePanel());
    });

    it('disables the button while the managed agent is resolving', async () => {
        vi.mocked(useDefaultAiAgent).mockReturnValue({
            ...readyAgent,
            selectedAgent: null,
            isResolving: true,
        });
        renderButton();
        const button = screen.getByRole('button', { name: 'Ask AI' });
        expect(button).toBeDisabled();
        await userEvent.hover(button.parentElement!);
        expect(await screen.findByRole('tooltip')).toHaveTextContent(
            'Preparing the analytics agent',
        );
        expect(dispatch).not.toHaveBeenCalled();
    });

    it('explains when no managed agent is available', async () => {
        vi.mocked(useDefaultAiAgent).mockReturnValue({
            ...readyAgent,
            selectedAgent: null,
            agents: [],
        });
        renderButton();
        const button = screen.getByRole('button', { name: 'Ask AI' });
        expect(button).toBeDisabled();
        await userEvent.hover(button.parentElement!);
        expect(await screen.findByRole('tooltip')).toHaveTextContent(
            'The analytics agent is not available yet.',
        );
    });
});
