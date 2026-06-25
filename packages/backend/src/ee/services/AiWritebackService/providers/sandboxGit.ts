import type { Logger } from 'winston';
import type { GithubFileChanges } from '../../../../clients/github/Github';
import type { SandboxHandle } from '../../SandboxRuntime';
import { CWD } from '../constants';
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
    sandbox: SandboxHandle,
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
    sandbox: SandboxHandle,
): Promise<GithubFileChanges> => {
    const { stdout } = await sandbox.commands.run(
        `git -C ${CWD} diff --cached --name-status --no-renames -z`,
    );
    const { addPaths, deletions } = parseGitNameStatus(stdout);
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

/** Total line additions/deletions in a turn's staged change. */
export type DiffStat = { additions: number; deletions: number };

/**
 * Sum the staged diff's added/removed line counts via `--numstat`. Must run
 * while the changes are still staged (before the local commit clears the
 * index). Binary files report `-` for both counts and contribute nothing.
 * Best-effort: any parse failure for a row is skipped rather than throwing, so
 * a single odd line can't break the writeback.
 */
export const collectDiffStat = async (
    sandbox: SandboxHandle,
): Promise<DiffStat> => {
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
    sandbox: SandboxHandle,
    message: string,
    author: GitCommitAuthor,
): Promise<void> => {
    await sandbox.git.commit(CWD, message, {
        authorName: author.name,
        authorEmail: author.email,
    });
};
