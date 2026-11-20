import { currentDataAppCodeVersion, type DataAppCode } from '@lightdash/common';
import { memoize } from 'es-toolkit/compat';
import { readdir, readFile } from 'fs/promises';
import path from 'path';

export const managedAdoptionAppSlug = 'analytics-project-adoption-app';

export const getManagedAdoptionAppCode = memoize(
    async (): Promise<DataAppCode> => {
        const appRoot = path.resolve(
            __dirname,
            '../../../../assets/analytics/apps/adoption',
        );
        const entries = await readdir(path.join(appRoot, 'src'), {
            recursive: true,
            withFileTypes: true,
        });
        const paths = entries
            .filter((entry) => entry.isFile())
            .map((entry) => path.join(entry.parentPath, entry.name))
            .sort();

        return {
            manifest: {
                codeVersion: currentDataAppCodeVersion,
                slug: managedAdoptionAppSlug,
                version: 52,
                name: 'Adoption',
                description:
                    'Explore usage and feature adoption across your organization by team.',
                template: null,
                downloadedAt: '2026-11-16T00:00:00.000Z',
            },
            files: await Promise.all(
                paths.map(async (filePath) => ({
                    path: path
                        .relative(appRoot, filePath)
                        .split(path.sep)
                        .join('/'),
                    contentBase64: await readFile(filePath, 'base64'),
                })),
            ),
        };
    },
);
