import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
    matchRoutes,
    MemoryRouter,
    Route,
    Routes,
    useNavigate,
} from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { CommercialWebAppRoutes } from '../../CommercialRoutes';
import { deepResearchRunFixture } from '../../features/aiCopilot/deepResearch/fixtures';
import DeepResearchReportPage from './DeepResearchReportPage';

const { useDeepResearchReport } = vi.hoisted(() => ({
    useDeepResearchReport: vi.fn(),
}));

vi.mock('../../features/aiCopilot/hooks/useDeepResearch', () => ({
    useDeepResearchReport,
}));

vi.mock(
    '../../features/aiCopilot/components/DeepResearch/DeepResearchReport',
    () => ({
        DeepResearchReport: ({
            run,
            onClose,
        }: {
            run: typeof deepResearchRunFixture;
            onClose: () => void;
        }) => (
            <>
                <div>Report {run.uuid}</div>
                <button type="button" onClick={onClose}>
                    Back to chat
                </button>
            </>
        ),
    }),
);

const reportPath = `/projects/${deepResearchRunFixture.projectUuid}/ai-agents/deep-research/${deepResearchRunFixture.uuid}`;

const AgentThread = () => {
    const navigate = useNavigate();
    return (
        <>
            <div>Agent thread</div>
            <button type="button" onClick={() => navigate(-1)}>
                Browser back
            </button>
        </>
    );
};

const renderPage = () =>
    renderWithProviders(
        <MemoryRouter initialEntries={['/origin', reportPath]} initialIndex={1}>
            <Routes>
                <Route path="/origin" element={<div>Origin page</div>} />
                <Route
                    path="/projects/:projectUuid/ai-agents/deep-research/:runUuid"
                    element={<DeepResearchReportPage />}
                />
                <Route
                    path="/projects/:projectUuid/ai-agents/:agentUuid/threads/:threadUuid"
                    element={<AgentThread />}
                />
            </Routes>
        </MemoryRouter>,
    );

describe('DeepResearchReportPage', () => {
    beforeEach(() => {
        useDeepResearchReport.mockReset();
        useDeepResearchReport.mockReturnValue({
            data: deepResearchRunFixture,
            error: null,
            isError: false,
            isLoading: false,
        });
    });

    it('is registered at the persistent commercial route', () => {
        expect(
            matchRoutes(CommercialWebAppRoutes, reportPath)?.at(-1)?.route.path,
        ).toBe('deep-research/:runUuid');
    });

    it('loads a report from its persistent URL and returns to its thread', async () => {
        const user = userEvent.setup();
        renderPage();

        expect(useDeepResearchReport).toHaveBeenCalledWith(
            deepResearchRunFixture.projectUuid,
            deepResearchRunFixture.uuid,
        );
        expect(
            screen.getByText(`Report ${deepResearchRunFixture.uuid}`),
        ).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Back to chat' }));

        expect(screen.getByText('Agent thread')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Browser back' }));

        expect(screen.getByText('Origin page')).toBeInTheDocument();
    });

    it('shows the retained expiration state', () => {
        useDeepResearchReport.mockReturnValue({
            data: {
                ...deepResearchRunFixture,
                resultMarkdown: null,
                isReportExpired: true,
            },
            error: null,
            isError: false,
            isLoading: false,
        });

        renderPage();

        expect(
            screen.getByText('This report is no longer available'),
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                'Deep Research reports are available for 30 days.',
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Back to chat' }),
        ).toBeInTheDocument();
    });

    it('shows a loading state while the report is fetched', () => {
        useDeepResearchReport.mockReturnValue({
            data: undefined,
            error: null,
            isError: false,
            isLoading: true,
        });

        renderPage();

        expect(screen.getByTestId('page-spinner')).toBeInTheDocument();
    });

    it('forwards API errors to the page error state', () => {
        useDeepResearchReport.mockReturnValue({
            data: undefined,
            error: {
                error: {
                    name: 'NotFoundError',
                    message: 'Deep Research report not found',
                },
            },
            isError: true,
            isLoading: false,
        });

        renderPage();

        expect(screen.getByText('Not found')).toBeInTheDocument();
        expect(
            screen.getByText('Deep Research report not found'),
        ).toBeInTheDocument();
    });

    it('shows an incomplete report state', () => {
        useDeepResearchReport.mockReturnValue({
            data: {
                ...deepResearchRunFixture,
                completedAt: null,
                resultMarkdown: null,
                isReportExpired: false,
            },
            error: null,
            isError: false,
            isLoading: false,
        });

        renderPage();

        expect(
            screen.getByText('This report is not ready yet'),
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                'Return to the conversation to check its progress.',
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Back to chat' }),
        ).toBeInTheDocument();
    });
});
