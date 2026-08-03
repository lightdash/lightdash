import { CommercialFeatureFlags, FeatureFlags } from '@lightdash/common';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type FC, type PropsWithChildren } from 'react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('../api', () => ({
    lightdashApi: vi.fn(),
}));

vi.mock('../providers/App/useApp', () => ({
    default: () => ({
        health: { isInitialLoading: false, error: null, data: {} },
    }),
}));

import { lightdashApi } from '../api';
import Mantine8Provider from '../providers/Mantine8Provider';
import MantineProvider from '../providers/MantineProvider';
import { createQueryClient } from '../providers/ReactQuery/createQueryClient';
import AppRoute from './AppRoute';

const mockApi = lightdashApi as unknown as Mock;

const ORG_URL = '/org';
const PROJECT_ROUTE = '/projects/project-1/home';

const organization = (needsProject: boolean) => ({
    organizationUuid: 'org-1',
    name: 'Jaffle Shop',
    needsProject,
});

const NavigateButton: FC = () => {
    const navigate = useNavigate();
    return (
        <button type="button" onClick={() => void navigate(PROJECT_ROUTE)}>
            go to project
        </button>
    );
};

const Providers: FC<
    PropsWithChildren<{ queryClient: ReturnType<typeof createQueryClient> }>
> = ({ queryClient, children }) => (
    <QueryClientProvider client={queryClient}>
        <MantineProvider>
            <Mantine8Provider env="test">{children}</Mantine8Provider>
        </MantineProvider>
    </QueryClientProvider>
);

const setup = ({
    cachedNeedsProject,
    serverNeedsProject,
    cacheAgeMs = 0,
    primeFlagCache = false,
}: {
    cachedNeedsProject: boolean;
    serverNeedsProject: boolean;
    cacheAgeMs?: number;
    primeFlagCache?: boolean;
}) => {
    const calls: string[] = [];
    mockApi.mockImplementation(({ url }: { url: string }) => {
        calls.push(url);
        if (url === ORG_URL) {
            return Promise.resolve(organization(serverNeedsProject));
        }
        if (url === `/feature-flag/${FeatureFlags.NewOnboarding}`) {
            return Promise.resolve({
                id: FeatureFlags.NewOnboarding,
                enabled: true,
            });
        }
        if (url === `/feature-flag/${CommercialFeatureFlags.HomepageBuilder}`) {
            return Promise.resolve({
                id: CommercialFeatureFlags.HomepageBuilder,
                enabled: false,
            });
        }
        return Promise.resolve(null);
    });

    const queryClient = createQueryClient({ queries: { retry: false } });
    queryClient.setQueryData(
        ['organization'],
        organization(cachedNeedsProject),
        { updatedAt: Date.now() - cacheAgeMs },
    );
    if (primeFlagCache) {
        queryClient.setQueryData(
            ['feature-flag', CommercialFeatureFlags.HomepageBuilder],
            { id: CommercialFeatureFlags.HomepageBuilder, enabled: false },
        );
        queryClient.setQueryData(['feature-flag', FeatureFlags.NewOnboarding], {
            id: FeatureFlags.NewOnboarding,
            enabled: true,
        });
    }

    render(
        <Providers queryClient={queryClient}>
            <MemoryRouter initialEntries={['/start']}>
                <Routes>
                    <Route path="/start" element={<NavigateButton />} />
                    <Route
                        path="/projects/:projectUuid/home"
                        element={
                            <AppRoute>
                                <div>PROJECT PAGE</div>
                            </AppRoute>
                        }
                    />
                    <Route
                        path="/onboarding/data-source"
                        element={<div>ONBOARDING PAGE</div>}
                    />
                    <Route
                        path="/createProject"
                        element={<div>LEGACY CREATE PROJECT</div>}
                    />
                    <Route
                        path="/get-started"
                        element={<div>GET STARTED PAGE</div>}
                    />
                </Routes>
            </MemoryRouter>
        </Providers>,
    );

    return { calls };
};

const navigateToProject = async () => {
    const user = userEvent.setup();
    await user.click(
        await screen.findByRole('button', { name: 'go to project' }),
    );
};

describe('AppRoute onboarding gate freshness', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders the project from cache without a spinner or a revalidation when the organization already has projects', async () => {
        const { calls } = setup({
            cachedNeedsProject: false,
            serverNeedsProject: false,
            primeFlagCache: true,
        });

        await navigateToProject();

        expect(screen.getByText('PROJECT PAGE')).toBeInTheDocument();
        expect(screen.queryByTestId('page-spinner')).not.toBeInTheDocument();
        expect(calls.filter((url) => url === ORG_URL)).toHaveLength(0);
    });

    it('sends the user to onboarding when the organization genuinely has no projects', async () => {
        setup({ cachedNeedsProject: true, serverNeedsProject: true });

        await navigateToProject();

        expect(await screen.findByText('ONBOARDING PAGE')).toBeInTheDocument();
    });

    it('does not strand the user on onboarding when a fresh cached needsProject is already false on the server', async () => {
        const { calls } = setup({
            cachedNeedsProject: true,
            serverNeedsProject: false,
            primeFlagCache: true,
        });

        await navigateToProject();

        expect(await screen.findByText('PROJECT PAGE')).toBeInTheDocument();
        expect(screen.queryByText('ONBOARDING PAGE')).not.toBeInTheDocument();
        expect(calls.filter((url) => url === ORG_URL).length).toBeGreaterThan(
            0,
        );
    });

    it('does not strand the user on onboarding when a stale cached needsProject is already false on the server', async () => {
        setup({
            cachedNeedsProject: true,
            serverNeedsProject: false,
            cacheAgeMs: 60_000,
            primeFlagCache: true,
        });

        await navigateToProject();

        expect(await screen.findByText('PROJECT PAGE')).toBeInTheDocument();
        expect(screen.queryByText('ONBOARDING PAGE')).not.toBeInTheDocument();
    });
});
