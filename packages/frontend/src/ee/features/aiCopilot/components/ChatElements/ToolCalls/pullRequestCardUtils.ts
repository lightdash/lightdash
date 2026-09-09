import {
    IconBrandGithub,
    IconBrandGitlab,
    type Icon as TablerIcon,
} from '@tabler/icons-react';

// Shared helpers/constants for the writeback PR cards (dbt + general coding
// agent). Kept in a non-component module so both card files can import them
// without tripping react-refresh's only-export-components rule.

/**
 * Summarizes supported pull request URLs as workspace/repository; other hosts
 * fall back to the hostname.
 */
export const summarisePrUrl = (prUrl: string): string | null => {
    try {
        const url = new URL(prUrl);
        const segments = url.pathname.split('/').filter(Boolean);
        if (
            segments.length >= 4 &&
            ((url.hostname === 'github.com' && segments[2] === 'pull') ||
                (url.hostname === 'bitbucket.org' &&
                    segments[2] === 'pull-requests'))
        ) {
            const [owner, repo] = segments;
            return `${owner}/${repo}`;
        }
        return url.hostname;
    } catch {
        return null;
    }
};

/**
 * A writeback can't open a PR until the org installs the matching git app. The
 * agent's prose already explains the problem, so the card surfaces only the
 * one-click action — each `installUrl` is the same install entry point as the
 * Integrations settings page.
 */
export const INSTALL_ACTIONS: Record<
    'github_not_installed' | 'gitlab_not_installed',
    { icon: TablerIcon; installUrl: string; cta: string }
> = {
    github_not_installed: {
        icon: IconBrandGithub,
        installUrl: '/api/v1/github/install',
        cta: 'Install GitHub App',
    },
    gitlab_not_installed: {
        icon: IconBrandGitlab,
        installUrl: '/api/v1/gitlab/install',
        cta: 'Connect GitLab',
    },
};

export const isBitbucketPullRequest = (
    prUrl: string | null | undefined,
): boolean => {
    if (!prUrl) {
        return false;
    }
    try {
        return new URL(prUrl).hostname === 'bitbucket.org';
    } catch {
        return false;
    }
};
