import {
    DashboardTileTypes,
    type CreateDashboard,
    type DashboardDAO,
    type SessionUser,
} from '@lightdash/common';
import { pack as tarPack } from 'tar-stream';
import { type AppModel } from '../../../models/AppModel';
import { type CommentModel } from '../../../models/CommentModel/CommentModel';
import { type DashboardModel } from '../../../models/DashboardModel/DashboardModel';
import { type PinnedListModel } from '../../../models/PinnedListModel';
import { type SavedChartModel } from '../../../models/SavedChartModel';
import { type SpaceModel } from '../../../models/SpaceModel';
import { type TagsModel } from '../../../models/TagsModel';
import { type AiAgentModel } from '../../models/AiAgentModel';
import { type AiDeepResearchRunModel } from '../../models/AiDeepResearchRunModel';
import {
    type PlaygroundContent,
    type PlaygroundDashboardChartTile,
} from './playgroundContentTypes';

type SeedPlaygroundContentArguments = {
    projectUuid: string;
    user: SessionUser;
    content: PlaygroundContent;
    spaceModel: {
        createSpace: (
            ...args: Parameters<SpaceModel['createSpace']>
        ) => Promise<{ uuid: string }>;
    };
    savedChartModel: {
        create: (
            ...args: Parameters<SavedChartModel['create']>
        ) => Promise<{ uuid: string }>;
    };
    dashboardModel: {
        create: (
            ...args: Parameters<DashboardModel['create']>
        ) => Promise<Pick<DashboardDAO, 'uuid' | 'tiles'>>;
    };
    /** Needed only when the bundle pins something. */
    pinnedListModel?: Pick<PinnedListModel, 'addItem'>;
    /** Needed only when the bundle carries comments. */
    commentModel?: {
        createComment: (
            ...args: Parameters<CommentModel['createComment']>
        ) => Promise<unknown>;
    };
    /**
     * Needed only when the bundle names categories; the catalog index that
     * follows the seed assigns them to metrics by YAML reference.
     */
    tagsModel?: Pick<TagsModel, 'replaceYamlTags' | 'create'>;
    /**
     * Needed only when the bundle carries data apps: the app rows, and a
     * store for the version's files (the runtime serves them from there).
     */
    appModel?: Pick<AppModel, 'createWithVersion'>;
    appFileStore?: PlaygroundAppFileStore;
    /** Needed only when the bundle carries an agent (and its research). */
    aiAgentModel?: Pick<
        AiAgentModel,
        'createAgent' | 'createWebAppThreadWithPrompt' | 'updateThreadTitle'
    >;
    /** Needed only when the bundle carries a finished deep research run. */
    aiDeepResearchRunModel?: Pick<
        AiDeepResearchRunModel,
        'createSeededCompletedRun'
    >;
};

/** Where a prebuilt app's files go, keyed like the app runtime reads them. */
export type PlaygroundAppFileStore = {
    put: (
        key: string,
        body: string | Buffer,
        contentType: string,
    ) => Promise<void>;
};

const CONTENT_TYPES: Record<string, string> = {
    html: 'text/html; charset=utf-8',
    js: 'text/javascript; charset=utf-8',
    css: 'text/css; charset=utf-8',
    json: 'application/json',
    svg: 'image/svg+xml',
    png: 'image/png',
};

const escapeHtml = (text: string): string =>
    text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

/** The only files an app version serves: its page and its assets. */
const isServableAppFile = (filePath: string): boolean =>
    filePath === 'index.html' || /^assets\/[A-Za-z0-9._-]+$/.test(filePath);

const contentTypeFor = (filePath: string): string =>
    CONTENT_TYPES[filePath.split('.').pop() ?? ''] ??
    'application/octet-stream';

/** The version's source files packed the way the CLI download expects. */
const packSource = (source: Record<string, string>): Promise<Buffer> =>
    new Promise((resolve, reject) => {
        const archive = tarPack();
        const chunks: Buffer[] = [];
        archive.on('data', (chunk: Buffer) => chunks.push(chunk));
        archive.on('end', () => resolve(Buffer.concat(chunks)));
        archive.on('error', reject);
        Object.entries(source).forEach(([name, body]) => {
            archive.entry({ name }, body);
        });
        archive.finalize();
    });

/** The runtime's key layout for a version's files (see appCode.ts). */
export const playgroundAppVersionPrefix = (appUuid: string, version: number) =>
    `apps/${appUuid}/versions/${version}/`;

const isChartTile = (
    tile: PlaygroundContent['dashboard']['tiles'][number],
): tile is PlaygroundDashboardChartTile =>
    tile.type === DashboardTileTypes.SAVED_CHART;

export const seedPlaygroundContent = async ({
    projectUuid,
    user,
    content,
    spaceModel,
    savedChartModel,
    dashboardModel,
    pinnedListModel,
    commentModel,
    tagsModel,
    appModel,
    appFileStore,
    aiAgentModel,
    aiDeepResearchRunModel,
}: SeedPlaygroundContentArguments): Promise<void> => {
    const space = await spaceModel.createSpace(
        {
            name: content.space.name,
            inheritParentPermissions: false,
            parentSpaceUuid: null,
        },
        {
            projectUuid,
            userId: user.userId,
            path: content.space.path,
        },
    );

    const chartUuids = new Map(
        await Promise.all(
            content.charts.map(async ({ key, slug, ...chart }) => {
                const savedChart = await savedChartModel.create(
                    projectUuid,
                    user.userUuid,
                    {
                        ...chart,
                        spaceUuid: space.uuid,
                        slug,
                        forceSlug: true,
                        updatedByUser: {
                            userUuid: user.userUuid,
                            firstName: user.firstName,
                            lastName: user.lastName,
                        },
                    },
                );
                return [key, savedChart.uuid] as const;
            }),
        ),
    );

    const { slug, tiles: bundledTiles, ...dashboard } = content.dashboard;
    const tiles: CreateDashboard['tiles'] = bundledTiles.map((tile) => {
        if (!isChartTile(tile)) return tile;

        const { chartKey, ...properties } = tile.properties;
        const savedChartUuid = chartUuids.get(chartKey);
        if (!savedChartUuid) {
            throw new Error(
                `Playground dashboard references an unavailable chart: ${chartKey}`,
            );
        }
        return {
            ...tile,
            properties: {
                ...properties,
                savedChartUuid,
            },
        };
    });

    const created = await dashboardModel.create(
        space.uuid,
        {
            ...dashboard,
            tiles,
            slug,
            forceSlug: true,
        },
        user,
        projectUuid,
    );

    if (content.pinned && pinnedListModel) {
        const pins = [
            ...(content.pinned.charts ?? []).map((chartKey) => {
                const savedChartUuid = chartUuids.get(chartKey);
                if (!savedChartUuid) {
                    throw new Error(
                        `Playground pins an unavailable chart: ${chartKey}`,
                    );
                }
                return { projectUuid, savedChartUuid };
            }),
            ...(content.pinned.dashboards ?? []).map((dashboardSlug) => {
                if (dashboardSlug !== slug) {
                    throw new Error(
                        `Playground pins an unavailable dashboard: ${dashboardSlug}`,
                    );
                }
                return { projectUuid, dashboardUuid: created.uuid };
            }),
        ];
        // One at a time: the pinned list is created on the first pin.
        await pins.reduce(
            (previous, pin) =>
                previous.then(() => pinnedListModel.addItem(pin)),
            Promise.resolve(),
        );
    }

    if (content.comments && commentModel) {
        await Promise.all(
            content.comments.map((comment) => {
                const savedChartUuid = chartUuids.get(comment.chartKey);
                const tile = created.tiles.find(
                    (t) =>
                        t.type === DashboardTileTypes.SAVED_CHART &&
                        t.properties.savedChartUuid === savedChartUuid,
                );
                if (!tile) {
                    throw new Error(
                        `Playground comments on a chart the dashboard does not show: ${comment.chartKey}`,
                    );
                }
                return commentModel.createComment(
                    created.uuid,
                    tile.uuid,
                    comment.text,
                    `<p>${escapeHtml(comment.text)}</p>`,
                    null,
                    user,
                    [],
                );
            }),
        );
    }

    if (content.categories && tagsModel) {
        const fromYaml = content.categories.filter(
            (category) => category.yamlReference !== undefined,
        );
        await tagsModel.replaceYamlTags(
            projectUuid,
            fromYaml.map((category) => ({
                project_uuid: projectUuid,
                name: category.name,
                color: category.color,
                created_by_user_uuid: user.userUuid,
                yaml_reference: category.yamlReference ?? null,
            })),
        );
        // Categories made in the app are the ones a learner can assign.
        await Promise.all(
            content.categories
                .filter((category) => category.yamlReference === undefined)
                .map((category) =>
                    tagsModel.create({
                        project_uuid: projectUuid,
                        name: category.name,
                        color: category.color,
                        created_by_user_uuid: user.userUuid,
                        yaml_reference: null,
                    }),
                ),
        );
    }
    if (content.dataApps && appModel && appFileStore) {
        // One at a time: each app's files go under its own uuid.
        await content.dataApps.reduce<Promise<void>>(
            async (previous, definition) => {
                await previous;
                const { app, version } = await appModel.createWithVersion(
                    {
                        project_uuid: projectUuid,
                        created_by_user_uuid: user.userUuid,
                        name: definition.name,
                        description: definition.description,
                        slug: definition.slug,
                        space_uuid: space.uuid,
                    },
                    { version: 1, prompt: definition.prompt },
                    'ready',
                    {
                        images: [],
                        charts: [],
                        clarifications: [],
                        dashboardName: null,
                    },
                    undefined,
                    undefined,
                    { forceSlug: true },
                );
                const prefix = playgroundAppVersionPrefix(
                    app.app_id,
                    version.version,
                );
                const badFile = Object.keys(definition.files).find(
                    (filePath) => !isServableAppFile(filePath),
                );
                if (badFile) {
                    throw new Error(
                        `Playground app "${definition.slug}" has a file the runtime would not serve: ${badFile}`,
                    );
                }
                await Promise.all(
                    Object.entries(definition.files).map(([filePath, body]) =>
                        appFileStore.put(
                            `${prefix}${filePath}`,
                            body,
                            contentTypeFor(filePath),
                        ),
                    ),
                );
                await appFileStore.put(
                    `${prefix}source.tar`,
                    await packSource(definition.source),
                    'application/x-tar',
                );
            },
            Promise.resolve(),
        );
    }

    if (content.agent && aiAgentModel) {
        const agent = await aiAgentModel.createAgent({
            organizationUuid: user.organizationUuid!,
            projectUuid,
            name: content.agent.name,
            slug: content.agent.slug,
            description: content.agent.description,
            instruction: content.agent.instruction,
            tags: null,
            integrations: [],
            groupAccess: [],
            userAccess: [],
            spaceAccess: [],
            enableDataAccess: true,
            enableSelfImprovement: false,
            enableContentTools: true,
            enableUserContext: false,
            enableSqlMode: true,
            adminOnly: false,
            modelConfig: null,
            version: 2,
            mcpServerUuids: [],
            threadRetentionHours: null,
        });
        if (content.deepResearch && aiDeepResearchRunModel) {
            // A thread the seed user asked in, with the report already there.
            const { threadUuid, promptUuid } =
                await aiAgentModel.createWebAppThreadWithPrompt({
                    thread: {
                        organizationUuid: user.organizationUuid!,
                        projectUuid,
                        userUuid: user.userUuid,
                        createdFrom: 'web_app',
                        agentUuid: agent.uuid,
                    },
                    prompt: {
                        createdByUserUuid: user.userUuid,
                        prompt: content.deepResearch.prompt,
                    },
                });
            await aiAgentModel.updateThreadTitle({
                threadUuid,
                title: content.deepResearch.threadTitle,
            });
            await aiDeepResearchRunModel.createSeededCompletedRun({
                organizationUuid: user.organizationUuid!,
                projectUuid,
                createdByUserUuid: user.userUuid,
                agentUuid: agent.uuid,
                agentName: agent.name,
                aiThreadUuid: threadUuid,
                promptUuid,
                prompt: content.deepResearch.prompt,
                resultMarkdown: content.deepResearch.resultMarkdown,
                durationMs: content.deepResearch.durationMs,
                warehouseQueryCount: content.deepResearch.warehouseQueryCount,
            });
        }
    }
};
