import { Ability } from '@casl/ability';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type LightdashApi } from '../api';
import { useCollectionContent } from '../ee/features/homepageBuilder/hooks/useCollectionContent';
import type * as homepageHooks from '../ee/features/homepageBuilder/hooks/useProjectHomepage';
import { mockedLightdashApi } from '../testing/mockedLightdashApi';
import Home from './Home';

const homepageFlag = vi.hoisted(() => ({
    isEnabled: true,
    isLoading: false,
    projectUuid: 'project-1',
}));

vi.mock('../api');
vi.mock('../hooks/useProjectUuid', () => ({
    useProjectUuid: () => homepageFlag.projectUuid,
}));
vi.mock('../hooks/useQueryError', () => ({ default: () => vi.fn() }));
vi.mock('../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: false } }),
}));
vi.mock('../providers/App/useApp', () => ({
    default: () => ({
        user: {
            data: {
                firstName: 'Ada',
                ability: new Ability([{ action: 'view', subject: 'Project' }]),
            },
        },
    }),
}));
vi.mock(
    '../ee/features/homepageBuilder/hooks/useProjectHomepage',
    async (importOriginal) => ({
        ...(await importOriginal<typeof homepageHooks>()),
        useHomepageBuilderFlag: () => homepageFlag,
    }),
);
vi.mock('../ee/features/aiCopilot/hooks/useAiAgentsButtonVisibility', () => ({
    useAiAgentButtonVisibility: () => false,
}));
vi.mock('../components/common/Page/Page', () => ({
    default: ({ children }: PropsWithChildren) => <>{children}</>,
}));
vi.mock('../components/PageSpinner', () => ({
    default: () => <div>Loading homepage</div>,
}));
vi.mock('../components/Home/LandingPanel', () => ({ default: () => null }));
vi.mock('../components/Home/OnboardingPanel/index', () => ({
    default: () => null,
}));
vi.mock('../components/PinnedAndFavoritesSection', () => ({
    default: () => null,
}));
vi.mock('../components/Home/HomepageContentPanel', () => ({
    HomepageContentPanel: () => <div>Classic homepage</div>,
}));
vi.mock('../ee/components/Home/AiSearchBox', () => ({ default: () => null }));
vi.mock('../ee/features/managedAgent/ManagedAgentHomeCard', () => ({
    ManagedAgentHomeCard: () => null,
}));
vi.mock('../ee/features/homepageBuilder/AdminHomepageControls', () => ({
    AdminHomepageControls: () => null,
}));
vi.mock('../ee/features/homepageBuilder/blocks/FavoritesBlock', () => ({
    PersonalFavoritesBar: () => null,
}));
vi.mock('../ee/features/homepageBuilder/TryNewHomepagePromo', () => ({
    TryNewHomepageCard: () => null,
    TryNewHomepageModal: () => null,
}));
vi.mock('../ee/features/homepageBuilder/DayOneHomepage', () => ({
    DayOneHomepage: () => <div>Default homepage</div>,
}));
vi.mock('../providers/Favorites/FavoritesProvider', () => ({
    FavoritesProvider: ({ children }: PropsWithChildren) => <>{children}</>,
}));
vi.mock('../providers/PinnedItems/PinnedItemsProvider', () => ({
    PinnedItemsProvider: ({ children }: PropsWithChildren) => <>{children}</>,
}));
vi.mock('../ee/features/homepageBuilder/PublishedHomepage', () => ({
    PublishedHomepage: ({ projectUuid }: { projectUuid: string }) => {
        const content = useCollectionContent(projectUuid, ['chart-1']);
        return (
            <div>
                {content.data ? 'Collection loaded' : 'Loading collection'}
            </div>
        );
    },
}));

const resolvedHomepage = {
    type: 'homepage',
    homepage: {
        homepageUuid: 'homepage-1',
        name: 'Team homepage',
        config: { version: 1, rows: [] },
    },
};

const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((resolvePromise) => {
        resolve = resolvePromise;
    });
    return { promise, resolve };
};

const renderHome = () => {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false, cacheTime: 0 } },
    });
    const element = () => (
        <QueryClientProvider client={client}>
            <MantineProvider env="test">
                <Home />
            </MantineProvider>
        </QueryClientProvider>
    );
    const view = render(element());
    return { ...view, client, refresh: () => view.rerender(element()) };
};

const apiMock = mockedLightdashApi;
const requestedUrls = () => apiMock.mock.calls.map(([args]) => args.url);

describe('homepage content loading', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        homepageFlag.isEnabled = true;
        homepageFlag.isLoading = false;
        homepageFlag.projectUuid = 'project-1';
    });

    const mockApi = (overrides: Record<string, unknown>) => {
        const responses: Record<string, unknown> = {
            '/projects/project-1': {
                projectUuid: 'project-1',
                organizationUuid: 'org-1',
                name: 'Project',
                slug: 'project',
                type: 'default',
                dbtConnection: { type: 'manual' },
                pinnedListUuid: 'pins-1',
            },
            '/org/onboardingStatus': { ranQuery: true },
            '/projects/project-1/homepage': resolvedHomepage,
            '/projects/project-1/favorites': [],
            '/projects/project-1/pinned-lists/pins-1/items': [],
            '/projects/project-1/most-popular-and-recently-updated': {
                mostPopular: [],
                recentlyUpdated: [],
            },
            '/content?projectUuids=project-1&uuids=chart-1&pageSize=10': {
                data: [],
            },
            ...overrides,
        };
        apiMock.mockImplementation(async ({ url }) => {
            if (!(url in responses))
                throw new Error(`Unexpected request: ${url}`);
            if (responses[url] instanceof Error) throw responses[url];
            return (await responses[url]) as Awaited<ReturnType<LightdashApi>>;
        });
    };

    it('starts published collections while fallback content and favorites remain pending', async () => {
        const homepage = deferred<typeof resolvedHomepage>();
        mockApi({
            '/projects/project-1/homepage': homepage.promise,
            '/projects/project-1/favorites': new Promise(() => {}),
            '/projects/project-1/most-popular-and-recently-updated':
                new Promise(() => {}),
            '/projects/project-1/pinned-lists/pins-1/items': new Promise(
                () => {},
            ),
        });
        renderHome();
        await waitFor(() =>
            expect(requestedUrls()).toContain('/projects/project-1/homepage'),
        );
        expect(
            requestedUrls().some((url) =>
                /most-popular|pinned-lists/.test(url),
            ),
        ).toBe(true);
        expect(screen.getByText('Loading homepage')).toBeInTheDocument();

        await act(async () => homepage.resolve(resolvedHomepage));

        expect(
            await screen.findByText('Collection loaded'),
        ).toBeInTheDocument();
        expect(screen.queryByText('Loading homepage')).not.toBeInTheDocument();
        expect(
            requestedUrls().some((url) =>
                /most-popular|pinned-lists/.test(url),
            ),
        ).toBe(true);
    });

    it.each([
        { enabled: false, label: 'Classic homepage' },
        { enabled: true, label: 'Default homepage' },
    ])(
        'keeps $label waiting for its required content',
        async ({ enabled, label }) => {
            homepageFlag.isEnabled = enabled;
            const popular = deferred<{
                mostPopular: never[];
                recentlyUpdated: never[];
            }>();
            mockApi({
                '/projects/project-1/homepage': null,
                '/projects/project-1/most-popular-and-recently-updated':
                    popular.promise,
            });
            renderHome();
            await waitFor(() =>
                expect(requestedUrls()).toContain(
                    '/projects/project-1/most-popular-and-recently-updated',
                ),
            );
            await waitFor(() =>
                expect(requestedUrls()).toContain(
                    '/projects/project-1/pinned-lists/pins-1/items',
                ),
            );
            expect(screen.queryByText(label)).not.toBeInTheDocument();

            await act(async () =>
                popular.resolve({ mostPopular: [], recentlyUpdated: [] }),
            );

            expect(await screen.findByText(label)).toBeInTheDocument();
        },
    );
    it('loads default content in parallel with unresolved homepage configuration', async () => {
        const homepage = deferred<null>();
        mockApi({ '/projects/project-1/homepage': homepage.promise });
        renderHome();
        await waitFor(() => {
            expect(requestedUrls()).toContain(
                '/projects/project-1/most-popular-and-recently-updated',
            );
            expect(requestedUrls()).toContain(
                '/projects/project-1/pinned-lists/pins-1/items',
            );
        });
        expect(screen.getByText('Loading homepage')).toBeInTheDocument();
        await act(async () => homepage.resolve(null));
        expect(await screen.findByText('Default homepage')).toBeInTheDocument();
    });

    it('falls back to classic after a configuration failure and recovers after retry', async () => {
        mockApi({
            '/projects/project-1/homepage': new Error(
                'Configuration unavailable',
            ),
        });
        const { client } = renderHome();
        expect(await screen.findByText('Classic homepage')).toBeInTheDocument();
        mockApi({});
        await act(async () => {
            await client.invalidateQueries([
                'project_homepage',
                'project-1',
                'resolved',
            ]);
        });
        expect(
            await screen.findByText('Collection loaded'),
        ).toBeInTheDocument();
        expect(screen.queryByText('Classic homepage')).not.toBeInTheDocument();
    });

    it('restores fallback loading when the homepage feature is disabled and reuses the published page when enabled', async () => {
        const popular = deferred<{
            mostPopular: never[];
            recentlyUpdated: never[];
        }>();
        mockApi({
            '/projects/project-1/most-popular-and-recently-updated':
                popular.promise,
        });
        const { refresh } = renderHome();
        expect(
            await screen.findByText('Collection loaded'),
        ).toBeInTheDocument();
        homepageFlag.isEnabled = false;
        refresh();
        expect(screen.getByText('Loading homepage')).toBeInTheDocument();
        expect(screen.queryByText('Collection loaded')).not.toBeInTheDocument();
        await act(async () =>
            popular.resolve({ mostPopular: [], recentlyUpdated: [] }),
        );
        expect(await screen.findByText('Classic homepage')).toBeInTheDocument();
        homepageFlag.isEnabled = true;
        refresh();
        expect(
            await screen.findByText('Collection loaded'),
        ).toBeInTheDocument();
        expect(screen.queryByText('Classic homepage')).not.toBeInTheDocument();
    });

    it('does not reuse the previous project homepage while the next project resolves', async () => {
        const homepage = deferred<null>();
        const popular = deferred<{
            mostPopular: never[];
            recentlyUpdated: never[];
        }>();
        mockApi({
            '/projects/project-2': {
                projectUuid: 'project-2',
                organizationUuid: 'org-1',
                name: 'Second project',
                slug: 'second-project',
                type: 'default',
                dbtConnection: { type: 'manual' },
                pinnedListUuid: 'pins-2',
            },
            '/projects/project-2/homepage': homepage.promise,
            '/projects/project-2/favorites': [],
            '/projects/project-2/pinned-lists/pins-2/items': [],
            '/projects/project-2/most-popular-and-recently-updated':
                popular.promise,
        });
        const { refresh } = renderHome();
        expect(
            await screen.findByText('Collection loaded'),
        ).toBeInTheDocument();
        homepageFlag.projectUuid = 'project-2';
        refresh();
        expect(screen.getByText('Loading homepage')).toBeInTheDocument();
        expect(screen.queryByText('Collection loaded')).not.toBeInTheDocument();
        await waitFor(() =>
            expect(requestedUrls()).toContain('/projects/project-2/homepage'),
        );
        await act(async () => homepage.resolve(null));
        expect(screen.getByText('Loading homepage')).toBeInTheDocument();
        await act(async () =>
            popular.resolve({ mostPopular: [], recentlyUpdated: [] }),
        );
        expect(await screen.findByText('Default homepage')).toBeInTheDocument();
        expect(requestedUrls()).not.toContain(
            '/content?projectUuids=project-2&uuids=chart-1&pageSize=10',
        );
    });
});
