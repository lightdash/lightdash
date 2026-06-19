import {
    IconBrandGithub,
    IconBrandGitlab,
    type Icon as TablerIcon,
} from '@tabler/icons-react';

// Shared helpers/constants for the writeback PR cards (dbt + general coding
// agent). Kept in a non-component module so both card files can import them
// without tripping react-refresh's only-export-components rule.

/**
 * Parses "https://github.com/lightdash/jaffle/pull/29" into "lightdash/jaffle"
 * so the user can verify which repo the PR landed in at a glance. Best-effort —
 * any non-GitHub host or malformed path falls back to the raw hostname.
 */
export const summarisePrUrl = (prUrl: string): string | null => {
    try {
        const url = new URL(prUrl);
        const segments = url.pathname.split('/').filter(Boolean);
        if (
            url.hostname === 'github.com' &&
            segments.length >= 4 &&
            segments[2] === 'pull'
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
