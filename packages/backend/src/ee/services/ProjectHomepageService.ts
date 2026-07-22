import { subject } from '@casl/ability';
import {
    ANNOUNCEMENT_BODY_MAX_LENGTH,
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
import { type SlackAuthenticationModel } from '../../models/SlackAuthenticationModel';
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
// The byte cap doesn't bound decoded size: a few KB of PNG can declare
// 30000x30000 and allocate gigabytes once decoded.
const ANNOUNCEMENT_IMAGE_MAX_PIXELS = 25_000_000;
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

// Slack's `markdown` block renders standard markdown natively. Not yet in the
// pinned @slack/types, but it structurally satisfies the SDK's base Block type.
type SlackMarkdownBlock = { type: 'markdown'; text: string };

type ImageDimensions = { width: number; height: number };

const readPngDimensions = (buffer: Buffer): ImageDimensions | null => {
    if (buffer.length < 24) return null;
    if (buffer.readUInt32BE(0) !== 0x89504e47) return null;
    if (buffer.toString('ascii', 12, 16) !== 'IHDR') return null;
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
};

const readGifDimensions = (buffer: Buffer): ImageDimensions | null => {
    if (buffer.length < 10) return null;
    if (buffer.toString('ascii', 0, 4) !== 'GIF8') return null;
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
};

/* eslint-disable no-bitwise -- WebP packs dimensions into header bit fields */
const readWebpDimensions = (buffer: Buffer): ImageDimensions | null => {
    if (buffer.length < 30) return null;
    if (
        buffer.toString('ascii', 0, 4) !== 'RIFF' ||
        buffer.toString('ascii', 8, 12) !== 'WEBP'
    ) {
        return null;
    }
    switch (buffer.toString('ascii', 12, 16)) {
        case 'VP8X':
            return {
                width: buffer.readUIntLE(24, 3) + 1,
                height: buffer.readUIntLE(27, 3) + 1,
            };
        case 'VP8 ':
            return {
                width: buffer.readUInt16LE(26) & 0x3fff,
                height: buffer.readUInt16LE(28) & 0x3fff,
            };
        case 'VP8L': {
            const bits = buffer.readUInt32LE(21);
            return {
                width: (bits & 0x3fff) + 1,
                height: ((bits >> 14) & 0x3fff) + 1,
            };
        }
        default:
            return null;
    }
};
/* eslint-enable no-bitwise */

const readJpegDimensions = (buffer: Buffer): ImageDimensions | null => {
    if (buffer.length < 4 || buffer.readUInt16BE(0) !== 0xffd8) return null;
    let offset = 2;
    while (offset + 9 < buffer.length) {
        if (buffer[offset] !== 0xff) return null;
        const marker = buffer[offset + 1];
        // Standalone markers carry no length field
        if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
            offset += 2;
        } else {
            const isStartOfFrame =
                marker >= 0xc0 &&
                marker <= 0xcf &&
                marker !== 0xc4 &&
                marker !== 0xc8 &&
                marker !== 0xcc;
            if (isStartOfFrame) {
                return {
                    height: buffer.readUInt16BE(offset + 5),
                    width: buffer.readUInt16BE(offset + 7),
                };
            }
            offset += 2 + buffer.readUInt16BE(offset + 2);
        }
    }
    return null;
};

const announcementImageS3Prefix = (projectUuid: string) =>
    `announcements/${projectUuid}/`;

const readImageDimensions = (buffer: Buffer): ImageDimensions | null =>
    readPngDimensions(buffer) ??
    readGifDimensions(buffer) ??
    readWebpDimensions(buffer) ??
    readJpegDimensions(buffer);

export type ProjectHomepageServiceArguments = {
    projectHomepageModel: Pick<
        ProjectHomepageModel,
        | 'getDefault'
        | 'getByUuid'
        | 'getPublishedDefault'
        | 'getRecentlyViewed'
        | 'getAssignments'
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
        | 'publishProjectDraftAnnouncements'
    >;
    featureFlagService: Pick<FeatureFlagService, 'get'>;
    groupsModel: Pick<GroupsModel, 'findUserGroups'>;
    projectModel: Pick<ProjectModel, 'getProjectMemberAccess'>;
    fileStorageClient: FileStorageClient;
    persistentDownloadFileService: PersistentDownloadFileService;
    slackClient: Pick<SlackClient, 'postMessage'>;
    slackAuthenticationModel: Pick<
        SlackAuthenticationModel,
        'getInstallationFromOrganizationUuid'
    >;
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

    private readonly slackAuthenticationModel: ProjectHomepageServiceArguments['slackAuthenticationModel'];

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
        this.slackAuthenticationModel = args.slackAuthenticationModel;
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

    // Resolution: group priority → role → project default
    private async resolveForViewer(
        projectUuid: string,
        viewer: {
            groupUuids: string[];
            role: ProjectMemberRole | undefined;
        },
    ): Promise<HomepageViewAsResult> {
        const published = await this.projectHomepageModel.resolvePublished(
            projectUuid,
            { groupUuids: viewer.groupUuids, role: viewer.role },
        );
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
    }> {
        const [groups, membership] = await Promise.all([
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
                });
            case 'role':
                return this.resolveForViewer(projectUuid, {
                    groupUuids: [],
                    role: target.role,
                });
            default:
                return assertUnreachable(target, 'Unknown view-as target type');
        }
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
    ): Promise<ProjectHomepage> {
        await this.assertFlagEnabled(user);
        this.assertCanManage(user, projectUuid);
        await this.getOwnedHomepage(projectUuid, homepageUuid);
        const published = await this.projectHomepageModel.publish(
            homepageUuid,
            audience,
        );
        const { organizationUuid } = user;
        if (organizationUuid) {
            const publishedDrafts =
                await this.projectHomepageModel.publishProjectDraftAnnouncements(
                    projectUuid,
                );
            await Promise.all(
                publishedDrafts.map(({ announcement, slackChannelId }) =>
                    this.notifyAnnouncementToSlack(
                        organizationUuid,
                        projectUuid,
                        announcement,
                        slackChannelId,
                    ),
                ),
            );
        }
        return published;
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

    private static validateAnnouncementBody(body: string | null): void {
        if (body !== null && body.length > ANNOUNCEMENT_BODY_MAX_LENGTH) {
            throw new ParameterError(
                `Announcement body is too long: ${body.length} characters. Maximum: ${ANNOUNCEMENT_BODY_MAX_LENGTH}`,
            );
        }
    }

    private async assertSlackInstalled(organizationUuid: string) {
        const installation =
            await this.slackAuthenticationModel.getInstallationFromOrganizationUuid(
                organizationUuid,
            );
        if (!installation) {
            throw new ParameterError(
                'Slack is not connected for this organization',
            );
        }
    }

    async listAnnouncements(
        user: SessionUser,
        projectUuid: string,
        options: {
            page: number;
            pageSize: number;
            includeUnpublished?: boolean;
        },
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
        // Drafts are only ever visible to someone who can manage the homepage.
        if (options.includeUnpublished) {
            this.assertCanManage(user, projectUuid);
        }
        return this.projectHomepageModel.listAnnouncements(
            projectUuid,
            options,
        );
    }

    // The first inline image, absolute-ized, for a Slack `image` block — the
    // `markdown` block can't render inline images, so the image is appended as
    // its own block instead of being lost.
    private announcementSlackImage(
        body: string,
    ): { imageUrl: string; altText: string } | null {
        const match = body.match(/!\[([^\]]*)\]\(([^)\s]+)\)/);
        if (!match) return null;
        const [, alt, url] = match;
        const absolute = url.startsWith('/')
            ? `${this.lightdashConfig.siteUrl}${url}`
            : url;
        if (!/^https?:\/\//.test(absolute)) return null;
        return { imageUrl: absolute, altText: alt || 'Announcement image' };
    }

    // The stored body is standard markdown; Slack's `markdown` block renders it
    // natively (links, bold, lists), so we only need to make relative URLs
    // absolute and drop inline images (the first one is re-attached as a
    // dedicated image block, see `announcementSlackImage`).
    private announcementSlackMarkdown(body: string): string {
        const { siteUrl } = this.lightdashConfig;
        return body
            .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // drop inline images
            .replace(
                /\]\((\/[^)\s]*)\)/g,
                (_match, path) => `](${siteUrl}${path})`,
            )
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    private async notifyAnnouncementToSlack(
        organizationUuid: string,
        projectUuid: string,
        announcement: ProjectAnnouncement,
        channelId: string,
    ): Promise<void> {
        const link = `${this.lightdashConfig.siteUrl}/projects/${projectUuid}/home`;
        const markdown = announcement.body
            ? this.announcementSlackMarkdown(announcement.body)
            : '';
        const image = announcement.body
            ? this.announcementSlackImage(announcement.body)
            : null;
        const blocks: (KnownBlock | SlackMarkdownBlock)[] = [
            {
                type: 'header',
                text: {
                    type: 'plain_text',
                    text: announcement.title.slice(0, 150),
                    emoji: true,
                },
            },
            ...(markdown
                ? [{ type: 'markdown' as const, text: markdown }]
                : []),
            ...(image
                ? [
                      {
                          type: 'image' as const,
                          image_url: image.imageUrl,
                          alt_text: image.altText,
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
        const text = `📢 New announcement: ${announcement.title}`;
        try {
            await this.slackClient.postMessage({
                organizationUuid,
                channel: channelId,
                text,
                blocks,
            });
        } catch (error) {
            // Slack rejects the whole message when it can't fetch the image
            // URL (common when the instance isn't reachable from Slack), so
            // retry without it rather than losing the announcement.
            if (!image) {
                this.logger.error(
                    `Failed to post announcement to Slack channel ${channelId}: ${getErrorMessage(
                        error,
                    )}`,
                );
                return;
            }
            try {
                await this.slackClient.postMessage({
                    organizationUuid,
                    channel: channelId,
                    text,
                    blocks: blocks.filter((block) => block.type !== 'image'),
                });
            } catch (retryError) {
                this.logger.error(
                    `Failed to post announcement to Slack channel ${channelId}: ${getErrorMessage(
                        retryError,
                    )}`,
                );
            }
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
        ProjectHomepageService.validateAnnouncementBody(data.body);
        if (data.slackChannelId) {
            if (!user.organizationUuid) throw new ForbiddenError();
            await this.assertSlackInstalled(user.organizationUuid);
        }
        // Created as a draft — it stays invisible on the live homepage and its
        // Slack notification (if any) is deferred until the homepage is
        // published, see `publishHomepage`.
        return this.projectHomepageModel.createAnnouncement({
            projectUuid,
            title: data.title.trim(),
            body: data.body,
            category: data.category,
            createdByUserUuid: user.userUuid,
            pendingSlackChannelId: data.slackChannelId ?? null,
        });
    }

    async updateAnnouncement(
        user: SessionUser,
        projectUuid: string,
        announcementUuid: string,
        update: UpdateAnnouncementRequest,
    ): Promise<ProjectAnnouncement> {
        await this.assertFlagEnabled(user);
        this.assertCanManage(user, projectUuid);
        const announcement = await this.getOwnedAnnouncement(
            projectUuid,
            announcementUuid,
        );
        if (update.title !== undefined) {
            ProjectHomepageService.validateAnnouncementTitle(update.title);
        }
        if (update.body !== undefined) {
            ProjectHomepageService.validateAnnouncementBody(update.body);
        }
        if (update.slackChannelId !== undefined) {
            // The notification fires on publish, so a published announcement
            // has nothing left to retarget.
            if (announcement.published) {
                throw new ParameterError(
                    'Cannot change the Slack channel of a published announcement',
                );
            }
            if (update.slackChannelId !== null) {
                if (!user.organizationUuid) throw new ForbiddenError();
                await this.assertSlackInstalled(user.organizationUuid);
            }
        }
        return this.projectHomepageModel.updateAnnouncement(announcementUuid, {
            ...update,
            ...(update.title !== undefined && { title: update.title.trim() }),
        });
    }

    // Best-effort: uploaded images are only reachable through the body, so
    // they become orphans once the announcement is gone. Only files stored
    // under this project's announcement prefix are touched.
    private async deleteAnnouncementImages(
        projectUuid: string,
        body: string | null,
    ): Promise<void> {
        if (!body) return;
        const fileNanoids = Array.from(
            body.matchAll(/\/api\/v1\/file\/([A-Za-z0-9_-]+)/g),
            (match) => match[1],
        );
        await Promise.all(
            fileNanoids.map(async (fileNanoid) => {
                try {
                    await this.persistentDownloadFileService.deleteFileWithKeyPrefix(
                        fileNanoid,
                        announcementImageS3Prefix(projectUuid),
                    );
                } catch (error) {
                    this.logger.error(
                        `Failed to delete announcement image ${fileNanoid}: ${getErrorMessage(
                            error,
                        )}`,
                    );
                }
            }),
        );
    }

    async deleteAnnouncement(
        user: SessionUser,
        projectUuid: string,
        announcementUuid: string,
    ): Promise<void> {
        await this.assertFlagEnabled(user);
        this.assertCanManage(user, projectUuid);
        const announcement = await this.getOwnedAnnouncement(
            projectUuid,
            announcementUuid,
        );
        await this.projectHomepageModel.deleteAnnouncement(announcementUuid);
        await this.deleteAnnouncementImages(projectUuid, announcement.body);
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
        const dimensions = readImageDimensions(upload);
        if (!dimensions) {
            throw new ParameterError('Invalid image: unreadable header');
        }
        if (
            dimensions.width * dimensions.height >
            ANNOUNCEMENT_IMAGE_MAX_PIXELS
        ) {
            throw new ParameterError(
                `Image too large: ${dimensions.width}x${dimensions.height} pixels. Maximum: ${ANNOUNCEMENT_IMAGE_MAX_PIXELS} pixels`,
            );
        }
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

        const storageId = `${announcementImageS3Prefix(
            projectUuid,
        )}${randomUUID()}`;
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
