import { MantineProvider } from '@mantine-8/core';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import NoProjectHomepage from './NoProjectHomepage';

const state = vi.hoisted(() => ({
    needsProject: true,
    isCopilotEnabled: true,
    isCopilotLoading: false,
    isHomepageBuilderEnabled: true,
    hasPendingActions: false,
    areActionsLoading: false,
}));

vi.mock('../../../providers/App/useApp', () => ({
    default: () => ({ user: { data: { firstName: 'Ada' } } }),
}));

vi.mock('../../../hooks/organization/useOrganization', () => ({
    useOrganization: () => ({
        data: { needsProject: state.needsProject },
        isInitialLoading: false,
    }),
}));

vi.mock('../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({
        data: { enabled: true },
        isLoading: false,
    }),
}));

vi.mock('../aiCopilot/hooks/useIsCopilotEnabled', () => ({
    useIsCopilotEnabled: () => ({
        isCopilotEnabled: state.isCopilotEnabled,
        isLoading: state.isCopilotLoading,
    }),
}));

vi.mock('./hooks/useProjectHomepage', () => ({
    useHomepageBuilderFlag: () => ({
        isEnabled: state.isHomepageBuilderEnabled,
        isLoading: false,
    }),
}));

vi.mock('./blocks/useRecommendedActions', () => ({
    useRecommendedActions: () => ({
        hasPendingActions: state.hasPendingActions,
        isLoading: state.areActionsLoading,
        visibleActions: ['connect-warehouse'],
        statuses: {
            'connect-warehouse': { url: '/onboarding/data-source' },
        },
    }),
}));

vi.mock('./blocks/RecommendedActionsChecklist', () => ({
    RecommendedActionsChecklist: () => <div data-testid="setup-checklist" />,
    RecommendedActionsChecklistPlaceholder: () => (
        <div data-testid="setup-checklist-hold" />
    ),
}));

vi.mock('./DayOneAskInput', () => ({
    DayOneAskInput: () => <div data-testid="ask-input" />,
    DayOneAskInputPlaceholder: () => <div data-testid="ask-input-hold" />,
}));

vi.mock('./HomepageStars', () => ({
    default: () => <div data-testid="homepage-stars" />,
}));

const renderHomepage = () =>
    render(
        <MantineProvider>
            <MemoryRouter initialEntries={['/get-started']}>
                <Routes>
                    <Route
                        path="/get-started"
                        element={<NoProjectHomepage />}
                    />
                    <Route path="/" element={<div>redirected</div>} />
                </Routes>
            </MemoryRouter>
        </MantineProvider>,
    );

describe('NoProjectHomepage', () => {
    beforeEach(() => {
        state.needsProject = true;
        state.isCopilotEnabled = true;
        state.isCopilotLoading = false;
        state.isHomepageBuilderEnabled = true;
        state.hasPendingActions = false;
        state.areActionsLoading = false;
    });

    it('renders the decorative sky on the stage that holds the hero', () => {
        renderHomepage();

        const sky = screen.getByTestId('homepage-stars');
        const stage = sky.parentElement!;
        // The sky is absolutely positioned, so it and the hero must share a
        // positioned stage — otherwise it paints over the greeting.
        expect(stage.className).toContain('heroStage');
        expect(stage).toContainElement(screen.getByTestId('ask-input'));
    });

    it('uses the getting started heading', () => {
        renderHomepage();

        expect(
            screen.getByRole('heading', { name: "Let's get started" }),
        ).toBeInTheDocument();
        expect(screen.queryByText('Good morning.')).toBeNull();
    });

    it('redirects away once the organization has a project', () => {
        state.needsProject = false;
        renderHomepage();

        expect(screen.getByText('redirected')).toBeInTheDocument();
        expect(screen.queryByTestId('homepage-stars')).toBeNull();
    });

    it('offers the warehouse connection instead of the composer without copilot', () => {
        state.isCopilotEnabled = false;
        renderHomepage();

        expect(screen.queryByText('redirected')).toBeNull();
        expect(screen.queryByTestId('ask-input')).toBeNull();
        expect(screen.getByTestId('homepage-stars')).toBeInTheDocument();
        const cta = screen.getByRole('link', {
            name: /Connect a data warehouse/,
        });
        expect(cta).toHaveAttribute('href', '/onboarding/data-source');
    });

    it('lets the setup checklist carry the warehouse step rather than repeating it', () => {
        state.isCopilotEnabled = false;
        state.hasPendingActions = true;
        renderHomepage();

        expect(screen.getByTestId('setup-checklist')).toBeInTheDocument();
        expect(
            screen.queryByRole('link', { name: /Connect a data warehouse/ }),
        ).toBeNull();
    });

    it('redirects away when the homepage builder is disabled', () => {
        state.isHomepageBuilderEnabled = false;
        renderHomepage();

        expect(screen.getByText('redirected')).toBeInTheDocument();
        expect(screen.queryByTestId('ask-input')).toBeNull();
    });

    it('waits for the copilot signal before deciding which hero to show', () => {
        state.isCopilotEnabled = false;
        state.isCopilotLoading = true;
        renderHomepage();

        expect(screen.queryByTestId('ask-input')).toBeNull();
        expect(
            screen.queryByRole('link', { name: /Connect a data warehouse/ }),
        ).toBeNull();
        // ...while still standing the page up, rather than blanking it
        expect(
            screen.getByRole('heading', { name: "Let's get started" }),
        ).toBeInTheDocument();
    });

    it('holds the hero in place while the setup statuses resolve', () => {
        state.areActionsLoading = true;
        state.hasPendingActions = false;
        renderHomepage();

        expect(
            screen.getByRole('heading', { name: "Let's get started" }),
        ).toBeInTheDocument();
        expect(screen.getByTestId('setup-checklist-hold')).toBeInTheDocument();
        expect(screen.getByTestId('ask-input-hold')).toBeInTheDocument();
        expect(screen.queryByTestId('ask-input')).toBeNull();
        expect(screen.queryByTestId('setup-checklist')).toBeNull();
    });

    it('redirects before painting the hold', () => {
        state.needsProject = false;
        state.areActionsLoading = true;
        renderHomepage();

        expect(screen.getByText('redirected')).toBeInTheDocument();
        expect(screen.queryByTestId('setup-checklist-hold')).toBeNull();
        expect(screen.queryByTestId('homepage-stars')).toBeNull();
    });
});
