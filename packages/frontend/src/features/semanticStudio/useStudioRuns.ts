import { type SemanticStudioWorkspace } from '@lightdash/common';
import { useQueries } from '@tanstack/react-query';
import { type StudioPendingChange } from '../../ee/features/aiCopilot/components/SemanticStudioAgent/useStudioPullRequest';
import { pullRequestCiChecksQuery } from '../../ee/features/aiCopilot/hooks/usePullRequestCiChecks';
import { useWritebackProgress } from '../../ee/features/aiCopilot/hooks/useWritebackProgress';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import { isInFlight, toStudioRun, type StudioRun } from './studioRuns';

export type StudioRunRow = {
    workspace: SemanticStudioWorkspace;
    run: StudioRun;
};

/** Your workspaces still in flight, each with where it stands: a running save, its pull request's checks. */
export const useStudioRuns = (
    projectUuid: string,
    workspaces: SemanticStudioWorkspace[],
    saving: StudioPendingChange | null,
): StudioRunRow[] => {
    const lightdashApi = useLightdashApi();
    const inFlight = workspaces.filter(isInFlight);
    const ciChecks = useQueries({
        queries: inFlight.map((workspace) =>
            pullRequestCiChecksQuery(
                lightdashApi,
                projectUuid,
                workspace.pullRequest?.url,
                null,
            ),
        ),
    });
    const progress = useWritebackProgress(
        projectUuid,
        saving?.aiWritebackRunUuid ?? null,
    );
    return inFlight.map((workspace, index) => ({
        workspace,
        run: toStudioRun(workspace, {
            savingStep:
                saving && workspace.isActive && progress.state === 'running'
                    ? progress.step
                    : null,
            ciChecks: ciChecks[index]?.data ?? null,
        }),
    }));
};
