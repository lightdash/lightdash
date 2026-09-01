import { ParameterError } from '@lightdash/common';
import { promises as fs } from 'fs';
import * as path from 'path';

/**
 * Resolves `absolutePath` through any symlinks so it can be safely compared
 * for containment against another canonicalized path. The path may not
 * exist yet (e.g. an --out-dir that hasn't been built to), so this walks up
 * to the nearest existing ancestor, realpaths that ancestor, and re-joins
 * the non-existent remainder lexically.
 *
 * Any realpath failure other than "this segment doesn't exist" (permission
 * denied, a symlink loop, ...) is rethrown rather than swallowed. Callers
 * must treat that as "cannot prove this path is safe" and refuse the
 * operation — never fall back to the un-canonicalized path.
 */
export const canonicalizeForContainment = async (
    absolutePath: string,
): Promise<string> => {
    let current = absolutePath;
    const missingSegments: string[] = [];
    while (true) {
        try {
            // eslint-disable-next-line no-await-in-loop
            const real = await fs.realpath(current);
            return missingSegments.length > 0
                ? path.join(real, ...missingSegments.reverse())
                : real;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw error;
            }
            const parent = path.dirname(current);
            if (parent === current) {
                // Reached the filesystem root and even it didn't resolve.
                throw error;
            }
            missingSegments.push(path.basename(current));
            current = parent;
        }
    }
};

/**
 * The build wipes outDir before copying the new output in. If outDir is (or
 * contains) appDir, that wipe deletes the app source being built. Both
 * arguments must already be resolved to absolute, canonical (symlink-free)
 * paths — see `canonicalizeForContainment`.
 */
export const assertOutDirDoesNotContainAppDir = (
    appDir: string,
    outDir: string,
): void => {
    const relativeAppDirFromOutDir = path.relative(outDir, appDir);
    const appDirIsInsideOutDir =
        relativeAppDirFromOutDir !== '' &&
        !relativeAppDirFromOutDir.startsWith('..') &&
        !path.isAbsolute(relativeAppDirFromOutDir);
    if (outDir === appDir || appDirIsInsideOutDir) {
        throw new ParameterError(
            '--out-dir must not contain the app directory (would delete the app source on build)',
        );
    }
};

/**
 * Defense-in-depth recheck for the deletion site itself: outDir may have
 * changed since an earlier containment check ran, or a caller may not have
 * run one at all. If outDir doesn't exist yet there is nothing to delete,
 * so this is a no-op. If it exists, both paths are canonicalized and
 * re-checked with the same predicate as the pre-build guard. Throws
 * ParameterError on violation; never trusts the caller's un-canonicalized
 * paths.
 */
export const assertOutDirSafeToClear = async (
    appDir: string,
    outDir: string,
): Promise<void> => {
    let canonicalOutDir: string;
    try {
        canonicalOutDir = await fs.realpath(outDir);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            // Nothing exists at outDir yet, so there's nothing to delete.
            return;
        }
        // Cannot prove outDir is safe to clear — refuse rather than guess.
        throw error;
    }
    const canonicalAppDir = await canonicalizeForContainment(appDir);
    assertOutDirDoesNotContainAppDir(canonicalAppDir, canonicalOutDir);
};
