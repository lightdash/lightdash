import { MantineProvider } from '@mantine/core';
import type * as MantineHooks from '@mantine/hooks';
import { act, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AiAgentPageLayout } from './AiAgentPageLayout';

vi.mock('@mantine/hooks', async () => {
    const actual = await vi.importActual<typeof MantineHooks>('@mantine/hooks');
    return { ...actual, useMediaQuery: () => false };
});

const artifactQuery = vi.hoisted(() => ({ data: undefined as unknown }));
vi.mock('@tanstack/react-query', () => ({
    useQuery: () => artifactQuery,
}));

vi.mock('../../hooks/useAiAgentArtifacts', () => ({
    AI_AGENT_ARTIFACT_KEY: 'aiAgentArtifact',
    aiAgentArtifactVersionQuery: () => ({
        queryKey: ['aiAgentArtifact'],
        queryFn: () => Promise.resolve(undefined),
    }),
}));

// Stable reference, as the store returns the same preview across renders
const preview = vi.hoisted(() => ({
    type: 'artifact',
    artifactUuid: 'artifact',
    versionUuid: 'version',
    messageUuid: 'message',
    threadUuid: 'thread',
    projectUuid: 'project',
    agentUuid: 'agent',
}));
vi.mock('../../store/hooks', () => ({
    useAiAgentStoreDispatch: () => vi.fn(),
    useAiAgentStoreSelector: () => preview,
}));

vi.mock('../ChatElements/AiArtifactPanel', () => ({
    AiArtifactPanel: () => <div>Artifact</div>,
}));

// Stable like the app: only the layout re-renders when the artifact resolves
const sidebar = <div>Thread list</div>;

const Page = () => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    return (
        <MantineProvider env="test">
            <MemoryRouter>
                <AiAgentPageLayout
                    Sidebar={sidebar}
                    isAgentSidebarCollapsed={isCollapsed}
                    setIsAgentSidebarCollapsed={setIsCollapsed}
                >
                    <div>Chat</div>
                </AiAgentPageLayout>
            </MemoryRouter>
        </MantineProvider>
    );
};

const sidebarSeparator = () => screen.getAllByRole('separator')[0];

describe('AiAgentPageLayout sidebar collapse with a preview open', () => {
    it('keeps the sidebar collapsed when the artifact resolves as a composer artifact', async () => {
        artifactQuery.data = undefined;
        const { rerender } = render(<Page />);

        await waitFor(() =>
            expect(sidebarSeparator()).toHaveAttribute('aria-valuenow', '0'),
        );

        artifactQuery.data = {
            chartConfig: {
                source: 'composer',
                schemaVersion: 1,
                queries: [],
                terminalNodeId: 'node',
                lastQueryUuid: 'query',
            },
        };
        await act(async () => rerender(<Page />));

        await waitFor(() =>
            expect(sidebarSeparator()).toHaveAttribute('aria-valuenow', '0'),
        );
        expect(
            screen.getByRole('button', { name: 'Expand Ask AI sidebar' }),
        ).toBeInTheDocument();
    });
});
