import { isToolEditDbtProjectResult, type CiChecks } from '@lightdash/common';
import { useAiAgentThread } from '../../hooks/useProjectAiAgents';
import { usePullRequestCiChecks } from '../../hooks/usePullRequestCiChecks';
import { useStudioAgent } from './useSemanticStudioChat';

/** The pull request a Studio conversation on a dbt project is building up. */
export type StudioPullRequest = {
    prUrl: string;
    commitSha: string | null;
    additions: number | null;
    deletions: number | null;
    /** Models any turn of this pull request changed. */
    changedModels: string[];
    /** The project built from the pull request's branch, where its models can be looked at. */
    previewProjectUuid: string | null;
    ciChecks: CiChecks | null;
    /** Still open, so the next change joins it. */
    isOpen: boolean;
};

const PREVIEW_PROJECT = /\/projects\/([0-9a-f-]{36})/;

/** The latest pull request of this project's Studio conversation, or null when it has opened none. */
export const useStudioPullRequest = (
    projectUuid: string,
): StudioPullRequest | null => {
    const { thread } = useStudioAgent(projectUuid);
    const { data } = useAiAgentThread(
        projectUuid,
        thread?.agent.uuid,
        thread?.threadUuid,
        { enabled: !!thread },
    );
    const results = (data?.messages ?? [])
        .flatMap((message) =>
            message.role === 'assistant'
                ? message.toolResults.filter(isToolEditDbtProjectResult)
                : [],
        )
        .flatMap((result) =>
            result.metadata.status === 'success' && result.metadata.prUrl
                ? [{ ...result.metadata, prUrl: result.metadata.prUrl }]
                : [],
        );
    const metadata = results.at(-1);
    const { data: ciChecks } = usePullRequestCiChecks(
        projectUuid,
        metadata?.prUrl ?? null,
        metadata?.commitSha ?? null,
    );
    if (!metadata) return null;
    return {
        prUrl: metadata.prUrl,
        commitSha: metadata.commitSha ?? null,
        additions: metadata.additions ?? null,
        deletions: metadata.deletions ?? null,
        changedModels: [
            ...new Set(
                results
                    .filter(({ prUrl }) => prUrl === metadata.prUrl)
                    .flatMap(({ changedModels }) => changedModels ?? []),
            ),
        ].sort(),
        previewProjectUuid:
            PREVIEW_PROJECT.exec(metadata.previewUrl ?? '')?.[1] ?? null,
        ciChecks: ciChecks ?? null,
        isOpen: !!ciChecks && !ciChecks.merged && ciChecks.state === 'open',
    };
};

/** A dbt change of this project's Studio conversation that is still running in the background. */
export type StudioPendingChange = {
    aiWritebackRunUuid: string;
    startedAt: string;
};

/** The change the conversation's latest reply started and has not finished, or null. */
export const useStudioPendingChange = (
    projectUuid: string,
): StudioPendingChange | null => {
    const { thread } = useStudioAgent(projectUuid);
    const { data } = useAiAgentThread(
        projectUuid,
        thread?.agent.uuid,
        thread?.threadUuid,
        { enabled: !!thread },
    );
    const last = data?.messages.findLast(({ role }) => role === 'assistant');
    if (last?.role !== 'assistant') return null;
    const pending = last.toolResults
        .filter(isToolEditDbtProjectResult)
        .findLast(({ metadata }) => metadata.status === 'pending');
    return pending?.metadata.status === 'pending'
        ? {
              aiWritebackRunUuid: pending.metadata.aiWritebackRunUuid,
              startedAt: last.createdAt,
          }
        : null;
};
