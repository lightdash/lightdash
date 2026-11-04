import { type HomepageAskAiHeroBlock } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { AskAiHeroBlockBuild, AskAiHeroBlockView } from './AskAiHeroBlock';

vi.mock('../DayOneAskInput', () => ({
    DayOneAskInput: () => <div data-testid="ask-input" />,
}));
vi.mock('../../../../providers/App/useApp', () => ({
    default: () => ({ user: { data: { firstName: 'Test' } } }),
}));
vi.mock('../../../../providers/Tracking/useTracking', () => ({
    default: () => ({ track: vi.fn() }),
}));
vi.mock('../../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({
        data: { enabled: state.isNewOnboarding },
        isLoading: false,
    }),
}));
vi.mock('./QuickActionsBlock', () => ({
    QuickActionCards: () => <div data-testid="quick-actions" />,
}));
const state = vi.hoisted(() => ({
    isLoading: false,
    isWarehouseConnected: true,
    hasPendingActions: false,
    canAskAi: true,
    isNewOnboarding: true,
}));

vi.mock('../hooks/useHasLiveSources', () => ({
    useHasLiveSources: () => false,
}));

vi.mock('../hooks/useHomepageAiState', () => ({
    useHomepageAiState: () => ({
        canAskAi: state.canAskAi,
        isLoading: false,
    }),
}));

vi.mock('./useRecommendedActions', () => ({
    useRecommendedActions: () => ({
        hasPendingActions: state.hasPendingActions,
        isLoading: state.isLoading,
        visibleActions: ['connect-warehouse'],
        statuses: {
            'connect-warehouse': {
                isComplete: state.isWarehouseConnected,
            },
        },
    }),
}));

vi.mock('./setupGuide/SetupGuide', () => ({
    SetupGuide: () => <div data-testid="setup-guide" />,
}));
vi.mock('./RecommendedActionsChecklist', () => ({
    RecommendedActionsChecklist: () => <div data-testid="checklist" />,
    RecommendedActionsChecklistPlaceholder: () => null,
}));

const block: HomepageAskAiHeroBlock = {
    id: 'b1',
    type: 'ask-ai-hero',
    config: { showGreeting: true },
};

const blockWithChecklist: HomepageAskAiHeroBlock = {
    ...block,
    config: { showGreeting: true, showRecommendedActions: true },
};

const wrap = (ui: React.ReactNode) =>
    render(<MantineProvider env="test">{ui}</MantineProvider>);

describe('AskAiHeroBlockView', () => {
    beforeEach(() => {
        state.isLoading = false;
        state.isWarehouseConnected = true;
        state.hasPendingActions = false;
        state.canAskAi = true;
        state.isNewOnboarding = true;
    });

    it('renders the greeting hero with quick actions when AI is unavailable', () => {
        state.canAskAi = false;
        wrap(
            <AskAiHeroBlockView
                itemSpan={null}
                block={block}
                projectUuid="p1"
            />,
        );
        expect(screen.queryByTestId('ask-input')).toBeNull();
        expect(screen.getByText(/Good \w+, Test/)).toBeInTheDocument();
        // The full content-first hero: quick actions directly under the
        // greeting, matching day-0 and the opt-in preview.
        expect(screen.getByTestId('quick-actions')).toBeInTheDocument();
    });

    it('greets in the hero slot', () => {
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

    it('uses the getting started heading before a warehouse is connected', () => {
        state.isWarehouseConnected = false;

        wrap(
            <AskAiHeroBlockView
                itemSpan={null}
                block={block}
                projectUuid="p1"
            />,
        );

        expect(
            screen.getByRole('heading', { name: "Let's get started" }),
        ).toBeInTheDocument();
        expect(screen.queryByText(/What do you want to know/)).toBeNull();
    });

    it('holds the heading area while the warehouse status is loading', () => {
        state.isLoading = true;

        wrap(
            <AskAiHeroBlockView
                itemSpan={null}
                block={block}
                projectUuid="p1"
            />,
        );

        expect(screen.queryByRole('heading')).toBeNull();
        expect(screen.getByTestId('ask-input')).toBeInTheDocument();
    });

    it('holds the heading while the setup guide holds itself', () => {
        state.isLoading = true;

        wrap(
            <AskAiHeroBlockView
                itemSpan={null}
                block={blockWithChecklist}
                projectUuid="p1"
            />,
        );

        expect(screen.queryByRole('heading')).toBeNull();
        expect(screen.getByTestId('setup-guide')).toBeInTheDocument();
        // The composer keeps fetching behind its own hold rather than waiting
        // for the reveal to start
        expect(screen.getByTestId('ask-input')).toBeInTheDocument();
    });

    it('reveals the heading alongside the setup guide', () => {
        wrap(
            <AskAiHeroBlockView
                itemSpan={null}
                block={blockWithChecklist}
                projectUuid="p1"
            />,
        );

        expect(screen.getByRole('heading')).toBeInTheDocument();
        expect(screen.getByTestId('setup-guide')).toBeInTheDocument();
    });

    it('keeps the original checklist when new onboarding is off', () => {
        state.isNewOnboarding = false;
        state.hasPendingActions = true;

        wrap(
            <AskAiHeroBlockView
                itemSpan={null}
                block={blockWithChecklist}
                projectUuid="p1"
            />,
        );

        expect(screen.getByTestId('checklist')).toBeInTheDocument();
        expect(screen.queryByTestId('setup-guide')).toBeNull();
    });

    it('leaves the setup guide out when the block hides it', () => {
        wrap(
            <AskAiHeroBlockView
                itemSpan={null}
                block={block}
                projectUuid="p1"
            />,
        );

        expect(screen.queryByTestId('setup-guide')).toBeNull();
    });
});

describe('AskAiHeroBlockBuild', () => {
    it('does not offer recommended actions configuration', () => {
        wrap(
            <AskAiHeroBlockBuild
                itemSpan={null}
                block={block}
                projectUuid="p1"
                onChange={vi.fn()}
            />,
        );

        expect(
            screen.getByRole('switch', { name: 'Show greeting' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('switch', {
                name: 'Show recommended actions',
            }),
        ).not.toBeInTheDocument();
    });
});
