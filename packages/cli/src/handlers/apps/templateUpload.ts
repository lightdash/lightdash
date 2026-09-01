/* eslint-disable no-await-in-loop */
import {
    DATA_APP_TEMPLATE_GUARDRAILS_PATH,
    DATA_APP_TEMPLATE_MANIFEST_PATH,
    DATA_APP_TEMPLATE_PACKAGE_CONTENT_TYPE,
    getErrorMessage,
    MAX_DATA_APP_TEMPLATE_PACKAGE_BYTES,
    ParameterError,
    type ApiDataAppTemplateImportResponse,
} from '@lightdash/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { pack as tarPack, type Headers } from 'tar-stream';
import GlobalState from '../../globalState';
import * as styles from '../../styles';
import { getDownloadFolder } from '../contentAsCodePaths';
import { lightdashRawApi } from '../dbt/apiClient';

const TAR_EPOCH = new Date(0);

export type TemplateUploadSummary = {
    created: number;
    updated: number;
    failed: number;
};

const addTarEntry = (
    packer: ReturnType<typeof tarPack>,
    header: Headers,
    body: Buffer,
): Promise<void> =>
    new Promise((resolve, reject) => {
        packer.entry(header, body, (error) => {
            if (error) reject(error);
            else resolve();
        });
    });

const collectFiles = async (
    dir: string,
    baseDir: string,
): Promise<string[]> => {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const nested = await Promise.all(
        entries.map(async (entry) => {
            const entryPath = path.join(dir, entry.name);
            if (entry.isDirectory()) return collectFiles(entryPath, baseDir);
            if (!entry.isFile()) return [];
            return [
                path.relative(baseDir, entryPath).split(path.sep).join('/'),
            ];
        }),
    );
    return nested.flat();
};

/**
 * Packs an app folder as a template package: the authored `src/**` tree
 * plus `AGENTS.md` guardrails, as an uncompressed tar with fixed headers so
 * the same folder always produces the same bytes. Scaffold and tooling
 * files (`lightdash-app.yml`, `package.json`, `node_modules`, `.lightdash`)
 * are never included — the server rebuilds against its own template.
 */
export const buildDataAppTemplatePackage = async (
    appDir: string,
): Promise<Buffer> => {
    const manifestPath = path.join(appDir, DATA_APP_TEMPLATE_MANIFEST_PATH);
    const hasManifest = await fs
        .stat(manifestPath)
        .then((s) => s.isFile())
        .catch(() => false);
    if (!hasManifest) {
        throw new ParameterError(
            `${appDir} is not a template: ${DATA_APP_TEMPLATE_MANIFEST_PATH} is missing`,
        );
    }

    const files = await collectFiles(path.join(appDir, 'src'), appDir);
    const guardrailsPath = path.join(appDir, DATA_APP_TEMPLATE_GUARDRAILS_PATH);
    const hasGuardrails = await fs
        .stat(guardrailsPath)
        .then((s) => s.isFile())
        .catch(() => false);
    if (hasGuardrails) files.push(DATA_APP_TEMPLATE_GUARDRAILS_PATH);
    files.sort();

    return new Promise((resolve, reject) => {
        const packer = tarPack();
        const chunks: Buffer[] = [];
        packer.on('data', (chunk: Buffer) => chunks.push(chunk));
        packer.on('end', () => resolve(Buffer.concat(chunks)));
        packer.on('error', reject);

        void (async () => {
            for (const filename of files) {
                const body = await fs.readFile(path.join(appDir, filename));
                await addTarEntry(
                    packer,
                    {
                        name: filename,
                        type: 'file',
                        mode: 0o644,
                        mtime: TAR_EPOCH,
                        uid: 0,
                        gid: 0,
                    },
                    body,
                );
            }
            packer.finalize();
        })().catch(reject);
    });
};

/**
 * `lightdash upload --apps <slug...> --as-template`: publishes each app
 * folder as an organization data app template. Org-scoped, so no project
 * is selected; refs must be folder names under `apps/`.
 */
export const uploadAppsAsTemplates = async ({
    customPath,
    appRefs,
}: {
    customPath?: string;
    appRefs: string[];
}): Promise<TemplateUploadSummary> => {
    if (appRefs.length === 0) {
        throw new ParameterError(
            '--as-template requires --apps <slug...> naming the app folders to publish.',
        );
    }
    const appsDir = path.join(getDownloadFolder(customPath), 'apps');
    const summary: TemplateUploadSummary = {
        created: 0,
        updated: 0,
        failed: 0,
    };

    for (const ref of appRefs) {
        const appDir = path.join(appsDir, ref);
        const exists = await fs
            .stat(appDir)
            .then((s) => s.isDirectory())
            .catch(() => false);
        if (!exists) {
            throw new ParameterError(
                `App folder "${ref}" not found in ${appsDir}. --as-template takes folder names under apps/.`,
            );
        }
        try {
            const archive = await buildDataAppTemplatePackage(appDir);
            if (archive.length > MAX_DATA_APP_TEMPLATE_PACKAGE_BYTES) {
                throw new ParameterError(
                    `Template package for "${ref}" exceeds ${MAX_DATA_APP_TEMPLATE_PACKAGE_BYTES} bytes`,
                );
            }
            const response = await lightdashRawApi({
                method: 'PUT',
                url: '/api/v1/org/data-app-templates/package',
                body: archive,
                headers: {
                    'Content-Type': DATA_APP_TEMPLATE_PACKAGE_CONTENT_TYPE,
                    'Content-Length': String(archive.length),
                },
            });
            const result =
                (await response.json()) as ApiDataAppTemplateImportResponse;
            if (result.status !== 'ok') {
                throw new Error('Template import returned an invalid response');
            }
            const { slug, name, questions, action } = result.results;
            if (action === 'created') summary.created += 1;
            else summary.updated += 1;
            GlobalState.log(
                styles.success(
                    `✔ ${action === 'created' ? 'Published' : 'Updated'} template "${name}" (${slug}) with ${questions.length} question(s)`,
                ),
            );
        } catch (error) {
            summary.failed += 1;
            GlobalState.log(
                styles.error(
                    `✖ Failed to publish "${ref}" as a template: ${getErrorMessage(error)}`,
                ),
            );
        }
    }

    GlobalState.log(
        `Templates: ${summary.created} created, ${summary.updated} updated, ${summary.failed} failed`,
    );
    return summary;
};
