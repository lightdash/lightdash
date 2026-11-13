import { type AiAgentMessageUser } from '@lightdash/common';
import { useEffect, useRef } from 'react';
import {
    useStudioWorkspaceAction,
    useStudioWorkspaces,
} from '../../../../../features/semanticStudio/useStudioWorkspaces';
import { useAiAgentThread } from '../../hooks/useProjectAiAgents';
import { useStoredStudioThread } from './useSemanticStudioChat';

const NAME_LENGTH = 60;

/** A workspace is named after what was first asked in it. */
const nameFromRequest = (request: string | undefined): string => {
    const line = (request ?? '').trim().split('\n')[0].trim();
    if (!line) return 'Untitled change';
    const named = line.charAt(0).toUpperCase() + line.slice(1);
    return named.length > NAME_LENGTH
        ? `${named.slice(0, NAME_LENGTH - 1).trimEnd()}…`
        : named;
};

/**
 * Keeps the open chat and the server's active workspace in step: another
 * browser's switch opens the same chat here, and a chat that starts changing
 * something gets its workspace without anyone naming it.
 */
export const useSyncStudioWorkspace = (
    projectUuid: string,
    hasChanges: boolean,
) => {
    const [stored, setStored] = useStoredStudioThread(projectUuid);
    const { data: workspaces } = useStudioWorkspaces(projectUuid);
    const action = useStudioWorkspaceAction(projectUuid);
    const active = workspaces?.mine.find(({ isActive }) => isActive) ?? null;

    const followed = useRef<string | null>(null);
    useEffect(() => {
        if (!active?.agentUuid || followed.current === active.workspaceUuid) {
            return;
        }
        followed.current = active.workspaceUuid;
        if (stored?.threadUuid !== active.threadUuid) {
            setStored({
                threadUuid: active.threadUuid,
                agentUuid: active.agentUuid,
            });
        }
    }, [active, stored, setStored]);

    const { data: thread } = useAiAgentThread(
        projectUuid,
        stored?.agentUuid,
        stored?.threadUuid,
        { enabled: !!stored },
    );
    const firstRequest = thread?.messages.find(
        (message): message is AiAgentMessageUser => message.role === 'user',
    );
    const started = useRef<string | null>(null);
    const { mutate, isLoading } = action;
    useEffect(() => {
        if (!stored || !hasChanges || !workspaces || isLoading) return;
        const own = workspaces.mine.find(
            ({ threadUuid }) => threadUuid === stored.threadUuid,
        );
        if (own?.isActive || started.current === stored.threadUuid) return;
        started.current = stored.threadUuid;
        mutate({
            kind: 'start',
            body: {
                threadUuid: stored.threadUuid,
                name: own?.name ?? nameFromRequest(firstRequest?.message),
            },
        });
    }, [stored, hasChanges, workspaces, isLoading, mutate, firstRequest]);

    return active;
};
