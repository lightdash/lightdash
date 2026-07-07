import * as yaml from 'js-yaml';
import type { Logger } from 'winston';
import type { GithubFileChanges } from '../../../../clients/github/Github';
import type { SandboxHandle } from '../../SandboxRuntime';
import { CWD } from '../constants';
import { DeniedPathError, findDeniedCommitPaths } from '../deniedPaths';
import type { GitCommitAuthor } from '../types';
import { parseGitNameStatus } from '../utils';

// Default dbt package install directory, relative to the project dir. Overridable
// in dbt_project.yml via `packages-install-path`; see resolveDbtProjectPaths.
const DEFAULT_PACKAGES_INSTALL_PATH = 'dbt_packages';

// dbt project/package names are `[A-Za-z0-9_]` (a leading letter/underscore then
// word chars). We read them out of the repo's own manifest.json — untrusted
// content — and interpolate them into a shell command below, so anything outside
// this charset is dropped rather than escaped: it can't be a real dbt package and
// keeps the command injection-free.
const SAFE_DBT_NAME = /^[A-Za-z0-9_]+$/;
// `packages-install-path` is likewise repo-controlled and interpolated into the
// same command. Allow only a plain relative path (dir names, `.`/`..`, slashes) —
// enough for real overrides, nothing that can break out of the single-quoted
// shell word — and fall back to the default otherwise.
const SAFE_INSTALL_PATH = /^[A-Za-z0-9_./-]+$/;

/**
 * Read the dbt `packages-install-path` from the project's dbt_project.yml,
 * falling back to the default (`dbt_packages`) when unset, unreadable, or not a
 * plain relative path. This is where `dbt deps` installs each package (and, for
 * `local:` packages, where it symlinks the real source from).
 */
const readPackagesInstallPath = async (
    sandbox: SandboxHandle,
    projectSubPath: string,
): Promise<string> => {
    try {
        const raw = await sandbox.files.read(
            `${CWD}/${projectSubPath}/dbt_project.yml`,
        );
        const parsed = yaml.load(raw);
        const value =
            parsed !== null && typeof parsed === 'object'
                ? (parsed as Record<string, unknown>)['packages-install-path']
                : undefined;
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (SAFE_INSTALL_PATH.test(trimmed)) {
                return trimmed;
            }
        }
    } catch {
        // Missing/unparseable dbt_project.yml — fall through to the default.
    }
    return DEFAULT_PACKAGES_INSTALL_PATH;
};

/**
 * Resolve the set of repo-root-relative paths that constitute the dbt project
 * being written back to: the connected project subtree PLUS every `local:`
 * package it actually compiled. This is what {@link stageChanges} must stage so
 * that an edit to a model whose real source lives in an imported package tree
 * (e.g. a monorepo `packages/...` dir, outside `projectSubPath`) is committed —
 * without resorting to `git add --all`, which would also sweep in agent scratch.
 *
 * Source of truth is dbt's own package resolution, not a guess:
 *  - `target/manifest.json` lists every compiled node's `package_name` (dbt
 *    deletes the old `root_path` field from the manifest, so package_name +
 *    install path is the canonical mapping).
 *  - `dbt deps` installs each non-root package at
 *    `<projectSubPath>/<packages-install-path>/<package_name>`. For a `local:`
 *    package that install entry is a SYMLINK back to the real source in the repo;
 *    for a dbt-hub package it's a vendored real dir (git-ignored). Resolving the
 *    symlink yields the real repo path; the `-L` test excludes the vendored dirs.
 *
 * This generalises to arbitrarily nested local packages — `dbt deps` flattens the
 * whole dependency tree into the install dir — and to a `packages-install-path`
 * override. Best-effort: any failure to read/parse the manifest falls back to
 * just `[projectSubPath]` (the pre-existing scope), so staging never regresses
 * to worse than before. When the project IS the repo root (`projectSubPath` is
 * `.`) there is nothing to narrow, so we return `['.']` and let stageChanges do
 * its `--all` fallback.
 */
export const resolveDbtProjectPaths = async (
    sandbox: SandboxHandle,
    projectSubPath: string,
    logger: Logger,
): Promise<string[]> => {
    if (projectSubPath === '.') {
        return ['.'];
    }
    const paths = new Set<string>([projectSubPath]);

    let manifest: unknown;
    try {
        manifest = JSON.parse(
            await sandbox.files.read(
                `${CWD}/${projectSubPath}/target/manifest.json`,
            ),
        );
    } catch (error) {
        logger.warn(
            `AiWriteback: could not read target/manifest.json to resolve local package paths; staging only '${projectSubPath}' (sandboxId=${sandbox.sandboxId})`,
        );
        return [...paths];
    }

    const rootPackage = (manifest as { metadata?: { project_name?: string } })
        .metadata?.project_name;
    // Collect the package name of every compiled resource across all node-like
    // collections. Anything with a `package_name` counts — models, sources,
    // macros, exposures, metrics, semantic models, docs.
    const packageNames = new Set<string>();
    for (const collection of Object.values(
        manifest as Record<string, unknown>,
    )) {
        if (collection !== null && typeof collection === 'object') {
            for (const resource of Object.values(
                collection as Record<string, unknown>,
            )) {
                const packageName = (resource as { package_name?: unknown })
                    ?.package_name;
                if (
                    typeof packageName === 'string' &&
                    packageName !== rootPackage &&
                    SAFE_DBT_NAME.test(packageName)
                ) {
                    packageNames.add(packageName);
                }
            }
        }
    }
    if (packageNames.size === 0) {
        return [...paths];
    }

    const installPath = await readPackagesInstallPath(sandbox, projectSubPath);
    // Resolve each candidate package's install entry inside the sandbox: emit a
    // repo-relative path only for symlinks (local packages) whose target lands
    // inside the repo. Vendored hub packages are real dirs (`-L` fails) and are
    // skipped. All interpolated values are charset-validated above.
    const packageList = [...packageNames].join(' ');
    const script = [
        `cwd_real=$(readlink -f ${JSON.stringify(CWD)})`,
        `for p in ${packageList}; do`,
        `  link="${CWD}/${projectSubPath}/${installPath}/$p"`,
        `  [ -L "$link" ] || continue`,
        `  real=$(readlink -f "$link" 2>/dev/null) || continue`,
        `  [ -n "$real" ] || continue`,
        `  case "$real/" in`,
        `    "$cwd_real/"*) rel="\${real#"$cwd_real/"}"; [ -n "$rel" ] && printf '%s\\n' "$rel" ;;`,
        `  esac`,
        `done`,
    ].join('\n');

    try {
        const { stdout } = await sandbox.commands.run(script);
        stdout
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0 && line !== projectSubPath)
            .forEach((line) => paths.add(line));
    } catch (error) {
        logger.warn(
            `AiWriteback: failed to resolve local package paths; staging only '${projectSubPath}' (sandboxId=${sandbox.sandboxId})`,
        );
    }

    return [...paths];
};

/**
 * Stage the agent's changes for commit. We deliberately avoid `git add --all`:
 * the agent can leave scratch files (e.g. PR metadata) in the working tree, and
 * staging everything is how those leaked into PRs. Instead we stage only the dbt
 * project paths the writeback is scoped to (the connected project subtree plus
 * any imported `local:` package trees it compiled — see
 * {@link resolveDbtProjectPaths}), so anything outside them can never be
 * committed. When the dbt project IS the repo root we cannot narrow the path, so
 * we fall back to staging all and rely on the caller having scrubbed the known
 * scratch files before this runs — {@link resolveDbtProjectPaths} signals that
 * case by returning exactly `['.']`.
 */
export const stageChanges = async (
    sandbox: SandboxHandle,
    paths: string[],
    logger: Logger,
): Promise<void> => {
    const scopedToProject = !(paths.length === 1 && paths[0] === '.');
    logger.info(
        `AiWriteback: staging ${
            scopedToProject
                ? paths.map((path) => `'${path}'`).join(', ')
                : 'all (dbt project is the repo root)'
        } (sandboxId=${sandbox.sandboxId})`,
    );
    await sandbox.git.add(
        CWD,
        scopedToProject ? { files: paths } : { all: true },
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
    sandbox: SandboxHandle,
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
