import { type AiAgentMessageUser } from '@lightdash/common';
import { useEffect, useRef } from 'react';
import { splitStudioChatCode } from '../../../../../features/semanticStudio/studioChatRefs';
import {
    useStudioWorkspaceAction,
    useStudioWorkspaces,
} from '../../../../../features/semanticStudio/useStudioWorkspaces';
import {
    useStoredStudioThread,
    useStudioThread,
} from './useSemanticStudioChat';

const NAME_LENGTH = 60;

/** A workspace is first named after what was asked in it, skipping any picked lines. */
export const nameFromRequest = (request: string | undefined): string => {
    const line =
        splitStudioChatCode(request ?? '')
            .text.replace(/```[\s\S]*?```/g, '')
            .split('\n')
            .map((text) => text.trim())
            .find((text) => text && !/, lines \d+ to \d+:$/.test(text)) ?? '';
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
    syncThread: boolean,
) => {
    const [stored, setStored] = useStoredStudioThread(projectUuid);
    const { data: workspaces } = useStudioWorkspaces(projectUuid);
    const action = useStudioWorkspaceAction(projectUuid);
    const active = workspaces?.mine.find(({ isActive }) => isActive) ?? null;

    const followed = useRef<string | null>(null);
    useEffect(() => {
        if (
            !syncThread ||
            !active?.threadUuid ||
            !active.agentUuid ||
            followed.current === active.workspaceUuid
        ) {
            return;
        }
        followed.current = active.workspaceUuid;
        if (stored?.threadUuid !== active.threadUuid) {
            setStored({
                threadUuid: active.threadUuid,
                agentUuid: active.agentUuid,
            });
        }
    }, [syncThread, active, stored, setStored]);

    const { data: thread } = useStudioThread(
        projectUuid,
        stored?.agentUuid,
        stored?.threadUuid,
    );
    const firstRequest = thread?.messages.find(
        (message): message is AiAgentMessageUser => message.role === 'user',
    );
    const started = useRef<string | null>(null);
    const { mutate, isLoading } = action;
    useEffect(() => {
        if (!syncThread || !stored || !hasChanges || !workspaces || isLoading)
            return;
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
    }, [
        syncThread,
        stored,
        hasChanges,
        workspaces,
        isLoading,
        mutate,
        firstRequest,
    ]);

    // The generated title says what the change is better than the first message, unless someone renamed it.
    const title = thread?.title?.trim() ?? '';
    const retitled = useRef<string | null>(null);
    useEffect(() => {
        if (!syncThread || !stored || !title || !workspaces || isLoading)
            return;
        const own = workspaces.mine.find(
            ({ threadUuid }) => threadUuid === stored.threadUuid,
        );
        if (!own || own.name === title) return;
        // A workspace the server started before the chat had a title is named for no request.
        if (
            own.name !== nameFromRequest(firstRequest?.message) &&
            own.name !== nameFromRequest(undefined)
        ) {
            return;
        }
        if (retitled.current === `${own.workspaceUuid}:${title}`) return;
        retitled.current = `${own.workspaceUuid}:${title}`;
        mutate({
            kind: 'rename',
            workspaceUuid: own.workspaceUuid,
            name: title,
        });
    }, [
        syncThread,
        stored,
        title,
        workspaces,
        isLoading,
        mutate,
        firstRequest,
    ]);

    return active;
};
