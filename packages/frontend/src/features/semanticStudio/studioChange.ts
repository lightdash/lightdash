import { type CiChecks } from '@lightdash/common';
import { useLocalStorage } from '@mantine/hooks';
import { useCallback } from 'react';

export type StoredThread = { threadUuid: string; agentUuid: string };

/** Starts a Studio conversation with an agent, told what started it. */
export type StartStudioThread = (
    agentUuid: string,
    threadContext: string,
) => Promise<StoredThread>;

/** The chat this browser has open; it follows the active workspace, see useSyncStudioWorkspace. */
export const useStoredStudioThread = (projectUuid: string) =>
    useLocalStorage<StoredThread | null>({
        key: `semantic-studio-agent-thread-${projectUuid}`,
        defaultValue: null,
        getInitialValueInEffect: false,
    });

/** Whether the chat is open on the change you are on; closing it is remembered per change. */
export const useChatOpen = (projectUuid: string) => {
    const [stored] = useStoredStudioThread(projectUuid);
    const [closed, setClosed] = useLocalStorage<string[]>({
        key: 'semantic-studio-chat-closed',
        defaultValue: [],
        getInitialValueInEffect: false,
    });
    const newChat = `new-${projectUuid}`;
    const change = stored?.threadUuid ?? newChat;
    const setIsOpen = useCallback(
        (isOpen: boolean) =>
            setClosed((current) => {
                // Opening also reopens a blank new change, which starting one asks for before it has a thread.
                const others = current.filter(
                    (key) => key !== change && !(isOpen && key === newChat),
                );
                return isOpen ? others : [...others, change].slice(-50);
            }),
        [change, newChat, setClosed],
    );
    return [!closed.includes(change), setIsOpen] as const;
};

/** A dbt change of this project's Studio conversation that is still running in the background. */
export type StudioPendingChange = {
    aiWritebackRunUuid: string;
    startedAt: string;
};

/** The pull request of a Studio change on a dbt project. */
export type StudioPullRequest = {
    prUrl: string;
    /** The commit the agent last pushed, when the change's latest save was its. */
    commitSha: string | null;
    /** Changes when the agent pushes; a hand save refreshes what it moved itself. */
    revision: string;
    additions: number | null;
    deletions: number | null;
    /** Models any turn of this pull request changed. */
    changedModels: string[];
    /** The project built from the pull request's branch, where its models can be looked at. */
    previewProjectUuid: string | null;
    ciChecks: CiChecks | null;
    /** Open, so the next change joins it. */
    state: 'open' | 'merged' | 'closed';
    isMine: boolean;
};
