import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
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
                    <RoadmapProjects
                        cacheKey="test"
                        projectStages={{ 'dashboard-filters': 'started' }}
                    />
                </RoadmapApiContext.Provider>
            </QueryClientProvider>
        </MantineProvider>,
    );
    return { api, getRequests, client };
}

describe('Project roadmap', () => {
    afterEach(() => vi.useRealTimers());

    it('loads own requests only when a project is opened, and keeps shared projects visible', async () => {
        const { getRequests } = setup();
        const project = await screen.findByRole('button', {
            name: 'Open More flexible dashboard filters',
        });
        expect(getRequests).not.toHaveBeenCalled();
        expect(
            screen.getByRole('button', {
                name: 'Open Scheduled reports that fit your workflow',
            }),
        ).toBeInTheDocument();
        fireEvent.click(project);
        await screen.findByText(
            'Apply one date filter across every dashboard tab',
        );
        expect(getRequests).toHaveBeenCalledWith(
            expect.objectContaining({ groupId: 'dashboard-filters', page: 1 }),
        );
        expect(
            screen.queryByText('Export tables with their number formatting'),
        ).not.toBeInTheDocument();
    });

    it('keeps requests whose project disappeared under Other requests', async () => {
        setup('removed');
        const other = await screen.findByRole('button', {
            name: /Other requests/,
        });
        expect(
            screen.queryByRole('button', {
                name: 'Open More flexible dashboard filters',
            }),
        ).not.toBeInTheDocument();
        fireEvent.click(other);
        await screen.findByText(
            'Apply one date filter across every dashboard tab',
        );
        expect(
            screen.getByText('Export tables with their number formatting'),
        ).toBeInTheDocument();
    });

    it('removes cached titles and closes the project panel when expiry refresh fails', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        setup('expiry');
        fireEvent.click(
            await screen.findByRole('button', {
                name: 'Open More flexible dashboard filters',
            }),
        );
        await screen.findByText(
            'Apply one date filter across every dashboard tab',
        );
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
