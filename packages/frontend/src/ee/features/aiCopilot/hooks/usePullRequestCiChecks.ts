import { CiCheckState, type ApiError, type CiChecks } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';

const getPullRequestCiChecks = (
    projectUuid: string,
    prUrl: string,
): Promise<CiChecks | null> =>
    lightdashApi<CiChecks | null>({
        version: 'v1',
        url: `/ee/projects/${projectUuid}/ai-writeback/ci-checks?prUrl=${encodeURIComponent(
            prUrl,
        )}`,
        method: 'GET',
        body: undefined,
    });

// While any check is still running we re-poll; once everything has concluded
// the status is stable, so we stop.
const CI_POLL_INTERVAL_MS = 15_000;

/**
 * Resolve (and poll for) the live CI status of a write-back pull request.
 * Disabled until both a project and a PR URL are known; keeps polling while the
 * rolled-up state is pending, then stops once all checks have concluded.
 */
export const usePullRequestCiChecks = (
    projectUuid: string | undefined,
    prUrl: string | null | undefined,
) =>
    useQuery<CiChecks | null, ApiError>({
        queryKey: ['pullRequestCiChecks', projectUuid, prUrl],
        queryFn: () => getPullRequestCiChecks(projectUuid!, prUrl!),
        enabled: !!projectUuid && !!prUrl,
        refetchInterval: (data) =>
            data && data.overall === CiCheckState.PENDING
                ? CI_POLL_INTERVAL_MS
                : false,
        refetchOnWindowFocus: false,
        retry: false,
    });
