import { subject } from '@casl/ability';
import {
    assertUnreachable,
    CommercialFeatureFlags,
    defaultHomepageConfig,
    ForbiddenError,
    getErrorMessage,
    HOMEPAGE_MAX_BLOCKS_PER_ROW,
    NotFoundError,
    ParameterError,
    type AnnouncementsPage,
    type CreateAnnouncementRequest,
    type CreateProjectHomepageRequest,
    type HomepageAssignment,
    type HomepageAudience,
    type HomepageConfig,
    type HomepageLinkMetadata,
    type HomepageRecentlyViewedItem,
    type HomepageViewAsResult,
    type HomepageViewAsTarget,
    type ProjectAnnouncement,
    type ProjectHomepage,
    type ProjectMemberRole,
    type ResolvedHomepage,
    type SessionUser,
    type UpdateAnnouncementRequest,
    type UpdateProjectHomepageDraftRequest,
} from '@lightdash/common';
import { type KnownBlock } from '@slack/web-api';
import { createCanvas, loadImage } from 'canvas';
import { randomUUID } from 'crypto';
import { type Readable } from 'stream';
import { type FileStorageClient } from '../../clients/FileStorage/FileStorageClient';
import { type SlackClient } from '../../clients/Slack/SlackClient';
import { type LightdashConfig } from '../../config/parseConfig';
import { type GroupsModel } from '../../models/GroupsModel';
import { type ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { BaseService } from '../../services/BaseService';
import { type FeatureFlagService } from '../../services/FeatureFlag/FeatureFlagService';
import { type PersistentDownloadFileService } from '../../services/PersistentDownloadFileService/PersistentDownloadFileService';
import { secureFetch } from '../../utils/secureFetch/secureFetch';
import { type ProjectHomepageModel } from '../models/ProjectHomepageModel';
import {
    classifyResourceUrl,
    parseOpenGraph,
    parseYoutubeOembed,
} from './homepageLinkMetadata';

const ANNOUNCEMENT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const ANNOUNCEMENT_IMAGE_MAX_DIMENSION_PX = 2000;
const ANNOUNCEMENT_IMAGE_PERSISTENT_URL_EXPIRY_SECONDS =
    10 * 365 * 24 * 60 * 60;
const ALLOWED_ANNOUNCEMENT_IMAGE_MIME_TYPES = new Set([
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
]);

const LINK_METADATA_TIMEOUT_MS = 5_000;
const LINK_METADATA_MAX_BYTES = 256 * 1024;
// Some providers (e.g. claude.ai) only server-render per-page OpenGraph tags for
// recognised link-unfurl crawlers, so identify as one while staying honest about
// who we are.
const LINK_PREVIEW_USER_AGENT =
    'Lightdash-LinkPreview/1.0 (+https://www.lightdash.com; like Slackbot-LinkExpanding)';

export type ProjectHomepageServiceArguments = {
    projectHomepageModel: Pick<
        ProjectHomepageModel,
        | 'getDefault'
        | 'getByUuid'
        | 'getPublishedDefault'
        | 'getRecentlyViewed'
        | 'getAssignments'
        | 'getPersonalOverride'
        | 'setPersonalOverride'
        | 'deletePersonalOverride'
        | 'updateGroupPriorities'
        | 'resolvePublished'
        | 'list'
        | 'create'
        | 'updateDraft'
        | 'discardDraft'
        | 'publish'
        | 'delete'
        | 'listAnnouncements'
        | 'getAnnouncement'
        | 'createAnnouncement'
        | 'updateAnnouncement'
        | 'deleteAnnouncement'
    >;
    featureFlagService: Pick<FeatureFlagService, 'get'>;
    groupsModel: Pick<GroupsModel, 'findUserGroups'>;
    projectModel: Pick<ProjectModel, 'getProjectMemberAccess'>;
    fileStorageClient: FileStorageClient;
    persistentDownloadFileService: PersistentDownloadFileService;
    slackClient: Pick<SlackClient, 'postMessage'>;
    lightdashConfig: Pick<LightdashConfig, 'siteUrl'>;
};

export class ProjectHomepageService extends BaseService {
    private readonly projectHomepageModel: ProjectHomepageServiceArguments['projectHomepageModel'];

    private readonly featureFlagService: ProjectHomepageServiceArguments['featureFlagService'];

    private readonly groupsModel: ProjectHomepageServiceArguments['groupsModel'];

    private readonly projectModel: ProjectHomepageServiceArguments['projectModel'];

    private readonly fileStorageClient: ProjectHomepageServiceArguments['fileStorageClient'];

    private readonly persistentDownloadFileService: ProjectHomepageServiceArguments['persistentDownloadFileService'];

    private readonly slackClient: ProjectHomepageServiceArguments['slackClient'];

    private readonly lightdashConfig: ProjectHomepageServiceArguments['lightdashConfig'];

    constructor(args: ProjectHomepageServiceArguments) {
        super();
        this.projectHomepageModel = args.projectHomepageModel;
        this.featureFlagService = args.featureFlagService;
        this.groupsModel = args.groupsModel;
        this.projectModel = args.projectModel;
        this.fileStorageClient = args.fileStorageClient;
        this.persistentDownloadFileService = args.persistentDownloadFileService;
        this.slackClient = args.slackClient;
        this.lightdashConfig = args.lightdashConfig;
    }

    private async assertFlagEnabled(user: SessionUser): Promise<void> {
        const flag = await this.featureFlagService.get({
            user,
            featureFlagId: CommercialFeatureFlags.HomepageBuilder,
        });
        if (!flag.enabled) {
            throw new ForbiddenError('Homepage builder is not enabled');
        }
    }

    private assertCanView(user: SessionUser, projectUuid: string): void {
        if (!user.organizationUuid) {
            throw new ForbiddenError();
        }
        const ability = this.createAuditedAbility(user);
        if (
            ability.cannot(
                'view',
                subject('Project', {
                    organizationUuid: user.organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
    }

    private assertCanManage(user: SessionUser, projectUuid: string): void {
        if (!user.organizationUuid) {
            throw new ForbiddenError();
        }
        const ability = this.createAuditedAbility(user);
        if (
            ability.cannot(
                'manage',
                subject('ProjectHomepage', {
                    organizationUuid: user.organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
                'Insufficient permissions to manage the project homepage',
            );
        }
    }

    private static validateConfig(config: HomepageConfig): void {
        if (config.version !== 1) {
            throw new ParameterError('Unsupported homepage config version');
        }
        const oversizedRow = config.rows.find(
            (row) => row.blocks.length > HOMEPAGE_MAX_BLOCKS_PER_ROW,
        );
        if (oversizedRow) {
            throw new ParameterError(
                `Rows support at most ${HOMEPAGE_MAX_BLOCKS_PER_ROW} blocks`,
            );
        }
    }

    private async getOwnedHomepage(
        projectUuid: string,
        homepageUuid: string,
    ): Promise<ProjectHomepage> {
        const homepage =
            await this.projectHomepageModel.getByUuid(homepageUuid);
        if (!homepage || homepage.projectUuid !== projectUuid) {
            throw new NotFoundError('Homepage not found');
        }
        return homepage;
    }

    // Resolution: personal → group priority → role → project default
    private async resolveForViewer(
        projectUuid: string,
        viewer: {
            groupUuids: string[];
            role: ProjectMemberRole | undefined;
            personalOverride: string | undefined;
        },
    ): Promise<HomepageViewAsResult> {
        const published = await this.projectHomepageModel.resolvePublished(
            projectUuid,
            { groupUuids: viewer.groupUuids, role: viewer.role },
        );
        // Personal choice wins unless the audience homepage disallows it
        if (
            viewer.personalOverride &&
            (published?.homepage.allowPersonal ?? true)
        ) {
            return {
                resolved: {
                    type: 'dashboard',
                    dashboardUuid: viewer.personalOverride,
                },
                reason: {
                    type: 'personal',
                    dashboardUuid: viewer.personalOverride,
                },
            };
        }
        if (published) {
            return {
                resolved: { type: 'homepage', homepage: published.homepage },
                reason: published.source,
            };
        }
        return { resolved: null, reason: null };
    }

    private async getViewerContext(
        organizationUuid: string | undefined,
        projectUuid: string,
        userUuid: string,
    ): Promise<{
        groupUuids: string[];
        role: ProjectMemberRole | undefined;
        personalOverride: string | undefined;
    }> {
        const [override, groups, membership] = await Promise.all([
            this.projectHomepageModel.getPersonalOverride(
                userUuid,
                projectUuid,
            ),
            organizationUuid
                ? this.groupsModel.findUserGroups({
                      userUuid,
                      organizationUuid,
                  })
                : Promise.resolve([]),
            this.projectModel.getProjectMemberAccess(projectUuid, userUuid),
        ]);
        return {
            groupUuids: groups.map((group) => group.uuid),
            role: membership?.role,
            personalOverride: override,
        };
    }

    async getResolvedHomepage(
        user: SessionUser,
        projectUuid: string,
    ): Promise<ResolvedHomepage | null> {
        await this.assertFlagEnabled(user);
        this.assertCanView(user, projectUuid);
        const viewer = await this.getViewerContext(
            user.organizationUuid,
            projectUuid,
            user.userUuid,
        );
        const { resolved } = await this.resolveForViewer(projectUuid, viewer);
        return resolved;
    }

    async viewAsHomepage(
        user: SessionUser,
        projectUuid: string,
        target: HomepageViewAsTarget,
    ): Promise<HomepageViewAsResult> {
        await this.assertFlagEnabled(user);
        this.assertCanManage(user, projectUuid);
        switch (target.type) {
            case 'user': {
                const viewer = await this.getViewerContext(
                    user.organizationUuid,
                    projectUuid,
                    target.userUuid,
                );
                return this.resolveForViewer(projectUuid, viewer);
            }
            case 'group':
                return this.resolveForViewer(projectUuid, {
                    groupUuids: [target.groupUuid],
                    role: undefined,
                    personalOverride: undefined,
                });
            case 'role':
                return this.resolveForViewer(projectUuid, {
                    groupUuids: [],
                    role: target.role,
                    personalOverride: undefined,
                });
            default:
                return assertUnreachable(target, 'Unknown view-as target type');
        }
    }

    async setPersonalHomepage(
        user: SessionUser,
        projectUuid: string,
        dashboardUuid: string,
    ): Promise<void> {
        await this.assertFlagEnabled(user);
        this.assertCanView(user, projectUuid);
        await this.projectHomepageModel.setPersonalOverride(
            user.userUuid,
            projectUuid,
            dashboardUuid,
        );
    }

    async clearPersonalHomepage(
        user: SessionUser,
        projectUuid: string,
    ): Promise<void> {
        await this.assertFlagEnabled(user);
        this.assertCanView(user, projectUuid);
        await this.projectHomepageModel.deletePersonalOverride(
            user.userUuid,
            projectUuid,
        );
    }

    async getPersonalHomepage(
        user: SessionUser,
        projectUuid: string,
    ): Promise<string | null> {
        await this.assertFlagEnabled(user);
        this.assertCanView(user, projectUuid);
        const override = await this.projectHomepageModel.getPersonalOverride(
            user.userUuid,
            projectUuid,
        );
        return override ?? null;
    }

    async getAssignments(
        user: SessionUser,
        projectUuid: string,
    ): Promise<HomepageAssignment[]> {
        await this.assertFlagEnabled(user);
        this.assertCanManage(user, projectUuid);
        return this.projectHomepageModel.getAssignments(projectUuid);
    }

    async updateGroupPriorities(
        user: SessionUser,
        projectUuid: string,
        groupUuids: string[],
    ): Promise<void> {
        await this.assertFlagEnabled(user);
        this.assertCanManage(user, projectUuid);
        await this.projectHomepageModel.updateGroupPriorities(
            projectUuid,
            groupUuids,
        );
    }

    async getRecentlyViewed(
        user: SessionUser,
        projectUuid: string,
    ): Promise<HomepageRecentlyViewedItem[]> {
        await this.assertFlagEnabled(user);
        this.assertCanView(user, projectUuid);
        return this.projectHomepageModel.getRecentlyViewed(
            projectUuid,
            user.userUuid,
        );
    }

    async getHomepageForBuilder(
        user: SessionUser,
        projectUuid: string,
        homepageUuid?: string,
    ): Promise<ProjectHomepage | null> {
        await this.assertFlagEnabled(user);
        this.assertCanManage(user, projectUuid);
        if (homepageUuid) {
            return this.getOwnedHomepage(projectUuid, homepageUuid);
        }
        const homepage =
            await this.projectHomepageModel.getDefault(projectUuid);
        if (homepage) return homepage;
        const [first] = await this.projectHomepageModel.list(projectUuid);
        return first ?? null;
    }

    async listHomepages(
        user: SessionUser,
        projectUuid: string,
    ): Promise<ProjectHomepage[]> {
        await this.assertFlagEnabled(user);
        this.assertCanManage(user, projectUuid);
        return this.projectHomepageModel.list(projectUuid);
    }

    async createHomepage(
        user: SessionUser,
        projectUuid: string,
        data: CreateProjectHomepageRequest,
    ): Promise<ProjectHomepage> {
        await this.assertFlagEnabled(user);
        this.assertCanManage(user, projectUuid);
        const draftConfig = data.duplicateFrom
            ? (await this.getOwnedHomepage(projectUuid, data.duplicateFrom))
                  .draftConfig
            : defaultHomepageConfig();
        return this.projectHomepageModel.create({
            projectUuid,
            name: data.name,
            draftConfig,
            createdByUserUuid: user.userUuid,
        });
    }

    async deleteHomepage(
        user: SessionUser,
        projectUuid: string,
        homepageUuid: string,
    ): Promise<void> {
        await this.assertFlagEnabled(user);
        this.assertCanManage(user, projectUuid);
        await this.getOwnedHomepage(projectUuid, homepageUuid);
        await this.projectHomepageModel.delete(homepageUuid);
    }

    async updateDraft(
        user: SessionUser,
        projectUuid: string,
        homepageUuid: string,
        data: UpdateProjectHomepageDraftRequest,
    ): Promise<ProjectHomepage> {
        await this.assertFlagEnabled(user);
        this.assertCanManage(user, projectUuid);
        ProjectHomepageService.validateConfig(data.draftConfig);
        await this.getOwnedHomepage(projectUuid, homepageUuid);
        return this.projectHomepageModel.updateDraft(homepageUuid, {
            name: data.name,
            draftConfig: data.draftConfig,
            baseUpdatedAt: data.baseUpdatedAt,
        });
    }

    async discardDraft(
        user: SessionUser,
        projectUuid: string,
        homepageUuid: string,
    ): Promise<ProjectHomepage> {
        await this.assertFlagEnabled(user);
        this.assertCanManage(user, projectUuid);
        await this.getOwnedHomepage(projectUuid, homepageUuid);
        return this.projectHomepageModel.discardDraft(homepageUuid);
    }

    async publishHomepage(
        user: SessionUser,
        projectUuid: string,
        homepageUuid: string,
        audience: HomepageAudience,
        allowPersonal: boolean,
    ): Promise<ProjectHomepage> {
        await this.assertFlagEnabled(user);
        this.assertCanManage(user, projectUuid);
        await this.getOwnedHomepage(projectUuid, homepageUuid);
        return this.projectHomepageModel.publish(
            homepageUuid,
            audience,
            allowPersonal,
        );
    }

    /**
     * Unfurl a pasted resource URL for the homepage builder. Rejects any host
     * outside the allowlist (400); for allowed hosts, returns the detected kind
     * with title/description/imageUrl (nulls if the fetch or parse fails, so the
     * author can still add the item and type a title). The outbound fetch is
     * SSRF-hardened (https-only, private-IP blocking, redirect + size + time
     * caps) via the shared `secureFetch` util.
     */
    async fetchLinkMetadata(
        user: SessionUser,
        projectUuid: string,
        url: string,
    ): Promise<HomepageLinkMetadata> {
        await this.assertFlagEnabled(user);
        this.assertCanManage(user, projectUuid);

        const provider = classifyResourceUrl(url);
        try {
            if (provider.fetchKind === 'oembed') {
                const { bodyText } = await secureFetch(provider.fetchUrl, {
                    method: 'GET',
                    timeoutMs: LINK_METADATA_TIMEOUT_MS,
                    maxResponseBytes: LINK_METADATA_MAX_BYTES,
                    allowedContentTypes: ['application/json'],
                    headers: { 'User-Agent': LINK_PREVIEW_USER_AGENT },
                });
                let json: unknown = null;
                try {
                    json = JSON.parse(bodyText);
                } catch {
                    json = null;
                }
                return { kind: provider.kind, ...parseYoutubeOembed(json) };
            }
            const { bodyText } = await secureFetch(provider.fetchUrl, {
                method: 'GET',
                timeoutMs: LINK_METADATA_TIMEOUT_MS,
                maxResponseBytes: LINK_METADATA_MAX_BYTES,
                allowedContentTypes: ['text/html'],
                headers: { 'User-Agent': LINK_PREVIEW_USER_AGENT },
            });
            return { kind: provider.kind, ...parseOpenGraph(bodyText) };
        } catch {
            return {
                kind: provider.kind,
                title: null,
                description: null,
                imageUrl: null,
            };
        }
    }

    // --- Announcements -----------------------------------------------------

    private async getOwnedAnnouncement(
        projectUuid: string,
        announcementUuid: string,
    ): Promise<ProjectAnnouncement> {
        const announcement =
            await this.projectHomepageModel.getAnnouncement(announcementUuid);
        if (!announcement || announcement.projectUuid !== projectUuid) {
            throw new NotFoundError('Announcement not found');
        }
        return announcement;
    }

    private static validateAnnouncementTitle(title: string): void {
        if (title.trim().length === 0) {
            throw new ParameterError('Announcement title cannot be empty');
        }
    }

    async listAnnouncements(
        user: SessionUser,
        projectUuid: string,
        options: { page: number; pageSize: number },
    ): Promise<AnnouncementsPage> {
        await this.assertFlagEnabled(user);
        this.assertCanView(user, projectUuid);
        if (
            options.page < 1 ||
            options.pageSize < 1 ||
            options.pageSize > 100
        ) {
            throw new ParameterError('Invalid pagination');
        }
        return this.projectHomepageModel.listAnnouncements(
            projectUuid,
            options,
        );
    }

    // Convert the stored markdown body to Slack mrkdwn: chart/dashboard
    // mentions (markdown links) become real Slack links, keeping them clickable
    // in the notification. Relative mention URLs are made absolute.
    private bodyToSlackMrkdwn(body: string): string {
        const { siteUrl } = this.lightdashConfig;
        const text = body
            .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // drop inline images
            .replace(/\[([^\]]*)\]\(([^)]*)\)/g, (_match, label, url) => {
                const target = url as string;
                // Only linkify safe URLs (relative or http/https); anything
                // else (e.g. javascript:) is rendered as plain text.
                const isSafe =
                    target.startsWith('/') || /^https?:\/\//i.test(target);
                if (!isSafe) return label as string;
                const absolute = target.startsWith('/')
                    ? `${siteUrl}${target}`
                    : target;
                return `<${absolute}|${label}>`;
            })
            .replace(/\*\*([^*]+)\*\*/g, '*$1*') // markdown bold → slack bold
            .replace(/^\s*[-*]\s+/gm, '• ') // bullets
            .replace(/[#>`~]/g, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
        if (text.length <= 1500) return text;
        const cut = text.lastIndexOf('\n', 1500);
        return `${text.slice(0, cut > 0 ? cut : 1500)}…`;
    }

    private async notifyAnnouncementToSlack(
        organizationUuid: string,
        projectUuid: string,
        announcement: ProjectAnnouncement,
        channelId: string,
    ): Promise<void> {
        const link = `${this.lightdashConfig.siteUrl}/projects/${projectUuid}/home`;
        const excerpt = announcement.body
            ? this.bodyToSlackMrkdwn(announcement.body)
            : '';
        const blocks: KnownBlock[] = [
            {
                type: 'header',
                text: {
                    type: 'plain_text',
                    text: announcement.title.slice(0, 150),
                    emoji: true,
                },
            },
            ...(excerpt
                ? [
                      {
                          type: 'section' as const,
                          text: { type: 'mrkdwn' as const, text: excerpt },
                      },
                  ]
                : []),
            {
                type: 'context',
                elements: [
                    {
                        type: 'mrkdwn',
                        text: `<${link}|View on the homepage>`,
                    },
                ],
            },
        ];
        try {
            await this.slackClient.postMessage({
                organizationUuid,
                channel: channelId,
                text: `📢 New announcement: ${announcement.title}`,
                blocks,
            });
        } catch (error) {
            this.logger.error(
                `Failed to post announcement to Slack channel ${channelId}: ${getErrorMessage(
                    error,
                )}`,
            );
        }
    }

    async createAnnouncement(
        user: SessionUser,
        projectUuid: string,
        data: CreateAnnouncementRequest,
    ): Promise<ProjectAnnouncement> {
        await this.assertFlagEnabled(user);
        this.assertCanManage(user, projectUuid);
        ProjectHomepageService.validateAnnouncementTitle(data.title);
        const announcement = await this.projectHomepageModel.createAnnouncement(
            {
                projectUuid,
                title: data.title.trim(),
                body: data.body,
                category: data.category,
                createdByUserUuid: user.userUuid,
            },
        );
        if (data.slackChannelId && user.organizationUuid) {
            await this.notifyAnnouncementToSlack(
                user.organizationUuid,
                projectUuid,
                announcement,
                data.slackChannelId,
            );
        }
        return announcement;
    }

    async updateAnnouncement(
        user: SessionUser,
        projectUuid: string,
        announcementUuid: string,
        update: UpdateAnnouncementRequest,
    ): Promise<ProjectAnnouncement> {
        await this.assertFlagEnabled(user);
        this.assertCanManage(user, projectUuid);
        await this.getOwnedAnnouncement(projectUuid, announcementUuid);
        if (update.title !== undefined) {
            ProjectHomepageService.validateAnnouncementTitle(update.title);
        }
        return this.projectHomepageModel.updateAnnouncement(announcementUuid, {
            ...update,
            ...(update.title !== undefined && { title: update.title.trim() }),
        });
    }

    async deleteAnnouncement(
        user: SessionUser,
        projectUuid: string,
        announcementUuid: string,
    ): Promise<void> {
        await this.assertFlagEnabled(user);
        this.assertCanManage(user, projectUuid);
        await this.getOwnedAnnouncement(projectUuid, announcementUuid);
        await this.projectHomepageModel.deleteAnnouncement(announcementUuid);
    }

    private static async bufferAnnouncementImageUpload(
        body: Readable,
        contentLength: number,
    ): Promise<Buffer> {
        if (contentLength > ANNOUNCEMENT_IMAGE_MAX_BYTES) {
            throw new ParameterError(
                `Image too large: ${contentLength} bytes. Maximum: ${ANNOUNCEMENT_IMAGE_MAX_BYTES} bytes`,
            );
        }
        const chunks: Buffer[] = [];
        let totalBytes = 0;
        for await (const chunk of body) {
            const chunkBuffer = Buffer.isBuffer(chunk)
                ? chunk
                : Buffer.from(chunk);
            totalBytes += chunkBuffer.length;
            if (totalBytes > ANNOUNCEMENT_IMAGE_MAX_BYTES) {
                throw new ParameterError(
                    `Image too large: ${totalBytes} bytes. Maximum: ${ANNOUNCEMENT_IMAGE_MAX_BYTES} bytes`,
                );
            }
            chunks.push(chunkBuffer);
        }
        if (totalBytes === 0) {
            throw new ParameterError('Upload body is empty');
        }
        return Buffer.concat(chunks);
    }

    private static async normalizeAnnouncementImage(
        upload: Buffer,
    ): Promise<Buffer> {
        let image;
        try {
            image = await loadImage(upload);
        } catch (error) {
            throw new ParameterError(
                `Invalid image: ${getErrorMessage(error)}`,
            );
        }
        const scale = Math.min(
            1,
            ANNOUNCEMENT_IMAGE_MAX_DIMENSION_PX /
                Math.max(image.width, image.height),
        );
        const width = Math.round(image.width * scale);
        const height = Math.round(image.height * scale);
        const canvas = createCanvas(width, height);
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0, width, height);
        return canvas.toBuffer('image/png');
    }

    async uploadAnnouncementImage(
        user: SessionUser,
        projectUuid: string,
        mimeType: string,
        body: Readable,
        contentLength: number,
    ): Promise<{ url: string }> {
        await this.assertFlagEnabled(user);
        this.assertCanManage(user, projectUuid);
        if (!user.organizationUuid) {
            throw new ForbiddenError();
        }

        const normalizedMimeType = mimeType.toLowerCase().split(';', 1)[0];
        if (!ALLOWED_ANNOUNCEMENT_IMAGE_MIME_TYPES.has(normalizedMimeType)) {
            throw new ParameterError(
                `Invalid image type: ${mimeType}. Allowed: ${Array.from(
                    ALLOWED_ANNOUNCEMENT_IMAGE_MIME_TYPES,
                ).join(', ')}`,
            );
        }

        const bufferedUpload =
            await ProjectHomepageService.bufferAnnouncementImageUpload(
                body,
                contentLength,
            );
        const normalizedImage =
            await ProjectHomepageService.normalizeAnnouncementImage(
                bufferedUpload,
            );

        const storageId = `announcements/${projectUuid}/${randomUUID()}`;
        const s3Key = `${storageId}.png`;

        await this.fileStorageClient.uploadImage(normalizedImage, storageId);

        const persistentUrl =
            await this.persistentDownloadFileService.createPersistentUrl({
                s3Key,
                fileType: 'image',
                organizationUuid: user.organizationUuid,
                projectUuid,
                createdByUserUuid: user.userUuid,
                expirationSeconds:
                    ANNOUNCEMENT_IMAGE_PERSISTENT_URL_EXPIRY_SECONDS,
            });

        // Store a site-relative URL so the image renders against whatever
        // origin the browser is on, independent of the configured site host.
        const url = persistentUrl.startsWith('http')
            ? new URL(persistentUrl).pathname
            : persistentUrl;
        return { url };
    }
}
