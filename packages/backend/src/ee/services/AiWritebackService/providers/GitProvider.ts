import type {
    DbtProjectConfig,
    PullRequestProvider,
    SessionUser,
} from '@lightdash/common';
import type { SandboxHandle } from '../../SandboxRuntime';
import type {
    AdoptedPullRequest,
    CloneTarget,
    GitConnection,
    GitInstallation,
    SetStage,
} from '../types';

export type OpenPullRequestArgs = {
    sandbox: SandboxHandle;
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

/** A commit a provider just landed on a PR/MR branch. */
export type LandedCommit = {
    /** Head commit SHA pushed this turn — pins the card's CI checks. */
    commitSha: string;
    /** Lines this turn's staged change added. */
    additions: number;
    /** Lines this turn's staged change removed. */
    deletions: number;
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

    resolveConnection(dbtConnection: DbtProjectConfig): GitConnection;
    /**
     * Resolve auth for the run's git host. When `options.user` and
     * `options.connection` are supplied and the user has linked their personal
     * account (feature-flagged) with access to the repo, the installation is
     * resolved to act as that user; otherwise it acts as the app/bot. Callers
     * that only read (e.g. repoShell) may omit the options for bot auth.
     */
    resolveInstallation(
        organizationUuid: string,
        options?: { user?: SessionUser; connection?: GitConnection },
    ): Promise<GitInstallation>;
    getCloneTarget(
        connection: GitConnection,
        installation: GitInstallation,
    ): CloneTarget;

    /**
     * Land the agent's changes on a fresh branch and open a PR/MR. Returns its
     * URL plus this turn's landed commit (SHA + line stat), so the card can pin
     * CI to the commit and show its diff stat.
     */
    openPullRequest(
        args: OpenPullRequestArgs,
    ): Promise<{ prUrl: string } & LandedCommit>;
    /**
     * Land changes on the checked-out branch and refresh the existing PR/MR.
     * Returns this turn's landed commit (SHA + line stat).
     */
    updatePullRequest(args: UpdatePullRequestArgs): Promise<LandedCommit>;
    /** Validate a pasted PR/MR link before editing it on top of its branch. */
    adoptPullRequest(args: AdoptPullRequestArgs): Promise<AdoptedPullRequest>;
    /**
     * Whether a thread's stored PR/MR can still be edited. A resume turn reuses
     * the PR recorded on the thread, which may have been merged or closed (here
     * or on the host) since — editing it would push onto a dead branch and
     * orphan the change, so the caller bails first.
     */
    getPullRequestEditState(args: {
        prUrl: string;
        connection: GitConnection;
        installation: GitInstallation;
    }): Promise<{ editable: boolean; reason: 'merged' | 'closed' | null }>;
}
