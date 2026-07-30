import {
    AuthorizationError,
    ContentAsCodeType,
    LightdashError,
    ParameterError,
    type ApiContentSlugUpdateResponse,
    type ContentSlugRename,
} from '@lightdash/common';
import { promises as fs } from 'fs';
import inquirer from 'inquirer';
import * as path from 'path';
import { parseDocument } from 'yaml';
import { getConfig } from '../config';
import GlobalState from '../globalState';
import * as styles from '../styles';
import { getDownloadFolder } from './contentAsCodePaths';
import { checkLightdashVersion, lightdashApi } from './dbt/apiClient';
import { METADATA_FILENAME, readMetadataFile } from './metadataFile';
import { logSelectedProject, selectProject } from './selectProject';

type SlugUpdateOptions = {
    verbose: boolean;
    project?: string;
    path?: string;
    type: string;
    from: string;
    to: string;
    dryRun: boolean;
    assumeYes: boolean;
};

type LocalSlugUpdatePlan = {
    fileUpdates: Array<{ filePath: string; content: string }>;
    fileMoves: Array<{ source: string; target: string }>;
    metadata:
        | {
              root: string;
              charts: Record<string, string>;
          }
        | undefined;
    referencesUpdated: number;
};

const getYamlFiles = async (root: string): Promise<string[]> => {
    try {
        const entries = await fs.readdir(root, {
            recursive: true,
            withFileTypes: true,
        });
        return entries
            .filter(
                (entry) =>
                    entry.isFile() &&
                    (entry.name.endsWith('.yml') ||
                        entry.name.endsWith('.yaml')) &&
                    !entry.name.endsWith('.language.map.yml') &&
                    !entry.name.endsWith('.language.map.yaml'),
            )
            .map((entry) => path.join(entry.parentPath ?? root, entry.name));
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return [];
        }
        throw error;
    }
};

const assertMovesAreSafe = async (
    moves: LocalSlugUpdatePlan['fileMoves'],
): Promise<void> => {
    const sources = new Set(moves.map(({ source }) => source));
    const targets = new Set<string>();
    for (const { target } of moves) {
        if (targets.has(target)) {
            throw new ParameterError(
                `Multiple content files would be renamed to "${target}"`,
            );
        }
        targets.add(target);
        try {
            // eslint-disable-next-line no-await-in-loop
            await fs.access(target);
            if (!sources.has(target)) {
                throw new ParameterError(
                    `Cannot rename content file because "${target}" already exists`,
                );
            }
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw error;
            }
        }
    }
};

export const planLocalChartSlugUpdates = async (
    customPath: string | undefined,
    changes: ContentSlugRename[],
): Promise<LocalSlugUpdatePlan> => {
    const root = getDownloadFolder(customPath);
    const changesByOldSlug = new Map(
        changes.map((change) => [change.oldSlug, change]),
    );
    const fileUpdates: LocalSlugUpdatePlan['fileUpdates'] = [];
    const fileMoves: LocalSlugUpdatePlan['fileMoves'] = [];
    let referencesUpdated = 0;

    const yamlFiles = await getYamlFiles(root);
    for (const filePath of yamlFiles) {
        // eslint-disable-next-line no-await-in-loop
        const source = await fs.readFile(filePath, 'utf8');
        const document = parseDocument(source);
        if (document.errors.length > 0) {
            throw new ParameterError(
                `Could not parse "${filePath}": ${document.errors
                    .map(({ message }) => message)
                    .join('; ')}`,
            );
        }

        let changed = false;
        const parsed = document.toJS() as {
            slug?: unknown;
            contentType?: unknown;
            metricQuery?: unknown;
            tiles?: Array<{
                type?: unknown;
                properties?: { chartSlug?: unknown };
            }>;
            resource?: { type?: unknown; slug?: unknown };
        };
        const { slug, contentType } = parsed;
        const isChart =
            contentType === 'chart' || parsed.metricQuery !== undefined;
        if (isChart && typeof slug === 'string') {
            const rename = changesByOldSlug.get(slug);
            if (rename) {
                document.set('slug', rename.newSlug);
                referencesUpdated += 1;
                changed = true;

                const extension = path.extname(filePath);
                const oldFileName = `${rename.oldSlug}${extension}`;
                if (path.basename(filePath) === oldFileName) {
                    fileMoves.push({
                        source: filePath,
                        target: path.join(
                            path.dirname(filePath),
                            `${rename.newSlug}${extension}`,
                        ),
                    });
                    for (const languageMapExtension of ['.yml', '.yaml']) {
                        const oldLanguageMap = path.join(
                            path.dirname(filePath),
                            `${rename.oldSlug}.language.map${languageMapExtension}`,
                        );
                        try {
                            // eslint-disable-next-line no-await-in-loop
                            await fs.access(oldLanguageMap);
                            fileMoves.push({
                                source: oldLanguageMap,
                                target: path.join(
                                    path.dirname(filePath),
                                    `${rename.newSlug}.language.map${languageMapExtension}`,
                                ),
                            });
                        } catch (error) {
                            if (
                                (error as NodeJS.ErrnoException).code !==
                                'ENOENT'
                            ) {
                                throw error;
                            }
                        }
                    }
                }
            }
        }

        const { tiles } = parsed;
        if (Array.isArray(tiles)) {
            for (const [index, tile] of tiles.entries()) {
                const oldSlug = tile.properties?.chartSlug;
                if (
                    tile.type === 'saved_chart' &&
                    typeof oldSlug === 'string'
                ) {
                    const rename = changesByOldSlug.get(oldSlug);
                    if (rename) {
                        document.setIn(
                            ['tiles', index, 'properties', 'chartSlug'],
                            rename.newSlug,
                        );
                        referencesUpdated += 1;
                        changed = true;
                    }
                }
            }
        }

        if (parsed.resource?.type === 'chart') {
            const oldSlug = parsed.resource.slug;
            if (typeof oldSlug === 'string') {
                const rename = changesByOldSlug.get(oldSlug);
                if (rename) {
                    document.setIn(['resource', 'slug'], rename.newSlug);
                    referencesUpdated += 1;
                    changed = true;
                }
            }
        }

        if (changed) {
            fileUpdates.push({ filePath, content: document.toString() });
        }
    }

    const metadata = await readMetadataFile(root);
    let metadataChanged = false;
    const updatedChartMetadata = { ...metadata.charts };
    changes.forEach(({ oldSlug }) => {
        if (oldSlug in metadata.charts) {
            delete updatedChartMetadata[oldSlug];
            metadataChanged = true;
        }
    });
    changes.forEach(({ oldSlug, newSlug }) => {
        if (oldSlug in metadata.charts) {
            updatedChartMetadata[newSlug] = metadata.charts[oldSlug];
        }
    });

    await assertMovesAreSafe(fileMoves);
    return {
        fileUpdates,
        fileMoves,
        metadata: metadataChanged
            ? { root, charts: updatedChartMetadata }
            : undefined,
        referencesUpdated,
    };
};

export const applyLocalChartSlugUpdates = async (
    plan: LocalSlugUpdatePlan,
): Promise<void> => {
    const metadataPath = plan.metadata
        ? path.join(plan.metadata.root, METADATA_FILENAME)
        : undefined;
    const affectedPaths = new Set([
        ...plan.fileUpdates.map(({ filePath }) => filePath),
        ...plan.fileMoves.flatMap(({ source, target }) => [source, target]),
        ...(metadataPath ? [metadataPath] : []),
    ]);
    const snapshots = new Map<string, Buffer | undefined>();
    for (const filePath of affectedPaths) {
        try {
            // eslint-disable-next-line no-await-in-loop
            snapshots.set(filePath, await fs.readFile(filePath));
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw error;
            }
            snapshots.set(filePath, undefined);
        }
    }

    const stagedMoves: Array<{ temporary: string; target: string }> = [];
    try {
        await Promise.all(
            plan.fileUpdates.map(({ filePath, content }) =>
                fs.writeFile(filePath, content),
            ),
        );

        for (const [index, move] of plan.fileMoves.entries()) {
            const temporary = `${move.source}.slug-update-${process.pid}-${index}`;
            // eslint-disable-next-line no-await-in-loop
            await fs.rename(move.source, temporary);
            stagedMoves.push({ temporary, target: move.target });
        }
        for (const move of stagedMoves) {
            // eslint-disable-next-line no-await-in-loop
            await fs.rename(move.temporary, move.target);
        }

        if (plan.metadata && metadataPath) {
            const existing = await readMetadataFile(plan.metadata.root);
            await fs.writeFile(
                metadataPath,
                JSON.stringify(
                    {
                        ...existing,
                        charts: plan.metadata.charts,
                    },
                    null,
                    2,
                ),
            );
        }
    } catch (error) {
        await Promise.all(
            stagedMoves.map(({ temporary }) =>
                fs.rm(temporary, { force: true }),
            ),
        );
        await Promise.all(
            [...snapshots].map(([filePath, content]) =>
                content === undefined
                    ? fs.rm(filePath, { force: true })
                    : fs.writeFile(filePath, content),
            ),
        );
        throw error;
    }
};

export const requestSlugUpdate = async (
    projectUuid: string,
    contentType: ContentAsCodeType,
    oldSlug: string,
    newSlug: string,
    dryRun: boolean,
): Promise<ContentSlugRename[]> => {
    try {
        return (
            await lightdashApi<ApiContentSlugUpdateResponse['results']>({
                method: 'POST',
                url: `/api/v1/projects/${projectUuid}/code/slugs`,
                body: JSON.stringify({
                    contentType,
                    oldSlug,
                    newSlug,
                    dryRun,
                }),
            })
        ).changes;
    } catch (error) {
        if (
            error instanceof LightdashError &&
            error.statusCode === 404 &&
            error.message === 'API endpoint not found'
        ) {
            throw new ParameterError(
                'This Lightdash server does not support slug-update yet. Upgrade the server to a version that includes the content slug update endpoint, or restart the local API from the same branch as this CLI.',
            );
        }
        throw error;
    }
};

export const slugUpdateHandler = async (
    options: SlugUpdateOptions,
): Promise<void> => {
    GlobalState.setVerbose(options.verbose);
    await checkLightdashVersion();
    if (options.type !== ContentAsCodeType.CHART) {
        throw new ParameterError(
            `Content type "${options.type}" is not supported yet. Currently supported: chart`,
        );
    }
    const config = await getConfig();
    if (!config.context?.apiKey || !config.context.serverUrl) {
        throw new AuthorizationError(
            `Not logged in. Run 'lightdash login --help'`,
        );
    }

    const selection = await selectProject(config, options.project);
    if (!selection) {
        throw new ParameterError(
            'No project selected. Run lightdash config set-project',
        );
    }
    logSelectedProject(selection, config, 'Updating chart slugs in');

    const contentType = ContentAsCodeType.CHART;
    const preview = await requestSlugUpdate(
        selection.projectUuid,
        contentType,
        options.from,
        options.to,
        true,
    );

    const localPreview = await planLocalChartSlugUpdates(options.path, preview);
    preview.forEach(({ oldSlug, newSlug }) =>
        console.info(`${oldSlug} -> ${newSlug}`),
    );
    console.info(
        `\n${localPreview.referencesUpdated} local slug value(s), ${localPreview.fileMoves.length} file rename(s)`,
    );

    if (options.dryRun) {
        console.info(
            styles.warning(
                'Dry run only: Lightdash and local files were not changed.',
            ),
        );
        return;
    }

    if (!options.assumeYes) {
        const { confirmed } = await inquirer.prompt<{ confirmed: boolean }>([
            {
                type: 'confirm',
                name: 'confirmed',
                message:
                    'Rename this chart slug in Lightdash and update local content-as-code files?',
                default: false,
            },
        ]);
        if (!confirmed) {
            console.info('Aborting slug update.');
            return;
        }
    }

    const applied = await requestSlugUpdate(
        selection.projectUuid,
        contentType,
        options.from,
        options.to,
        false,
    );
    const localPlan = await planLocalChartSlugUpdates(options.path, applied);
    await applyLocalChartSlugUpdates(localPlan);
    console.info(
        styles.success(
            `Updated ${applied.length} chart slug(s) and ${localPlan.referencesUpdated} local slug value(s).`,
        ),
    );
};
