import {
    isOpenWorkspace,
    type SemanticStudioWorkspace,
} from '@lightdash/common';
import { useQueries } from '@tanstack/react-query';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import { pullRequestCiChecksQuery } from '../writeback/usePullRequestCiChecks';
import { useWritebackProgress } from '../writeback/useWritebackProgress';
import { type StudioPendingChange } from './studioChange';
import { toStudioRun, type StudioRun } from './studioRuns';

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
    const inFlight = workspaces.filter(isOpenWorkspace);
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
