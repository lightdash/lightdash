import {
    isToolEditDbtProjectResult,
    type ApiError,
    type CiChecks,
    type SemanticStudioWorkspace,
} from '@lightdash/common';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { useStudioWorkspaces } from '../../../../../features/semanticStudio/useStudioWorkspaces';
import { findPreviewProjectUuid } from '../../../../../features/semanticStudio/useTryInExplore';
import { useLightdashApi } from '../../../../../providers/LightdashApi/useLightdashApi';
import { pullRequestCiChecksQuery } from '../../hooks/usePullRequestCiChecks';
import { useWholePullRequestDiff } from '../../hooks/usePullRequestDiff';
import {
    getModelsOfFiles,
    splitPatchIntoFiles,
} from '../ChatElements/ToolCalls/splitPatch';
import { getOpenProposal, isInPullRequest } from './studioProposal';
import { useStudioAgent, useStudioThread } from './useSemanticStudioChat';

/** The last revision each pull request was seen at, so its checks are read again once when it moves. */
const seenRevisions = new Map<string, string>();

/** The pull request of a Studio change on a dbt project. */
export type StudioPullRequest = {
    prUrl: string;
    /** The commit the agent last pushed, when the change's latest save was its. */
    commitSha: string | null;
    /** Changes whenever the pull request may have moved, by the agent or by hand. */
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

/** A change's pull request from its own record, then its conversation; without `shown`, the change your chat is on. */
export const useStudioPullRequest = (
    projectUuid: string,
    shown?: SemanticStudioWorkspace | null,
): StudioPullRequest | null => {
    const { thread } = useStudioAgent(projectUuid);
    const { data } = useStudioThread(
        projectUuid,
        thread?.agent.uuid,
        thread?.threadUuid,
    );
    const { data: workspaces } = useStudioWorkspaces(projectUuid);
    const workspace =
        shown !== undefined
            ? shown
            : (workspaces?.mine.find(
                  ({ threadUuid }) => threadUuid === thread?.threadUuid,
              ) ?? null);
    const isChatOfChange =
        !workspace || workspace.threadUuid === thread?.threadUuid;
    const results = (isChatOfChange ? (data?.messages ?? []) : [])
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
    const prUrl = workspace?.pullRequest?.url ?? results.at(-1)?.prUrl ?? null;
    const ofThisPullRequest = results.filter(
        (result) => result.prUrl === prUrl,
    );
    const metadata = ofThisPullRequest.at(-1);
    const revision = `${metadata?.commitSha ?? ''}:${workspace ? String(workspace.updatedAt) : ''}`;
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    // Checks are read at the branch head, since a hand save moves it without the agent knowing.
    const { data: ciChecks } = useQuery<CiChecks | null, ApiError>(
        pullRequestCiChecksQuery(lightdashApi, projectUuid, prUrl, null),
    );
    // This hook is on the page many times; the checks are read again once per move of the pull request.
    useEffect(() => {
        if (!prUrl) return;
        const seen = seenRevisions.get(prUrl);
        seenRevisions.set(prUrl, revision);
        if (seen !== undefined && seen !== revision) {
            void queryClient.invalidateQueries({
                queryKey: ['pullRequestCiChecks', projectUuid, prUrl, null],
            });
        }
    }, [projectUuid, prUrl, revision, queryClient]);
    const agentModels = [
        ...new Set(
            ofThisPullRequest.flatMap(
                ({ changedModels }) => changedModels ?? [],
            ),
        ),
    ].sort();
    // A hand save tells no agent which models it changed, so the pull request's files add theirs.
    const { data: diff } = useWholePullRequestDiff(
        projectUuid,
        prUrl ?? '',
        revision,
    );
    const diffModels = useMemo(
        () =>
            diff?.diff ? getModelsOfFiles(splitPatchIntoFiles(diff.diff)) : [],
        [diff],
    );
    if (!prUrl) return null;
    const known = workspace?.pullRequest?.state ?? null;
    const state: StudioPullRequest['state'] = ciChecks
        ? ciChecks.merged
            ? 'merged'
            : ciChecks.state
        : (known ?? 'open');
    return {
        prUrl,
        commitSha: metadata?.commitSha ?? null,
        revision,
        additions: metadata?.additions ?? null,
        deletions: metadata?.deletions ?? null,
        changedModels: [...new Set([...agentModels, ...diffModels])].sort(),
        previewProjectUuid: findPreviewProjectUuid(metadata?.previewUrl),
        ciChecks: ciChecks ?? null,
        state,
        isOpen: state === 'open',
        isMine: workspace?.isMine ?? true,
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
    const { data } = useStudioThread(
        projectUuid,
        thread?.agent.uuid,
        thread?.threadUuid,
    );
    // The latest change of the whole thread, so a message sent while it runs does not hide it.
    const latest = (data?.messages ?? [])
        .flatMap((message) =>
            message.role === 'assistant'
                ? message.toolResults.filter(isToolEditDbtProjectResult)
                : [],
        )
        .at(-1);
    return latest?.metadata.status === 'pending'
        ? {
              aiWritebackRunUuid: latest.metadata.aiWritebackRunUuid,
              startedAt: new Date(latest.createdAt).toISOString(),
          }
        : null;
};

const NO_PROPOSAL: string[] = [];

/** The diffs the conversation's latest reply proposes and has not saved, one per file. */
export const useStudioProposal = (projectUuid: string): string[] => {
    const { thread } = useStudioAgent(projectUuid);
    const { data } = useStudioThread(
        projectUuid,
        thread?.agent.uuid,
        thread?.threadUuid,
    );
    // A proposal saved by hand is in the pull request without the agent knowing.
    const pullRequest = useStudioPullRequest(projectUuid);
    const { data: diff } = useWholePullRequestDiff(
        projectUuid,
        pullRequest?.prUrl ?? '',
        pullRequest?.revision ?? null,
    );
    return useMemo(() => {
        const proposal = (
            data ? getOpenProposal(data.messages) : NO_PROPOSAL
        ).filter((code) => !isInPullRequest(code, diff?.diff ?? ''));
        return proposal.length > 0 ? proposal : NO_PROPOSAL;
    }, [data, diff]);
};
