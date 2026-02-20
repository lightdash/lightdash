import { type AgentCodingSession } from '@lightdash/common';
import { useCallback, useState, type FC, type ReactNode } from 'react';
import { useActiveProject } from '../../../hooks/useActiveProject';
import { useCreateAgentCodingSession } from '../../hooks/useAgentCodingSessions';
import { AgentCodingChatDrawer } from './components/AgentCodingChatDrawer';
import {
    AgentCodingContext,
    type AgentCodingContextValue,
} from './hooks/useAgentCodingContext';

interface PendingPrompt {
    prompt: string;
    branch: string;
}

interface AgentCodingProviderProps {
    children: ReactNode;
}

export const AgentCodingProvider: FC<AgentCodingProviderProps> = ({ children }) => {
    const { data: projectUuid } = useActiveProject();
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [pendingPrompt, setPendingPrompt] = useState<PendingPrompt | null>(null);
    const [createdSession, setCreatedSession] = useState<AgentCodingSession | null>(null);

    const createSessionMutation = useCreateAgentCodingSession(projectUuid ?? '');

    const openDrawer = useCallback(() => {
        setIsDrawerOpen(true);
    }, []);

    const closeDrawer = useCallback(() => {
        setIsDrawerOpen(false);
        setPendingPrompt(null);
        setCreatedSession(null);
    }, []);

    const openDrawerWithPrompt = useCallback(
        (prompt: string, branch: string = 'main') => {
            if (!projectUuid) return;

            // Store the pending prompt for the drawer to use
            setPendingPrompt({ prompt, branch });
            setIsDrawerOpen(true);

            // Create the session
            createSessionMutation.mutate(
                { prompt, githubBranch: branch },
                {
                    onSuccess: (session) => {
                        setCreatedSession(session);
                        setPendingPrompt(null);
                    },
                    onError: () => {
                        setPendingPrompt(null);
                    },
                },
            );
        },
        [projectUuid, createSessionMutation],
    );

    const contextValue: AgentCodingContextValue = {
        isDrawerOpen,
        openDrawer,
        closeDrawer,
        openDrawerWithPrompt,
    };

    return (
        <AgentCodingContext.Provider value={contextValue}>
            {children}
            {projectUuid && (
                <AgentCodingChatDrawer
                    opened={isDrawerOpen}
                    onClose={closeDrawer}
                    projectUuid={projectUuid}
                    initialSession={createdSession}
                    pendingPrompt={pendingPrompt}
                />
            )}
        </AgentCodingContext.Provider>
    );
};
