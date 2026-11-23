import { type CiChecks } from '@lightdash/common';
import { useLocalStorage } from '@mantine/hooks';

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
    state: 'open' | 'merged' | 'closed';
    /** Still open, so the next change joins it. */
    isOpen: boolean;
    isMine: boolean;
};
