import { createHash } from 'crypto';
import { writeFileSync } from 'fs';
import * as path from 'path';
import { type Plugin, type ResolvedConfig } from 'vite';

export const BUILD_HASH_MANIFEST_FILENAME = 'build-hash.json';
export const BUILD_HASH_META_NAME = 'lightdash-build-hash';

export const buildHashPlugin = (): Plugin => {
    let resolvedConfig: ResolvedConfig | undefined;
    let buildHash: string | undefined;

    return {
        name: 'lightdash-build-hash',
        apply: 'build',
        configResolved(config) {
            resolvedConfig = config;
        },
        transformIndexHtml: {
            order: 'post',
            handler(html, ctx) {
                if (!ctx.bundle) {
                    return html;
                }

                buildHash = createHash('sha256')
                    .update(Object.keys(ctx.bundle).sort().join('\n'))
                    .digest('hex')
                    .slice(0, 16);

                return {
                    html,
                    tags: [
                        {
                            tag: 'meta',
                            attrs: {
                                name: BUILD_HASH_META_NAME,
                                content: buildHash,
                            },
                            injectTo: 'head',
                        },
                    ],
                };
            },
        },
        closeBundle() {
            if (!buildHash || !resolvedConfig) {
                return;
            }

            const outDir = path.resolve(
                resolvedConfig.root,
                resolvedConfig.build.outDir,
            );

            writeFileSync(
                path.join(outDir, BUILD_HASH_MANIFEST_FILENAME),
                `${JSON.stringify({ buildHash })}\n`,
            );
        },
    };
};
