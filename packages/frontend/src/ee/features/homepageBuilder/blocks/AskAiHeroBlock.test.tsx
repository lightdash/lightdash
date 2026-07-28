import { type HomepageAskAiHeroBlock } from '@lightdash/common';
import { MantineProvider } from '@mantine-8/core';
import { render, screen } from '@testing-library/react';
import { AskAiHeroBlockBuild, AskAiHeroBlockView } from './AskAiHeroBlock';

vi.mock('../DayOneAskInput', () => ({
    DayOneAskInput: () => <div data-testid="ask-input" />,
}));
const mockIsAiEnabled = vi.hoisted(() => ({ value: true }));
vi.mock('../hooks/useHomepageAiEnabled', () => ({
    useHomepageAiEnabled: () => mockIsAiEnabled.value,
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

    describe('without a configured agent', () => {
        beforeEach(() => {
            mockIsAiEnabled.value = false;
        });
        afterEach(() => {
            mockIsAiEnabled.value = true;
        });

        it('keeps the greeting as a plain header, without the composer', () => {
            wrap(
                <AskAiHeroBlockView
                    itemSpan={null}
                    block={block}
                    projectUuid="p1"
                />,
            );
            expect(screen.getByText(/^Good /)).toBeInTheDocument();
            expect(screen.queryByText(/What do you want to know/)).toBeNull();
            expect(screen.queryByTestId('ask-input')).toBeNull();
        });

        it('renders nothing when the greeting is off', () => {
            wrap(
                <AskAiHeroBlockView
                    itemSpan={null}
                    block={{ ...block, config: { showGreeting: false } }}
                    projectUuid="p1"
                />,
            );
            expect(screen.queryByRole('heading')).toBeNull();
            expect(screen.queryByTestId('ask-input')).toBeNull();
        });
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
