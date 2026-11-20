import { screen } from '@testing-library/react';
import { matchRoutes, MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { CommercialWebAppRoutes } from '../../CommercialRoutes';
import DeepResearchRunRedirectPage from './DeepResearchRunRedirectPage';

const { useDeepResearchRunQuery } = vi.hoisted(() => ({
    useDeepResearchRunQuery: vi.fn(),
}));

vi.mock('../../features/aiCopilot/hooks/useDeepResearch', () => ({
    useDeepResearchRunQuery,
}));

vi.mock('../../../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'project-1',
}));

const run = {
    aiDeepResearchRunUuid: 'run-1',
    projectUuid: 'project-1',
    agentUuid: 'agent-1',
    aiThreadUuid: 'thread-1',
    document: null,
};

const runPath = '/projects/project-1/ai-agents/deep-research/run-1';

const renderPage = () =>
    renderWithProviders(
        <MemoryRouter initialEntries={[runPath]}>
            <Routes>
                <Route
                    path="/projects/:projectUuid/ai-agents/deep-research/:runUuid"
                    element={<DeepResearchRunRedirectPage />}
                />
                <Route
                    path="/projects/:projectUuid/ai-agents/:agentUuid/threads/:threadUuid"
                    element={<div>Agent thread</div>}
                />
                <Route
                    path="/projects/:projectUuid/documents/:documentUuidOrSlug"
                    element={<div>Document page</div>}
                />
            </Routes>
        </MemoryRouter>,
    );

describe('DeepResearchRunRedirectPage', () => {
    beforeEach(() => {
        useDeepResearchRunQuery.mockReset();
        useDeepResearchRunQuery.mockReturnValue({
            data: run,
            error: null,
            isError: false,
            isInitialLoading: false,
        });
    });

    it('stays registered at the old report URL', () => {
        expect(
            matchRoutes(CommercialWebAppRoutes, runPath)?.at(-1)?.route.path,
        ).toBe('deep-research/:runUuid');
    });

    it('redirects a run with a Document to the Document', async () => {
        useDeepResearchRunQuery.mockReturnValue({
            data: {
                ...run,
                document: {
                    documentUuid: '3f1d9a52-1d1c-4b7e-9a51-0d8c2f6e7a10',
                    name: 'Enterprise retention in Q2',
                    slug: 'enterprise-retention-in-q2',
                },
            },
            error: null,
            isError: false,
            isInitialLoading: false,
        });

        renderPage();

        expect(await screen.findByText('Document page')).toBeInTheDocument();
    });

    it('redirects a run without a Document to its thread', async () => {
        renderPage();

        expect(useDeepResearchRunQuery).toHaveBeenCalledWith(
            'project-1',
            'run-1',
        );
        expect(await screen.findByText('Agent thread')).toBeInTheDocument();
    });

    it('shows a loading state while the run is fetched', () => {
        useDeepResearchRunQuery.mockReturnValue({
            data: undefined,
            error: null,
            isError: false,
            isInitialLoading: true,
        });

        renderPage();

        expect(screen.getByTestId('page-spinner')).toBeInTheDocument();
    });

    it('shows not found for a run that is gone', () => {
        useDeepResearchRunQuery.mockReturnValue({
            data: undefined,
            error: {
                error: {
                    name: 'NotFoundError',
                    message: 'Deep Research run not found',
                },
            },
            isError: true,
            isInitialLoading: false,
        });

        renderPage();

        expect(screen.getByText('Not found')).toBeInTheDocument();
        expect(
            screen.getByText('Deep Research run not found'),
        ).toBeInTheDocument();
    });
});
