import type { Sandbox } from 'e2b';
import type { Logger } from 'winston';
import type { GithubFileChanges } from '../../../../clients/github/Github';
import { CWD } from '../constants';
import { DeniedPathError, findDeniedCommitPaths } from '../deniedPaths';
import type { GitCommitAuthor } from '../types';
import { parseGitNameStatus } from '../utils';

/**
 * Stage the agent's changes for commit. We deliberately avoid `git add --all`:
 * the agent can leave scratch files (e.g. PR metadata) in the working tree, and
 * staging everything is how those leaked into PRs. Instead we stage only the dbt
 * project subtree the writeback is scoped to, so anything outside it can never
 * be committed. When the dbt project IS the repo root we cannot narrow the path,
 * so we fall back to staging all and rely on the caller having scrubbed the
 * known scratch files before this runs.
 */
export const stageChanges = async (
    sandbox: Sandbox,
    projectSubPath: string,
    logger: Logger,
): Promise<void> => {
    const scopedToProject = projectSubPath !== '.';
    logger.info(
        `AiWriteback: staging ${
            scopedToProject
                ? `'${projectSubPath}'`
                : 'all (dbt project is the repo root)'
        } (sandboxId=${sandbox.sandboxId})`,
    );
    await sandbox.git.add(
        CWD,
        scopedToProject ? { files: [projectSubPath] } : { all: true },
    );
    if (scopedToProject) {
        // Also stage Lightdash CI workflow files the agent may have added when
        // setting up preview deploys — they live at the repo root, outside the
        // dbt subtree. `.github/workflows` is a known-safe path; tolerate its
        // absence when no preview-deploy setup happened this turn.
        await sandbox.commands.run(
            `git -C ${CWD} add .github/workflows 2>/dev/null || true`,
        );
    }
};

/**
 * Read the staged changes out of the sandbox as a set of file additions and
 * deletions for a GitHub API commit. `-z` keeps paths NUL-separated so paths
 * with spaces survive; `--no-renames` collapses renames into delete + add so
 * each record is a simple (status, path) pair. Paths are repo-root-relative,
 * which is what `createCommitOnBranch` expects.
 */
export const collectFileChanges = async (
    sandbox: Sandbox,
    { denyCiPaths }: { denyCiPaths: boolean } = { denyCiPaths: false },
): Promise<GithubFileChanges> => {
    const { stdout } = await sandbox.commands.run(
        `git -C ${CWD} diff --cached --name-status --no-renames -z`,
    );
    const { addPaths, deletions } = parseGitNameStatus(stdout);
    // Host-side denied-path gate: reject the whole commit (no PR) if any staged
    // path is a secret file (always) or a CI/workflow file (general agent). The
    // agent has no Bash and commits via the host, so this is the enforceable
    // chokepoint — not just a prompt instruction.
    const denied = findDeniedCommitPaths(
        [...addPaths, ...deletions.map((d) => d.path)],
        { denyCiPaths },
    );
    if (denied.length > 0) {
        throw new DeniedPathError(denied);
    }
    const additions = await Promise.all(
        addPaths.map(async (path) => ({
            path,
            contents: Buffer.from(
                await sandbox.files.read(`${CWD}/${path}`),
                'utf-8',
            ).toString('base64'),
        })),
    );
    return { additions, deletions };
};

/**
 * Reject the staged commit (throwing {@link DeniedPathError}) if it touches a
 * denied path. For providers that push via git (GitLab) rather than committing
 * through {@link collectFileChanges} (GitHub), so the same denied-path guard
 * still applies. Secrets are always denied; CI/workflow paths only when
 * `denyCiPaths` is set.
 */
export const assertStagedPathsAllowed = async (
    sandbox: Sandbox,
    { denyCiPaths }: { denyCiPaths: boolean },
): Promise<void> => {
    const { stdout } = await sandbox.commands.run(
        `git -C ${CWD} diff --cached --name-status --no-renames -z`,
    );
    const { addPaths, deletions } = parseGitNameStatus(stdout);
    const denied = findDeniedCommitPaths(
        [...addPaths, ...deletions.map((d) => d.path)],
        { denyCiPaths },
    );
    if (denied.length > 0) {
        throw new DeniedPathError(denied);
    }
};

/** Total line additions/deletions in a turn's staged change. */
export type DiffStat = { additions: number; deletions: number };

/**
 * Sum the staged diff's added/removed line counts via `--numstat`. Must run
 * while the changes are still staged (before the local commit clears the
 * index). Binary files report `-` for both counts and contribute nothing.
 * Best-effort: any parse failure for a row is skipped rather than throwing, so
 * a single odd line can't break the writeback.
 */
export const collectDiffStat = async (sandbox: Sandbox): Promise<DiffStat> => {
    const { stdout } = await sandbox.commands.run(
        `git -C ${CWD} diff --cached --numstat`,
    );
    return stdout.split('\n').reduce<DiffStat>(
        (acc, line) => {
            const [added, removed] = line.split('\t');
            const a = Number(added);
            const d = Number(removed);
            return {
                additions: acc.additions + (Number.isFinite(a) ? a : 0),
                deletions: acc.deletions + (Number.isFinite(d) ? d : 0),
            };
        },
        { additions: 0, deletions: 0 },
    );
};

/** Make a local commit (never pushed by itself) to advance the sandbox HEAD. */
export const commitLocal = async (
    sandbox: Sandbox,
    message: string,
    author: GitCommitAuthor,
): Promise<void> => {
    await sandbox.git.commit(CWD, message, {
        authorName: author.name,
        authorEmail: author.email,
    });
};
