import { ParameterError } from '@lightdash/common';
import { PassThrough } from 'node:stream';
import { extract, type Headers } from 'tar-stream';

const DIST_INDEX_HTML = 'dist/index.html';
const DIST_ASSETS_PREFIX = 'dist/assets/';
const ALLOWED_DIST_DIRECTORIES = new Set(['dist/', DIST_ASSETS_PREFIX]);
// Leading underscore allowed: rollup emits chunks like _commonjsHelpers-<hash>.js.
const DIST_ASSET_NAME_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/;
const MAX_DIST_TAR_FILES = 500;

/**
 * Validates a downloaded registry dist.tar before it's extracted and
 * uploaded to S3. The registry is an external input, so a malicious or
 * malformed dist bundle is treated as untrusted: without this check, an
 * entry named `dist/source.tar` would silently overwrite the
 * digest-verified source artifact at the same version prefix, entries could
 * escape the flat `dist/assets/` shape vite emits, and a small tar could
 * still trigger tens of thousands of S3 uploads.
 *
 * Every regular-file entry must be exactly `dist/index.html` or a flat
 * `dist/assets/<name>` (no subdirectories); directory entries are allowed
 * only for `dist/` and `dist/assets/`; duplicates, symlinks/hardlinks/device
 * files, and more than `MAX_DIST_TAR_FILES` regular files are all rejected.
 * Rejects with a `ParameterError` naming the offending entry.
 */
export async function assertValidDistTar(tarBuffer: Buffer): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const extractor = extract();
        const seenNames = new Set<string>();
        let fileCount = 0;
        let hasIndexHtml = false;
        let settled = false;

        const fail = (message: string): void => {
            if (settled) return;
            settled = true;
            reject(new ParameterError(`Invalid dist archive: ${message}`));
            extractor.destroy();
        };

        extractor.on(
            'entry',
            (header: Headers, stream: PassThrough, next: () => void) => {
                stream.on('error', reject);
                stream.on('end', next);

                if (settled) {
                    stream.resume();
                    return;
                }

                const { name, type } = header;

                if (!name) {
                    fail('entry with no name');
                    stream.resume();
                    return;
                }

                if (type === 'directory') {
                    if (!ALLOWED_DIST_DIRECTORIES.has(name)) {
                        fail(`unexpected directory "${name}"`);
                    }
                    stream.resume();
                    return;
                }

                if (type !== 'file') {
                    fail(`unsupported entry type "${type}" for "${name}"`);
                    stream.resume();
                    return;
                }

                const assetName = name.startsWith(DIST_ASSETS_PREFIX)
                    ? name.slice(DIST_ASSETS_PREFIX.length)
                    : null;
                const isIndexHtml = name === DIST_INDEX_HTML;
                const isValidAsset =
                    assetName !== null &&
                    assetName.length > 0 &&
                    DIST_ASSET_NAME_PATTERN.test(assetName);

                if (!isIndexHtml && !isValidAsset) {
                    fail(`unexpected file "${name}"`);
                    stream.resume();
                    return;
                }

                if (seenNames.has(name)) {
                    fail(`duplicate entry "${name}"`);
                    stream.resume();
                    return;
                }
                seenNames.add(name);
                if (isIndexHtml) hasIndexHtml = true;

                fileCount += 1;
                if (fileCount > MAX_DIST_TAR_FILES) {
                    fail(
                        `too many files (max ${MAX_DIST_TAR_FILES}, encountered "${name}")`,
                    );
                    stream.resume();
                    return;
                }

                stream.resume();
            },
        );

        extractor.on('finish', () => {
            if (settled) return;
            if (!hasIndexHtml) {
                fail(`missing ${DIST_INDEX_HTML}`);
                return;
            }
            settled = true;
            resolve();
        });

        extractor.on('error', reject);

        const passThrough = new PassThrough();
        passThrough.pipe(extractor);
        passThrough.end(tarBuffer);
    });
}
