import type execaDefault from 'execa';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import {
    buildSandboxEnvironment,
    LEARN_SANDBOX_COMMAND_TIMEOUT_MS,
} from './runtime';
import {
    materialiseWorkspace,
    renderProfiles,
    type LearnBundle,
} from './workspace';

/**
 * Every sandbox command runs in a fresh workspace, so dbt would parse the
 * whole bundle from scratch each time (about 7 s on a scheduler pod). A
 * partial_parse.msgpack from one parse of the pristine bundle lets dbt
 * re-parse only the files the learner changed (CS-334). The baseline is
 * built from bundle files only, never from a learner's overlay, so no
 * learner's state reaches another learner's workspace. dbt checks file
 * hashes, the profile, vars and its own version before reusing the file
 * and falls back to a full parse on any mismatch, so a stale baseline
 * costs time, never correctness.
 */
const PARTIAL_PARSE_FILE = 'partial_parse.msgpack';

export type PartialParseBaselineInputs = {
    bundle: LearnBundle;
    databasePath: string;
    dbtVersion: string | undefined;
    /** PATH the sandbox resolves `dbt` from. */
    sandboxPath: string;
};

export const partialParseBaselineKey = (
    inputs: PartialParseBaselineInputs,
): string =>
    createHash('sha256')
        .update(
            JSON.stringify([
                inputs.bundle.files,
                renderProfiles(inputs.databasePath),
                inputs.dbtVersion ?? '',
                inputs.sandboxPath,
            ]),
        )
        .digest('hex')
        .slice(0, 32);

export const partialParseBaselinePath = (root: string, key: string): string =>
    path.join(root, `${key}.msgpack`);

/**
 * Copies the baseline into the workspace's dbt target directory. Returns
 * false when there is no baseline yet, so the command runs a full parse.
 */
export const seedPartialParse = async (
    baselinePath: string,
    workspaceDir: string,
): Promise<boolean> => {
    const targetDir = path.join(workspaceDir, 'target');
    try {
        await mkdir(targetDir, { recursive: true });
        await copyFile(baselinePath, path.join(targetDir, PARTIAL_PARSE_FILE));
        return true;
    } catch {
        return false;
    }
};

/**
 * Runs `dbt parse` on the pristine bundle in a scratch directory under
 * `root` and moves the resulting partial_parse.msgpack to the baseline path
 * for `key`. The move is a rename within `root`, so a command never copies
 * a half-written file. Resolves false when dbt fails or writes no file.
 */
export const buildPartialParseBaseline = async (args: {
    root: string;
    key: string;
    bundle: LearnBundle;
    databasePath: string;
    pathPrefix: string[];
    processEnvironment: NodeJS.ProcessEnv;
    execa: typeof execaDefault;
}): Promise<boolean> => {
    await mkdir(args.root, { recursive: true, mode: 0o700 });
    const buildDir = await mkdtemp(path.join(args.root, 'build-'));
    try {
        await materialiseWorkspace({
            bundle: args.bundle,
            overlay: [],
            workspaceDir: buildDir,
            profiles: { databasePath: args.databasePath },
        });
        const projectDir = path.join(buildDir, 'project');
        const env = buildSandboxEnvironment({
            processEnvironment: args.processEnvironment,
            pathPrefix: args.pathPrefix,
            apiUrl: undefined,
            siteUrl: '',
            projectUuid: '',
            workspaceDir: buildDir,
            projectDir,
            databasePath: args.databasePath,
            partialParse: true,
        });
        const result = await args.execa('dbt', ['parse'], {
            cwd: projectDir,
            env,
            extendEnv: false,
            shell: false,
            reject: false,
            timeout: LEARN_SANDBOX_COMMAND_TIMEOUT_MS,
        });
        if (result.exitCode !== 0) {
            return false;
        }
        await rename(
            path.join(buildDir, 'target', PARTIAL_PARSE_FILE),
            partialParseBaselinePath(args.root, args.key),
        );
        return true;
    } catch {
        return false;
    } finally {
        await rm(buildDir, { recursive: true, force: true }).catch(
            () => undefined,
        );
    }
};
