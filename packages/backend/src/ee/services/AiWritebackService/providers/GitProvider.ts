import type {
    DbtProjectConfig,
    PullRequestProvider,
    SessionUser,
} from '@lightdash/common';
import type { Sandbox } from 'e2b';
import type {
    AdoptedPullRequest,
    CloneTarget,
    GitConnection,
    GitInstallation,
    SetStage,
} from '../types';

export type OpenPullRequestArgs = {
    sandbox: Sandbox;
    connection: GitConnection;
    installation: GitInstallation;
    title: string;
    description: string;
    /** The Lightdash user who triggered the run, credited as a commit co-author. */
    user: SessionUser;
    setStage: SetStage;
};

export type UpdatePullRequestArgs = OpenPullRequestArgs & {
    /** The pull/merge request being updated (resume turn, or an adopted link). */
    prUrl: string;
};

export type AdoptPullRequestArgs = {
    prUrl: string;
    connection: GitConnection;
    installation: GitInstallation;
};

/**
 * A git host strategy. The service resolves one implementation from the dbt
 * connection type and then stays host-agnostic — every host-specific branch
 * lives behind this interface. "pull request" is the uniform term in code;
 * only user-facing strings differ (GitLab says "merge request").
 */
export interface GitProvider {
    /** Tag recorded on the `pull_requests` row. */
    readonly provider: PullRequestProvider;
    /** Whether preview-deploy setup (GitHub Actions) applies to this host. */
    readonly supportsPreviewDeploy: boolean;

    resolveConnection(dbtConnection: DbtProjectConfig): GitConnection;
    resolveInstallation(organizationUuid: string): Promise<GitInstallation>;
    getCloneTarget(
        connection: GitConnection,
        installation: GitInstallation,
    ): CloneTarget;

    /** Land the agent's changes on a fresh branch and open a PR/MR; returns its URL. */
    openPullRequest(args: OpenPullRequestArgs): Promise<string>;
    /** Land changes on the checked-out branch and refresh the existing PR/MR. */
    updatePullRequest(args: UpdatePullRequestArgs): Promise<void>;
    /** Validate a pasted PR/MR link before editing it on top of its branch. */
    adoptPullRequest(args: AdoptPullRequestArgs): Promise<AdoptedPullRequest>;
}
