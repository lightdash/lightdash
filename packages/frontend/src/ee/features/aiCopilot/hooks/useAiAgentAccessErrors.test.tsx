import {
    AiAccessRefusedError,
    AiAccessRefusalReason,
    ForbiddenError,
    type ApiError,
    type AiAccessForUser,
    type ApiAiAgentThreadResponse,
} from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAiAccessRefusal } from '../../../../features/aiAccess/errors';
import { useAiAccessGate } from '../../../../features/aiAccess/useAiAccessGate';
import { mockedLightdashApi } from '../../../../testing/mockedLightdashApi';
import { renderWithProviders } from '../../../../testing/testUtils';
import { AiAccessCallout } from '../components/ChatElements/AiAccessCallout';
import { AiAccessGate } from '../components/ChatElements/AiAccessGate';
import { useAiAgentArtifact } from './useAiAgentArtifacts';
import {
    useAiAgentArtifactVizQuery,
    useAiAgentThread,
    useProjectAiAgents,
} from './useProjectAiAgents';

vi.mock('../../../../api');
vi.mock('../../../../hooks/health/useHealth', () => ({
    default: () => ({ data: {} }),
}));
vi.mock('../../../../hooks/organization/useOrganization', () => ({
    useOrganization: () => ({ data: {} }),
}));
vi.mock('../../../../hooks/useActiveProject', () => ({
    useActiveProject: () => ({ data: 'project' }),
}));
vi.mock('../../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: true } }),
}));
vi.mock('../../../../hooks/useSnowflake', () => ({
    useSnowflakeAiLoginPopup: () => ({ mutate: vi.fn(), error: null }),
}));
const toast = vi.hoisted(() => vi.fn());
vi.mock('../../../../hooks/toaster/useToaster', () => ({
    default: () => ({ showToastApiError: toast }),
}));

const options = { retry: false, cacheTime: 0 };
const artifactRef = {
    projectUuid: 'project',
    agentUuid: 'agent',
    artifactUuid: 'artifact',
    versionUuid: 'version',
};

const ThreadView = () => {
    const thread = useAiAgentThread('project', 'agent', 'thread', options);
    const viz = useAiAgentArtifactVizQuery(artifactRef, options);
    const gate = useAiAccessGate('project');
    const refusal = getAiAccessRefusal(viz.error?.error);
    return (
        <>
            {thread.data?.messages.map((message) => (
                <p key={message.uuid}>{message.message}</p>
            ))}
            <AiAccessGate projectUuid="project" variant="inline" {...gate}>
                Composer
            </AiAccessGate>
            {refusal && (
                <AiAccessCallout
                    projectUuid="project"
                    refusal={refusal}
                    variant="inline"
                />
            )}
        </>
    );
};

const ArtifactView = () => {
    const query = useAiAgentArtifact({ ...artifactRef, options });
    return <p>{query.isError ? 'Artifact refused in place' : 'Loading'}</p>;
};

const AgentsView = () => {
    const query = useProjectAiAgents({
        projectUuid: 'project',
        redirectOnUnauthorized: true,
        options,
    });
    return <p>{query.isError ? 'Agents refused in place' : 'Loading'}</p>;
};

const renderPage = (page: ReactNode) => {
    const client = new QueryClient({ defaultOptions: { queries: options } });
    return renderWithProviders(
        <QueryClientProvider client={client}>
            <MemoryRouter initialEntries={['/thread']}>
                <Routes>
                    <Route path="/thread" element={page} />
                    <Route
                        path="/projects/project/ai-agents/not-authorized"
                        element={
                            <p>
                                You're not authorized to interact with this AI
                                agent
                            </p>
                        }
                    />
                </Routes>
            </MemoryRouter>
        </QueryClientProvider>,
    );
};

const refusal = new AiAccessRefusedError(AiAccessRefusalReason.NEEDS_SIGN_IN);
const apiError = (error: ApiError['error']): ApiError => ({
    status: 'error',
    error,
});

beforeEach(() => {
    vi.clearAllMocks();
    mockedLightdashApi.mockImplementation(async ({ url }) => {
        if (url.endsWith('/threads/thread'))
            return {
                messages: [
                    {
                        uuid: 'message',
                        role: 'user',
                        message: 'Previous question',
                    },
                ],
            } as ApiAiAgentThreadResponse['results'];
        if (url.endsWith('/ai-access/me'))
            return { refusal: refusal.refusal } as AiAccessForUser;
        throw apiError(refusal);
    });
});

describe('agent page identity refusal navigation', () => {
    it('loads the thread while disconnected and keeps both connection prompts in place', async () => {
        renderPage(<ThreadView />);
        expect(await screen.findByText('Previous question')).toBeVisible();
        await waitFor(() =>
            expect(
                screen.getAllByRole('button', { name: 'Connect agent' }),
            ).toHaveLength(2),
        );
        expect(
            screen.queryByText(/not authorized to interact/),
        ).not.toBeInTheDocument();
        expect(screen.queryByText('Composer')).not.toBeInTheDocument();
        expect(toast).not.toHaveBeenCalled();
    });

    it.each([
        {
            name: 'artifact',
            page: <ArtifactView />,
            message: 'Artifact refused in place',
        },
        {
            name: 'agent list',
            page: <AgentsView />,
            message: 'Agents refused in place',
        },
    ])('keeps a typed $name refusal on the page', async ({ page, message }) => {
        renderPage(page);
        expect(await screen.findByText(message)).toBeVisible();
        expect(
            screen.queryByText(/not authorized to interact/),
        ).not.toBeInTheDocument();
        expect(toast).not.toHaveBeenCalled();
    });

    it('still routes an ordinary permission failure to the not-authorized page', async () => {
        mockedLightdashApi.mockRejectedValue(apiError(new ForbiddenError()));
        renderPage(<ArtifactView />);
        expect(
            await screen.findByText(/not authorized to interact/),
        ).toBeVisible();
    });
});
