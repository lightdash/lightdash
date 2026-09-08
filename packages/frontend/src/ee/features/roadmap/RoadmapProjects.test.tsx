import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { RoadmapApiContext } from './roadmapApi';
import { createRoadmapMockApi } from './roadmapMockApi';
import { RoadmapProjects } from './RoadmapProjects';

vi.mock('../../../api', () => ({ lightdashApi: vi.fn() }));
vi.mock('./RoadmapRequestDetails', () => ({
    RoadmapRequestDetails: () => null,
}));

function setup(
    scenario: Parameters<typeof createRoadmapMockApi>[0] = 'populated',
) {
    const api = createRoadmapMockApi(scenario, 0);
    const getRequests = vi.spyOn(api, 'getRequests');
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
        logger: { log: console.log, warn: console.warn, error: () => {} },
    });
    render(
        <MantineProvider env="test">
            <QueryClientProvider client={client}>
                <RoadmapApiContext.Provider value={api}>
                    <MemoryRouter>
                        <RoadmapProjects cacheKey="test" />
                    </MemoryRouter>
                </RoadmapApiContext.Provider>
            </QueryClientProvider>
        </MantineProvider>,
    );
    return { getRequests };
}

describe('Project roadmap', () => {
    afterEach(() => vi.useRealTimers());

    it('mixes projects and loose tickets and opens a followed-ticket board without a sidebar', async () => {
        const { getRequests } = setup();
        const project = await screen.findByRole('button', {
            name: 'Open More flexible dashboard filters',
        });
        expect(screen.queryByText('Other requests')).not.toBeInTheDocument();
        const unfollowedProject = screen.getByRole('button', {
            name: 'Open A single home for your metrics',
        });
        expect(unfollowedProject).toBeInTheDocument();
        expect(
            within(unfollowedProject).queryByText(/followed|following/i),
        ).not.toBeInTheDocument();
        expect(
            within(project).getByText('4 tickets followed'),
        ).toBeInTheDocument();

        expect(
            screen.getByRole('button', {
                name: 'Open ticket Export tables with their number formatting',
            }),
        ).toBeInTheDocument();
        expect(
            within(project).getByLabelText('68% overall project progress'),
        ).toBeInTheDocument();
        expect(getRequests).not.toHaveBeenCalledWith(
            expect.objectContaining({ groupId: 'dashboard-filters' }),
        );
        fireEvent.click(project);
        await screen.findByRole('button', {
            name: 'Open ticket Apply one date filter across every dashboard tab',
        });
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(
            screen.getByRole('heading', {
                name: 'More flexible dashboard filters',
            }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('region', { name: 'Done tickets' }),
        ).toHaveTextContent('Filter dashboards by several values at once');
        expect(
            screen.queryByText('Set workspace-wide filter defaults'),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByText('Export tables with their number formatting'),
        ).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('link', { name: 'Roadmap' }));
        await screen.findByRole('button', {
            name: 'Open ticket Export tables with their number formatting',
        });
    });

    it('switches between board and table while preserving project navigation and priorities', async () => {
        setup();
        const project = await screen.findByRole('button', {
            name: 'Open More flexible dashboard filters',
        });
        expect(within(project).getByText('High')).toBeInTheDocument();
        expect(within(project).queryByText('Project')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('radio', { name: 'Table' }));
        const table = screen.getByRole('table', { name: 'Roadmap items' });
        expect(
            within(table).getByRole('columnheader', { name: 'Priority' }),
        ).toBeInTheDocument();
        expect(within(table).getByText('DEMO-6')).toBeInTheDocument();
        expect(within(table).getByText('68%')).toBeInTheDocument();
        fireEvent.click(
            within(table).getByRole('button', {
                name: 'Open More flexible dashboard filters',
            }),
        );
        await screen.findByRole('button', {
            name: 'Open ticket Save personal filter defaults',
        });
        expect(screen.getByRole('radio', { name: 'Table' })).toBeChecked();
        expect(screen.getByRole('table')).toHaveTextContent('DEMO-2');
        expect(screen.getByRole('table')).not.toHaveTextContent('DEMO-6');
        fireEvent.click(screen.getByRole('radio', { name: 'Board' }));
        expect(
            screen.getByRole('region', { name: 'In progress tickets' }),
        ).toHaveTextContent('High');
        fireEvent.click(screen.getByRole('link', { name: 'Roadmap' }));
        await screen.findByRole('button', {
            name: 'Open A single home for your metrics',
        });
        expect(screen.getByRole('radio', { name: 'Board' })).toBeChecked();
    });

    it('includes Done projects and filters interests without hiding direct needs that have no tickets', async () => {
        setup();
        const completed = await screen.findByRole('button', {
            name: 'Open Instant dashboard previews',
        });
        expect(
            screen.getByRole('region', { name: 'Done roadmap items' }),
        ).toContainElement(completed);
        fireEvent.click(screen.getByRole('button', { name: /^Interest/ }));
        expect(
            within(screen.getByRole('button', { name: 'All' })).getByRole(
                'radio',
            ),
        ).toBeChecked();
        fireEvent.click(screen.getByRole('button', { name: 'Following' }));
        expect(
            within(screen.getByRole('button', { name: 'Following' })).getByRole(
                'radio',
            ),
        ).toBeChecked();
        expect(
            within(screen.getByRole('button', { name: 'All' })).getByRole(
                'radio',
            ),
        ).not.toBeChecked();
        fireEvent.click(screen.getByRole('button', { name: /^Interest/ }));
        await waitFor(() =>
            expect(
                screen.queryByRole('button', {
                    name: 'Open Instant dashboard previews',
                }),
            ).not.toBeInTheDocument(),
        );
        expect(
            await screen.findByRole('button', {
                name: 'Open A single home for your metrics',
            }),
        ).toHaveTextContent('Interested');
        expect(
            screen.getByRole('button', {
                name: 'Open ticket Export tables with their number formatting',
            }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', {
                name: 'Open Scheduled reports that fit your workflow',
            }),
        ).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('radio', { name: 'Table' }));
        expect(screen.getByRole('table')).toHaveTextContent('Interested');
        fireEvent.click(screen.getByRole('button', { name: /^Interest/ }));
        fireEvent.click(screen.getByRole('button', { name: 'All' }));
        fireEvent.click(screen.getByRole('button', { name: /^Interest/ }));
        await screen.findByRole('button', {
            name: 'Open Instant dashboard previews',
        });
    });

    it('filters the full catalog and keeps project ticket filters separate', async () => {
        setup('pagination');
        await screen.findByRole('button', { name: 'Load more projects' });
        expect(
            screen.queryByRole('button', {
                name: 'Open More flexible dashboard filters',
            }),
        ).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Status' }));
        fireEvent.click(screen.getByRole('button', { name: 'In progress' }));
        fireEvent.click(screen.getByRole('button', { name: /Status/ }));
        const project = await screen.findByRole('button', {
            name: 'Open More flexible dashboard filters',
        });
        expect(
            screen.queryByRole('button', { name: 'Load more projects' }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('region', { name: 'Backlog roadmap items' }),
        ).not.toBeInTheDocument();
        fireEvent.click(project);
        await screen.findByRole('button', {
            name: 'Open ticket Save personal filter defaults',
        });
        fireEvent.click(screen.getByRole('button', { name: 'Priority' }));
        fireEvent.click(screen.getByRole('button', { name: 'High' }));
        fireEvent.click(screen.getByRole('button', { name: /Priority/ }));
        await screen.findByRole('button', {
            name: 'Open ticket Followed filter improvement 12',
        });
        expect(
            screen.queryByRole('button', {
                name: 'Open ticket Save personal filter defaults',
            }),
        ).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('link', { name: 'Roadmap' }));
        await screen.findByRole('button', {
            name: 'Open More flexible dashboard filters',
        });
        expect(
            screen.queryByRole('region', { name: 'Backlog roadmap items' }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Priority' }),
        ).toBeInTheDocument();
    });

    it('combines backlog and planned projects and tickets in one customer status', async () => {
        const { getRequests } = setup();
        await screen.findByRole('button', {
            name: 'Open A single home for your metrics',
        });
        const planned = screen.getByRole('region', {
            name: 'Backlog roadmap items',
        });
        expect(planned).toHaveTextContent(
            'Scheduled reports that fit your workflow',
        );
        expect(planned).toHaveTextContent('A single home for your metrics');
        expect(planned).toHaveTextContent(
            'Export tables with their number formatting',
        );
        expect(screen.queryByText('Planned')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Status' }));
        expect(
            screen.queryByRole('button', { name: 'Planned' }),
        ).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Backlog' }));
        fireEvent.click(screen.getByRole('button', { name: /Status/ }));
        await waitFor(() =>
            expect(getRequests).toHaveBeenCalledWith(
                expect.objectContaining({ statuses: 'backlog,planned' }),
            ),
        );
        await screen.findByRole('button', {
            name: 'Open Scheduled reports that fit your workflow',
        });
        expect(
            screen.getByRole('button', {
                name: 'Open A single home for your metrics',
            }),
        ).toBeInTheDocument();
        fireEvent.click(screen.getByRole('radio', { name: 'Table' }));
        const table = screen.getByRole('table');
        expect(within(table).getAllByText('Backlog')).toHaveLength(4);
        expect(within(table).queryByText('Planned')).not.toBeInTheDocument();
    });

    it('puts followed tickets from removed projects directly on the main board', async () => {
        setup('removed');
        await screen.findByRole('button', {
            name: 'Open ticket Apply one date filter across every dashboard tab',
        });
        expect(
            screen.queryByRole('button', {
                name: 'Open More flexible dashboard filters',
            }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole('region', { name: 'Done roadmap items' }),
        ).toHaveTextContent('Filter dashboards by several values at once');
        expect(screen.queryByText('Other requests')).not.toBeInTheDocument();
    });

    it('loads every page of followed project tickets without mixing in loose or unfollowed tickets', async () => {
        setup('pagination');
        await screen.findByRole('button', { name: 'Load more projects' });
        fireEvent.click(
            screen.getByRole('button', { name: 'Load more projects' }),
        );
        await screen.findByRole('button', { name: 'Open Example project 18' });
        fireEvent.click(
            screen.getByRole('button', { name: 'Load more projects' }),
        );
        const project = await screen.findByRole('button', {
            name: 'Open More flexible dashboard filters',
        });
        fireEvent.click(project);
        fireEvent.click(
            await screen.findByRole('button', { name: 'Load more tickets' }),
        );
        await screen.findByRole('button', {
            name: 'Open ticket Followed filter improvement 12',
        });
        expect(
            screen.getAllByRole('button', { name: /^Open ticket/ }),
        ).toHaveLength(16);
        expect(
            screen.queryByText('Set workspace-wide filter defaults'),
        ).not.toBeInTheDocument();
    });

    it('removes expired project titles and tickets when refresh fails', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        setup('expiry');
        fireEvent.click(
            await screen.findByRole('button', {
                name: 'Open More flexible dashboard filters',
            }),
        );
        await screen.findByRole('button', {
            name: 'Open ticket Apply one date filter across every dashboard tab',
        });
        await act(async () => {
            vi.advanceTimersByTime(12_100);
        });
        await waitFor(() =>
            expect(
                screen.getByText('Could not load the roadmap'),
            ).toBeInTheDocument(),
        );
        expect(
            screen.queryByText('More flexible dashboard filters'),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByText(
                'Apply one date filter across every dashboard tab',
            ),
        ).not.toBeInTheDocument();
    });
});
