import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import NoProjectHomepage from './NoProjectHomepage';

const state = vi.hoisted(() => ({
    needsProject: true,
    isHomepageBuilderEnabled: true,
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

vi.mock('./hooks/useProjectHomepage', () => ({
    useHomepageBuilderFlag: () => ({
        isEnabled: state.isHomepageBuilderEnabled,
        isLoading: false,
    }),
}));

vi.mock(
    '../../../components/ProjectConnection/ProjectConnectFlow/DataSourceChooser',
    () => ({
        DataSourceChooser: () => <div data-testid="data-source-chooser" />,
    }),
);

vi.mock('../../../components/common/OnboardingLayout', () => ({
    default: ({ children }: { children: React.ReactNode }) => (
        <div>{children}</div>
    ),
}));

const client = new QueryClient();

const homepageTree = () => (
    <QueryClientProvider client={client}>
        <MantineProvider env="test">
            <MemoryRouter initialEntries={['/get-started']}>
                <Routes>
                    <Route
                        path="/get-started"
                        element={<NoProjectHomepage />}
                    />
                    <Route path="/" element={<div>redirected</div>} />
                </Routes>
            </MemoryRouter>
        </MantineProvider>
    </QueryClientProvider>
);

const renderHomepage = () => render(homepageTree());

describe('NoProjectHomepage', () => {
    beforeEach(() => {
        state.needsProject = true;
        state.isHomepageBuilderEnabled = true;
    });

    it('asks where the data lives and offers the chooser', () => {
        renderHomepage();

        expect(
            screen.getByRole('heading', { name: 'Connect your data' }),
        ).toBeInTheDocument();
        expect(screen.getByTestId('data-source-chooser')).toBeInTheDocument();
    });

    it('redirects away once the organization has a project', () => {
        state.needsProject = false;
        renderHomepage();

        expect(screen.getByText('redirected')).toBeInTheDocument();
    });

    it('stays put when a project appears after arrival', () => {
        const { rerender } = renderHomepage();
        state.needsProject = false;
        rerender(homepageTree());

        expect(screen.queryByText('redirected')).toBeNull();
        expect(screen.getByTestId('data-source-chooser')).toBeInTheDocument();
    });

    it('redirects away when the homepage builder is disabled', () => {
        state.isHomepageBuilderEnabled = false;
        renderHomepage();

        expect(screen.getByText('redirected')).toBeInTheDocument();
    });
});
