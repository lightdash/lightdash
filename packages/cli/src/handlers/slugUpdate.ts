import {
    AuthorizationError,
    ContentType,
    generateSlug,
    LightdashError,
    ParameterError,
    type ContentSlugRenameRequest,
} from '@lightdash/common';
import { promises as fs } from 'fs';
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
    dryRun: boolean;
    from: string;
    to: string;
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

type FileSnapshot = Map<string, Buffer | undefined>;

export type LocalSlugUpdateFileChange = {
    source: string;
    target?: string;
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
            .map((entry) => path.join(entry.parentPath, entry.name));
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

export const planLocalChartSlugUpdate = async (
    customPath: string | undefined,
    from: string,
    to: string,
): Promise<LocalSlugUpdatePlan> => {
    const root = getDownloadFolder(customPath);
    const fileUpdates: LocalSlugUpdatePlan['fileUpdates'] = [];
    const fileMoves: LocalSlugUpdatePlan['fileMoves'] = [];
    let referencesUpdated = 0;

    if (!from || from.length > 255) {
        throw new ParameterError(
            'The source slug must contain between 1 and 255 characters',
        );
    }
    if (!to || to.length > 255 || generateSlug(to) !== to) {
        throw new ParameterError(
            'The target slug must contain between 1 and 255 lowercase letters, numbers, or hyphen-separated words',
        );
    }

    if (from === to) {
        return {
            fileUpdates,
            fileMoves,
            metadata: undefined,
            referencesUpdated,
        };
    }

    for (const filePath of await getYamlFiles(root)) {
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

        const isChart =
            parsed.contentType === ContentType.CHART ||
            parsed.metricQuery !== undefined;
        if (isChart && parsed.slug === from) {
            document.set('slug', to);
            referencesUpdated += 1;
            changed = true;

            const extension = path.extname(filePath);
            if (path.basename(filePath) === `${from}${extension}`) {
                fileMoves.push({
                    source: filePath,
                    target: path.join(
                        path.dirname(filePath),
                        `${to}${extension}`,
                    ),
                });

                for (const languageMapExtension of ['.yml', '.yaml']) {
                    const sourceLanguageMap = path.join(
                        path.dirname(filePath),
                        `${from}.language.map${languageMapExtension}`,
                    );
                    try {
                        // eslint-disable-next-line no-await-in-loop
                        await fs.access(sourceLanguageMap);

                        // eslint-disable-next-line no-await-in-loop
                        const languageMapSource = await fs.readFile(
                            sourceLanguageMap,
                            'utf8',
                        );
                        const languageMapDocument =
                            parseDocument(languageMapSource);
                        if (languageMapDocument.errors.length > 0) {
                            throw new ParameterError(
                                `Could not parse "${sourceLanguageMap}": ${languageMapDocument.errors
                                    .map(({ message }) => message)
                                    .join('; ')}`,
                            );
                        }
                        const languageMapEntry = languageMapDocument.getIn([
                            'chart',
                            from,
                        ]);
                        if (languageMapEntry !== undefined) {
                            if (
                                languageMapDocument.getIn(['chart', to]) !==
                                undefined
                            ) {
                                throw new ParameterError(
                                    `Cannot update language map because chart slug "${to}" already exists in "${sourceLanguageMap}"`,
                                );
                            }
                            languageMapDocument.setIn(
                                ['chart', to],
                                languageMapEntry,
                            );
                            languageMapDocument.deleteIn(['chart', from]);
                            fileUpdates.push({
                                filePath: sourceLanguageMap,
                                content: languageMapDocument.toString(),
                            });
                            referencesUpdated += 1;
                        }

                        fileMoves.push({
                            source: sourceLanguageMap,
                            target: path.join(
                                path.dirname(filePath),
                                `${to}.language.map${languageMapExtension}`,
                            ),
                        });
                    } catch (error) {
                        if (
                            (error as NodeJS.ErrnoException).code !== 'ENOENT'
                        ) {
                            throw error;
                        }
                    }
                }
            }
        }

        if (Array.isArray(parsed.tiles)) {
            for (const [index, tile] of parsed.tiles.entries()) {
                if (
                    tile.type === 'saved_chart' &&
                    tile.properties?.chartSlug === from
                ) {
                    document.setIn(
                        ['tiles', index, 'properties', 'chartSlug'],
                        to,
                    );
                    referencesUpdated += 1;
                    changed = true;
                }
            }
        }

        if (
            parsed.resource?.type === ContentType.CHART &&
            parsed.resource.slug === from
        ) {
            document.setIn(['resource', 'slug'], to);
            referencesUpdated += 1;
            changed = true;
        }

        if (changed) {
            fileUpdates.push({ filePath, content: document.toString() });
        }
    }

    const metadata = await readMetadataFile(root);
    let updatedMetadata: LocalSlugUpdatePlan['metadata'];
    if (from in metadata.charts) {
        if (to !== from && to in metadata.charts) {
            throw new ParameterError(
                `Cannot update local metadata because chart slug "${to}" already exists`,
            );
        }
        const charts = { ...metadata.charts };
        charts[to] = charts[from];
        delete charts[from];
        updatedMetadata = { root, charts };
    }

    await assertMovesAreSafe(fileMoves);
    return {
        fileUpdates,
        fileMoves,
        metadata: updatedMetadata,
        referencesUpdated,
    };
};

export const getLocalSlugUpdateFileChanges = (
    plan: LocalSlugUpdatePlan,
    customPath: string | undefined,
): LocalSlugUpdateFileChange[] => {
    const root = getDownloadFolder(customPath);
    const movedSources = new Set(plan.fileMoves.map(({ source }) => source));
    const relative = (filePath: string) => path.relative(root, filePath);

    return [
        ...plan.fileMoves.map(({ source, target }) => ({
            source: relative(source),
            target: relative(target),
        })),
        ...plan.fileUpdates
            .filter(({ filePath }) => !movedSources.has(filePath))
            .map(({ filePath }) => ({ source: relative(filePath) })),
        ...(plan.metadata
            ? [
                  {
                      source: relative(
                          path.join(plan.metadata.root, METADATA_FILENAME),
                      ),
                  },
              ]
            : []),
    ].sort((first, second) => first.source.localeCompare(second.source));
};

const logLocalSlugUpdateFileChanges = (
    plan: LocalSlugUpdatePlan,
    customPath: string | undefined,
    dryRun: boolean,
) => {
    const changes = getLocalSlugUpdateFileChanges(plan, customPath);
    if (changes.length === 0) {
        console.info(styles.secondary('No local files need updating.'));
        return;
    }

    console.info(
        styles.secondary(
            dryRun ? 'Local files that would change:' : 'Updated local files:',
        ),
    );
    for (const change of changes) {
        console.info(
            styles.secondary(
                `  ${change.source}${change.target ? ` -> ${change.target}` : ''}`,
            ),
        );
    }
};

const captureFiles = async (
    filePaths: Iterable<string>,
): Promise<FileSnapshot> => {
    const snapshots: FileSnapshot = new Map();
    for (const filePath of filePaths) {
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
    return snapshots;
};

const restoreFiles = async (snapshots: FileSnapshot): Promise<void> => {
    await Promise.all(
        [...snapshots].map(([filePath, content]) =>
            content === undefined
                ? fs.rm(filePath, { force: true })
                : fs.writeFile(filePath, content),
        ),
    );
};

export const applyLocalChartSlugUpdate = async (
    plan: LocalSlugUpdatePlan,
): Promise<() => Promise<void>> => {
    const metadataPath = plan.metadata
        ? path.join(plan.metadata.root, METADATA_FILENAME)
        : undefined;
    const affectedPaths = new Set([
        ...plan.fileUpdates.map(({ filePath }) => filePath),
        ...plan.fileMoves.flatMap(({ source, target }) => [source, target]),
        ...(metadataPath ? [metadataPath] : []),
    ]);
    const snapshots = await captureFiles(affectedPaths);
    const stagedMoves: string[] = [];

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
            stagedMoves.push(temporary);
        }
        for (const [index, move] of plan.fileMoves.entries()) {
            // eslint-disable-next-line no-await-in-loop
            await fs.rename(stagedMoves[index], move.target);
        }

        if (plan.metadata && metadataPath) {
            const existing = await readMetadataFile(plan.metadata.root);
            await fs.writeFile(
                metadataPath,
                JSON.stringify(
                    { ...existing, charts: plan.metadata.charts },
                    null,
                    2,
                ),
            );
        }
    } catch (error) {
        await Promise.all(
            stagedMoves.map((temporary) => fs.rm(temporary, { force: true })),
        );
        await restoreFiles(snapshots);
        throw error;
    }

    return () => restoreFiles(snapshots);
};

export const requestSlugUpdate = async (
    projectUuid: string,
    request: ContentSlugRenameRequest,
): Promise<void> => {
    try {
        await lightdashApi<undefined>({
            method: 'POST',
            url: `/api/v1/projects/${projectUuid}/slugs/rename`,
            body: JSON.stringify(request),
        });
    } catch (error) {
        if (
            error instanceof LightdashError &&
            error.statusCode === 404 &&
            error.message === 'API endpoint not found'
        ) {
            throw new ParameterError(
                'This Lightdash server does not support slug-update yet. Upgrade the server before using this command.',
            );
        }
        throw error;
    }
};

export const executeChartSlugUpdate = async (
    projectUuid: string,
    customPath: string | undefined,
    from: string,
    to: string,
): Promise<LocalSlugUpdatePlan> => {
    const localPlan = await planLocalChartSlugUpdate(customPath, from, to);
    await requestSlugUpdate(projectUuid, {
        resourceType: ContentType.CHART,
        from,
        to,
    });

    try {
        await applyLocalChartSlugUpdate(localPlan);
    } catch (error) {
        throw new Error(
            'The chart slug was renamed in Lightdash, but the local files could not be updated. Fix the local file error and rerun the same command; the rename is idempotent.',
            { cause: error },
        );
    }

    return localPlan;
};

export const slugUpdateHandler = async (
    options: SlugUpdateOptions,
): Promise<void> => {
    GlobalState.setVerbose(options.verbose);
    await checkLightdashVersion();

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
    logSelectedProject(
        selection,
        config,
        options.dryRun
            ? 'Previewing chart slug update in'
            : 'Updating chart slug in',
    );

    if (options.dryRun) {
        const localPlan = await planLocalChartSlugUpdate(
            options.path,
            options.from,
            options.to,
        );
        console.info(
            styles.success(
                `Would update chart slug "${options.from}" -> "${options.to}".`,
            ),
        );
        logLocalSlugUpdateFileChanges(localPlan, options.path, true);
        console.info(styles.secondary('No changes were made.'));
        return;
    }

    const localPlan = await executeChartSlugUpdate(
        selection.projectUuid,
        options.path,
        options.from,
        options.to,
    );

    console.info(
        styles.success(
            `Updated chart slug "${options.from}" -> "${options.to}".`,
        ),
    );
    logLocalSlugUpdateFileChanges(localPlan, options.path, false);
};
