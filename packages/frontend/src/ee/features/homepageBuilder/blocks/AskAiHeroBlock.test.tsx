import { type HomepageAskAiHeroBlock } from '@lightdash/common';
import { MantineProvider } from '@mantine-8/core';
import { render, screen } from '@testing-library/react';
import { AskAiHeroBlockView } from './AskAiHeroBlock';

vi.mock('../DayOneAskInput', () => ({
    DayOneAskInput: () => <div data-testid="ask-input" />,
}));
vi.mock('../../aiCopilot/hooks/useAiAgentsButtonVisibility', () => ({
    useAiAgentButtonVisibility: () => true,
}));
vi.mock('../../../../providers/App/useApp', () => ({
    default: () => ({ user: { data: { firstName: 'Test' } } }),
}));
vi.mock('./useRecommendedActions', () => ({
    useRecommendedActions: () => ({ hasPendingActions: false }),
}));

const block: HomepageAskAiHeroBlock = {
    id: 'b1',
    type: 'ask-ai-hero',
    config: { showGreeting: true },
};

const wrap = (ui: React.ReactNode) =>
    render(<MantineProvider>{ui}</MantineProvider>);

describe('AskAiHeroBlockView', () => {
    it('greets in the hero slot', () => {
        wrap(
            <AskAiHeroBlockView
                itemSpan={null}
                block={block}
                projectUuid="p1"
                presentation="hero"
            />,
        );
        expect(
            screen.getByText(/What do you want to know/),
        ).toBeInTheDocument();
        expect(screen.getByTestId('ask-input')).toBeInTheDocument();
    });

    it('greets inline mid-page when toggled on', () => {
        wrap(
            <AskAiHeroBlockView
                itemSpan={null}
                block={block}
                projectUuid="p1"
            />,
        );
        expect(
            screen.getByText(/What do you want to know/),
        ).toBeInTheDocument();
        expect(screen.getByTestId('ask-input')).toBeInTheDocument();
    });

    it('does not greet when the toggle is off', () => {
        wrap(
            <AskAiHeroBlockView
                itemSpan={null}
                block={{ ...block, config: { showGreeting: false } }}
                projectUuid="p1"
            />,
        );
        expect(screen.queryByText(/What do you want to know/)).toBeNull();
        expect(screen.getByTestId('ask-input')).toBeInTheDocument();
    });
});
