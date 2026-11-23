import {
    getDbtSaves,
    type ApiError,
    type CiChecks,
    type SemanticStudioWorkspace,
} from '@lightdash/common';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';
import {
    type StudioPendingChange,
    type StudioPullRequest,
} from '../../../../../features/semanticStudio/studioChange';
import { useStudioWorkspaces } from '../../../../../features/semanticStudio/useStudioWorkspaces';
import { findPreviewProjectUuid } from '../../../../../features/semanticStudio/useTryInExplore';
import {
    getModelsOfFiles,
    splitPatchIntoFiles,
} from '../../../../../features/writeback/splitPatch';
import {
    pullRequestCiChecksKey,
    pullRequestCiChecksQuery,
} from '../../../../../features/writeback/usePullRequestCiChecks';
import { useWholePullRequestDiff } from '../../../../../features/writeback/usePullRequestDiff';
import { useLightdashApi } from '../../../../../providers/LightdashApi/useLightdashApi';
import {
    getOpenProposal,
    getSavingChange,
    isInPullRequest,
    type SavingChange,
} from './studioProposal';
import { resolveStudioPullRequestState } from './studioPullRequestState';
import { useStudioAgent, useStudioThread } from './useSemanticStudioChat';

/** The chat open in this browser and its messages. */
const useOpenStudioThread = (projectUuid: string) => {
    const { thread } = useStudioAgent(projectUuid);
    const { data } = useStudioThread(
        projectUuid,
        thread?.agent.uuid,
        thread?.threadUuid,
    );
    return { thread, data };
};

/** The last revision each pull request was seen at, so its checks are read again once when it moves. */
const seenRevisions = new Map<string, string>();

/** A change's pull request from its own record, then its conversation; with `shown` null, the change your chat is on. */
export const useStudioPullRequest = (
    projectUuid: string,
    shown: SemanticStudioWorkspace | null,
): StudioPullRequest | null => {
    const { thread, data } = useOpenStudioThread(projectUuid);
    const { data: workspaces } = useStudioWorkspaces(projectUuid);
    const workspace =
        shown ??
        [
            ...(workspaces?.mine ?? []),
            ...(workspaces?.recent ?? []).filter((item) => item.isMine),
        ].find(({ threadUuid }) => threadUuid === thread?.threadUuid) ??
        null;
    const isChatOfChange =
        !workspace || workspace.threadUuid === thread?.threadUuid;
    const results = getDbtSaves(
        isChatOfChange ? (data?.messages ?? []) : [],
    ).flatMap((result) =>
        result.metadata.status === 'success' && result.metadata.prUrl
            ? [{ ...result.metadata, prUrl: result.metadata.prUrl }]
            : [],
    );
    const prUrl = workspace?.pullRequest?.url ?? results.at(-1)?.prUrl ?? null;
    const ofThisPullRequest = results.filter(
        (result) => result.prUrl === prUrl,
    );
    const metadata = ofThisPullRequest.at(-1);
    const revision = metadata?.commitSha ?? '';
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
                queryKey: pullRequestCiChecksKey(projectUuid, prUrl, null),
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
    const state = resolveStudioPullRequestState(known, ciChecks ?? null);
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
        isMine: workspace?.isMine ?? true,
    };
};

/** The change the conversation's latest reply started and has not finished, or null. */
export const useStudioPendingChange = (
    projectUuid: string,
): StudioPendingChange | null => {
    const { data } = useOpenStudioThread(projectUuid);
    // The latest change of the whole thread, so a message sent while it runs does not hide it.
    const latest = getDbtSaves(data?.messages ?? []).at(-1);
    return latest?.metadata.status === 'pending'
        ? {
              aiWritebackRunUuid: latest.metadata.aiWritebackRunUuid,
              startedAt: new Date(latest.createdAt).toISOString(),
          }
        : null;
};

const NO_PROPOSAL: string[] = [];

/** The change the conversation shows and the pull request does not carry yet, one diff per file. */
export type StudioProposal = {
    diffs: string[];
    /** A save of the agent's is writing these diffs, rather than them waiting to be saved. */
    isSaving: boolean;
};

/** The diffs the conversation's latest save is writing, else those its latest reply proposes and has not saved. */
export const useStudioProposal = (projectUuid: string): StudioProposal => {
    const { data } = useOpenStudioThread(projectUuid);
    // A proposal saved by hand is in the pull request without the agent knowing.
    const pullRequest = useStudioPullRequest(projectUuid, null);
    const {
        data: diff,
        isPreviousData,
        isError,
    } = useWholePullRequestDiff(
        projectUuid,
        pullRequest?.prUrl ?? '',
        pullRequest?.revision ?? null,
    );
    const shownSave = useRef<SavingChange | null>(null);
    const saving = data
        ? getSavingChange(
              data.messages,
              shownSave.current,
              isError || (diff !== undefined && !isPreviousData),
          )
        : null;
    shownSave.current = saving;
    const savingDiffs = saving?.diffs ?? null;
    return useMemo(() => {
        const diffs = (
            savingDiffs ?? (data ? getOpenProposal(data.messages) : NO_PROPOSAL)
        ).filter((code) => !isInPullRequest(code, diff?.diff ?? ''));
        return diffs.length > 0
            ? { diffs, isSaving: savingDiffs !== null }
            : { diffs: NO_PROPOSAL, isSaving: false };
    }, [data, diff, savingDiffs]);
};
