import { getErrorMessage, ParameterError } from '@lightdash/common';
import * as path from 'path';
import GlobalState from '../../globalState';
import * as styles from '../../styles';
import { readBundleFromDir } from './appCodeFiles';
import {
    assertOutDirDoesNotContainAppDir,
    canonicalizeForContainment,
} from './pathContainment';
import { formatIssue, validateDataAppBuild } from './validate';

export type AppsBuildOptions = {
    outDir?: string;
    verbose: boolean;
};

export const appsBuildHandler = async (
    pathArg: string | undefined,
    options: AppsBuildOptions,
): Promise<void> => {
    GlobalState.setVerbose(options.verbose);
    const appDir = path.resolve(process.cwd(), pathArg ?? '.');
    const outDir = path.resolve(
        process.cwd(),
        options.outDir ?? path.join(appDir, 'dist'),
    );
    assertOutDirDoesNotContainAppDir(appDir, outDir);

    // The lexical check above can be bypassed by symlinks (an appDir that is
    // itself a symlink into outDir's real tree, or an outDir reached through
    // a symlinked ancestor whose target contains appDir), so re-run the same
    // check on the canonicalized paths before doing anything destructive.
    const [canonicalAppDir, canonicalOutDir] = await Promise.all([
        canonicalizeForContainment(appDir),
        canonicalizeForContainment(outDir),
    ]);
    assertOutDirDoesNotContainAppDir(canonicalAppDir, canonicalOutDir);

    let bundle: Awaited<ReturnType<typeof readBundleFromDir>>;
    try {
        bundle = await readBundleFromDir(appDir);
    } catch (error) {
        throw new ParameterError(getErrorMessage(error));
    }

    if (bundle.files.length === 0) {
        throw new ParameterError(
            `App bundle has no files under src/ to build: ${appDir}`,
        );
    }

    const issues = await validateDataAppBuild({ appDir, bundle, outDir });
    if (issues.length > 0) {
        for (const buildIssue of issues) {
            GlobalState.log(
                `${styles.error('error')} ${formatIssue(buildIssue)}`,
            );
        }
        throw new ParameterError(
            `Build failed with ${issues.length} error(s).`,
        );
    }

    GlobalState.log(styles.success(`✓ Built ${appDir} → ${outDir}`));
};
