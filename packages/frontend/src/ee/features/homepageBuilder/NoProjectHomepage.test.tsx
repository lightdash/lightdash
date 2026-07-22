import { MantineProvider } from '@mantine-8/core';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import NoProjectHomepage from './NoProjectHomepage';

const state = vi.hoisted(() => ({ needsProject: true }));

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

vi.mock('./blocks/useRecommendedActions', () => ({
    useRecommendedActions: () => ({ hasPendingActions: false }),
}));

vi.mock('./DayOneAskInput', () => ({
    DayOneAskInput: () => <div data-testid="ask-input" />,
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

    it('redirects away once the organization has a project', () => {
        state.needsProject = false;
        renderHomepage();

        expect(screen.getByText('redirected')).toBeInTheDocument();
        expect(screen.queryByTestId('homepage-stars')).toBeNull();
    });
});
