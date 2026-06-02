import { ParameterError } from '@lightdash/common';
import { getPullRequest } from '../../../clients/github/Github';
import type {
    AdoptedPullRequest,
    GithubConnection,
    GithubInstallation,
} from './types';

export const parsePrUrl = (
    raw: string,
): { owner: string; repo: string; pullNumber: number } => {
    let url: URL;
    try {
        url = new URL(raw.trim());
    } catch {
        throw new ParameterError(`"${raw}" is not a valid pull request URL.`);
    }
    if (url.hostname !== 'github.com' && url.hostname !== 'www.github.com') {
        throw new ParameterError(
            `Only github.com pull request links are supported (got "${url.hostname}").`,
        );
    }
    const match = url.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
    if (!match) {
        throw new ParameterError(
            `Could not parse a pull request from "${raw}". Expected a link like https://github.com/owner/repo/pull/123.`,
        );
    }
    const [, owner, repo, pullNumberStr] = match;
    const pullNumber = Number(pullNumberStr);
    if (!Number.isInteger(pullNumber) || pullNumber <= 0) {
        throw new ParameterError(
            `Could not parse a valid pull request number from "${raw}".`,
        );
    }
    return { owner, repo, pullNumber };
};

// Parse and validate a pasted PR link before adopting it. Rejects links
// outside the project's own repo, PRs from forks, and closed/merged PRs.
export const resolveAdoptedPullRequest = async ({
    prUrl,
    githubConnection,
    github,
}: {
    prUrl: string;
    githubConnection: GithubConnection;
    github: GithubInstallation;
}): Promise<AdoptedPullRequest> => {
    const parsed = parsePrUrl(prUrl);

    const projectRepo = `${githubConnection.owner}/${githubConnection.repo}`;
    const pastedRepo = `${parsed.owner}/${parsed.repo}`;
    if (pastedRepo.toLowerCase() !== projectRepo.toLowerCase()) {
        throw new ParameterError(
            `Pull request ${pastedRepo}#${parsed.pullNumber} is in a different repository than this project's dbt repo (${projectRepo}). I can only edit pull requests in the project's own repository.`,
        );
    }

    const auth = github.prToken
        ? { token: github.prToken }
        : { installationId: github.installationId };
    const pr = await getPullRequest({
        owner: githubConnection.owner,
        repo: githubConnection.repo,
        pullNumber: parsed.pullNumber,
        ...auth,
    });

    if (pr.merged) {
        throw new ParameterError(
            `Pull request #${parsed.pullNumber} is already merged, so it can't be edited. Ask me to open a new one instead.`,
        );
    }
    if (pr.state === 'closed') {
        throw new ParameterError(
            `Pull request #${parsed.pullNumber} is closed, so it can't be edited. Reopen it or ask me to open a new one.`,
        );
    }
    if (
        !pr.headRepoFullName ||
        pr.headRepoFullName.toLowerCase() !== projectRepo.toLowerCase()
    ) {
        throw new ParameterError(
            `Pull request #${parsed.pullNumber} is from a fork (${pr.headRepoFullName ?? 'unknown repository'}); I can only edit pull requests whose branch lives in ${projectRepo}.`,
        );
    }

    return {
        prUrl: `https://github.com/${projectRepo}/pull/${parsed.pullNumber}`,
        owner: githubConnection.owner,
        repo: githubConnection.repo,
        pullNumber: parsed.pullNumber,
        headRef: pr.headRef,
    };
};
