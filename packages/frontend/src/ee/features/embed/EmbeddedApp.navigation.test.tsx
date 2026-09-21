import { ChartType, type CreateEmbedJwt } from '@lightdash/common';
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import {
    clearInMemoryStorage,
    setToInMemoryStorage,
} from '../../../utils/inMemoryStorage';
import { EMBED_KEY } from '../../providers/Embed/types';
import useEmbed from '../../providers/Embed/useEmbed';
import EmbeddedApp from './EmbeddedApp';

vi.mock('../../../hooks/user/useAccount', () => ({
    useAccount: () => ({ isLoading: false }),
}));
vi.mock('../../../providers/Ability/useAbilityContext', () => ({
    useAbilityContext: () => ({}),
}));
vi.mock('@tanstack/react-query', () => ({
    useQueryClient: () => ({}),
}));
vi.mock('./hooks/useEmbedEventEmitter', () => ({
    useEmbedEventEmitter: () => ({ dispatchEmbedEvent: vi.fn() }),
}));

const base = '/embed/project';
const conversation = `${base}/ai-agents/agent/threads/thread`;

const BackButton = () => {
    const { onBackToDashboard, onExplore } = useEmbed();
    return (
        <>
            <button onClick={onBackToDashboard}>Back</button>
            <button
                onClick={() =>
                    onExplore?.({
                        chart: {
                            tableName: 'orders',
                            metricQuery: {
                                exploreName: 'orders',
                                dimensions: [],
                                metrics: [],
                                filters: {},
                                sorts: [],
                                limit: 10,
                                tableCalculations: [],
                            },
                            chartConfig: { type: ChartType.TABLE },
                            tableConfig: { columnOrder: [] },
                        },
                    })
                }
            >
                Explore
            </button>
        </>
    );
};

const renderEmbed = (
    content: CreateEmbedJwt['content'],
    search = '',
    state?: { embedBackUrl: string },
) => {
    setToInMemoryStorage(EMBED_KEY, {
        projectUuid: 'project',
        token: `header.${btoa(JSON.stringify({ content }))}.signature`,
    });
    const router = createMemoryRouter(
        [
            {
                path: '/embed/:projectUuid',
                element: <EmbeddedApp />,
                children: [{ path: '*', element: <BackButton /> }],
            },
        ],
        {
            initialEntries: [
                { pathname: `${base}/explore/orders`, search, state },
            ],
        },
    );
    render(<RouterProvider router={router} />);
    return router;
};

describe('embedded Explore back navigation', () => {
    afterEach(() => clearInMemoryStorage());

    it('returns to the conversation when router state is lost', async () => {
        const router = renderEmbed(
            { type: 'aiAgent', agentUuid: 'agent' },
            `?${new URLSearchParams({ embedBackUrl: conversation })}`,
        );
        fireEvent.click(screen.getByText('Back'));
        await waitFor(() =>
            expect(router.state.location.pathname).toBe(conversation),
        );
    });

    it.each([
        [
            { type: 'aiAgent', agentUuid: 'agent' },
            `${base}/ai-agents/agent/threads`,
        ],
        [{ type: 'metricsCatalog' }, `${base}/metrics`],
        [{ type: 'dashboard', dashboardUuid: 'dashboard' }, base],
        [{ type: 'chart', contentId: 'chart' }, `${base}/chart/chart`],
        [{ type: 'dataApp', appUuid: 'app' }, `${base}/app/app`],
    ] satisfies [CreateEmbedJwt['content'], string][])(
        'falls back to the authorized route for %j',
        async (content, expected) => {
            const router = renderEmbed(content);
            fireEvent.click(screen.getByText('Back'));
            await waitFor(() =>
                expect(router.state.location.pathname).toBe(expected),
            );
        },
    );

    it('keeps the original return state for existing Explore links', async () => {
        const router = renderEmbed(
            { type: 'aiAgent', agentUuid: 'agent' },
            '',
            {
                embedBackUrl: `${conversation}?theme=dark`,
            },
        );
        fireEvent.click(screen.getByText('Back'));
        await waitFor(() =>
            expect(router.state.location.pathname).toBe(conversation),
        );
        expect(router.state.location.search).toBe('?theme=dark');
    });

    it.each([
        [{ type: 'dashboard', dashboardUuid: 'dashboard' }, `${base}/tabs/tab`],
        [{ type: 'metricsCatalog' }, `${base}/metrics`],
    ] satisfies [CreateEmbedJwt['content'], string][])(
        'preserves the source URL through Explore URL replacements for %j',
        async (content, source) => {
            const router = renderEmbed(content);
            await act(() => router.navigate(`${source}?theme=dark`));
            fireEvent.click(screen.getByText('Explore'));
            await waitFor(() =>
                expect(router.state.location.pathname).toBe(
                    `${base}/explore/orders`,
                ),
            );
            const params = new URLSearchParams(router.state.location.search);
            params.set('openVizConfig', 'true');
            await act(() =>
                router.navigate(
                    { search: params.toString() },
                    { replace: true },
                ),
            );
            expect(router.state.location.state).toBeNull();
            fireEvent.click(screen.getByText('Back'));
            await waitFor(() =>
                expect(router.state.location.pathname).toBe(source),
            );
            expect(router.state.location.search).toBe('?theme=dark');
        },
    );

    it.each([
        'https://example.com',
        '//example.com/embed/project/ai-agents/agent/threads/thread',
        '/embed/other-project/ai-agents/agent/threads/thread',
        `${base}/ai-agents/another-agent/threads/thread`,
        base,
        `${base}/metrics`,
        `${conversation}/../../../../`,
        `${conversation}#unexpected-token`,
    ])('ignores an invalid or unrelated return URL: %s', async (backUrl) => {
        const router = renderEmbed(
            { type: 'aiAgent', agentUuid: 'agent' },
            `?${new URLSearchParams({ embedBackUrl: backUrl })}`,
        );
        fireEvent.click(screen.getByText('Back'));
        await waitFor(() =>
            expect(router.state.location.pathname).toBe(
                `${base}/ai-agents/agent/threads`,
            ),
        );
    });
});
