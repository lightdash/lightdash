import { fireEvent, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { PinnedContextCard } from './PinnedContextCard';

vi.mock('../../hooks/aiAgentRouting', async (original) => ({
    ...(await original<object>()),
    isEmbedAiAgentRoute: () => true,
}));
vi.mock('../ThreadChartEditor/useAiThreadChartEdit', () => ({
    useAiThreadChartEdit: () => null,
}));

const THREAD_PATH = '/embed/project-1/ai-agents/agent-1/threads/thread-1';

const renderCard = (item: Parameters<typeof PinnedContextCard>[0]['item']) => {
    const router = createMemoryRouter(
        [
            {
                path: '/embed/:projectUuid/ai-agents/:agentUuid/threads/:threadUuid',
                element: (
                    <PinnedContextCard
                        item={item}
                        projectUuid="project-1"
                        previewScope={null}
                    />
                ),
            },
            {
                path: '/embed/:projectUuid/ai-agents/:agentUuid/dashboards/:agentDashboardUuid',
                element: <div>Embedded dashboard</div>,
            },
        ],
        { initialEntries: [THREAD_PATH] },
    );
    renderWithProviders(<RouterProvider router={router} />);
    return router;
};

describe('pinned context inside an embedded AI agent', () => {
    it('opens a pinned dashboard on the embed route', async () => {
        const router = renderCard({
            type: 'dashboard',
            dashboardUuid: 'dashboard-1',
            dashboardSlug: null,
            pinnedVersionUuid: null,
            displayName: 'Sales',
            runtimeOverrides: null,
        });

        expect(screen.queryByRole('link')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Sales' }));

        expect(
            await screen.findByText('Embedded dashboard'),
        ).toBeInTheDocument();
        expect(router.state.location.pathname).toBe(
            '/embed/project-1/ai-agents/agent-1/dashboards/dashboard-1',
        );
    });

    it('keeps a pinned chart as a static reference', () => {
        renderCard({
            type: 'chart',
            chartUuid: 'chart-1',
            chartSlug: null,
            pinnedVersionUuid: null,
            displayName: 'Orders',
            runtimeOverrides: null,
            chartKind: null,
        });

        expect(screen.getByText('Orders')).toBeInTheDocument();
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
});
