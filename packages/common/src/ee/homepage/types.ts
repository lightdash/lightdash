import { type ApiSuccess } from '../../types/api/success';
import { type ProjectMemberRole } from '../../types/projectMemberRole';

export type HomepageMarkdownBlock = {
    id: string;
    type: 'markdown';
    config: { content: string };
};

/** How much of the opening view the hero claims. `full` centres it in the
 * viewport; `compact` gives it only the height of its own content. Absent in
 * stored configs means "let the layout decide" — see resolveHeroDensity. */
export type HomepageHeroDensity = 'full' | 'compact';

export type HomepageAskAiHeroBlock = {
    id: string;
    type: 'ask-ai-hero';
    config: {
        showGreeting: boolean;
        /** Replaces the prompt suggestions with the setup checklist.
         * Optional for configs persisted before this field existed. */
        showRecommendedActions?: boolean;
        density?: HomepageHeroDensity;
    };
};

/** Day-part greeting ("Good afternoon, Ada") with an optional line under it.
 * The AI hero has its own built-in greeting; this is the standalone one for
 * pages that don't lead with a composer. */
export type HomepageGreetingBlock = {
    id: string;
    type: 'greeting';
    config: { subtitle: string; density?: HomepageHeroDensity };
};

export type HomepageCollectionItemRef = {
    contentType: 'chart' | 'dashboard' | 'space' | 'data_app';
    uuid: string;
};

/**
 * Where a collection block's items come from.
 *
 * `manual` reads the block's own `items`. Every other source is a live rule
 * resolved per viewer at render time — which is the point: a snapshot of
 * "most viewed" is stale the week after it's taken, and a frozen copy of the
 * pin list stops tracking pins the moment it's published.
 *
 * `favorites` and `recently-viewed` are per-viewer; the rest are project-wide.
 */
export type HomepageCollectionSource =
    | 'manual'
    | 'most-viewed'
    | 'recently-updated'
    | 'pinned'
    | 'favorites'
    | 'recently-viewed';

/** Sources whose content differs for every viewer, so an admin previewing as
 * someone else must not see the target's data. */
export const PERSONAL_COLLECTION_SOURCES: HomepageCollectionSource[] = [
    'favorites',
    'recently-viewed',
];

export const isPersonalCollectionSource = (
    source: HomepageCollectionSource,
): boolean => PERSONAL_COLLECTION_SOURCES.includes(source);

export const DEFAULT_COLLECTION_LIMIT = 6;
export const MAX_COLLECTION_LIMIT = 24;

export type HomepageCollectionBlock = {
    id: string;
    type: 'collection';
    config: {
        title: string;
        /** The hand-picked items. Read only when `source` is `manual`, which
         * is what an absent `source` means — every config stored before
         * sources existed is a manual collection. */
        items: HomepageCollectionItemRef[];
        source?: HomepageCollectionSource;
        /** Applies to every source, including manual. */
        verifiedOnly?: boolean;
        /** How many items to show. Absent means DEFAULT_COLLECTION_LIMIT. */
        limit?: number;
    };
};

export const collectionSourceOf = (
    config: HomepageCollectionBlock['config'],
): HomepageCollectionSource => config.source ?? 'manual';

export const collectionLimitOf = (
    config: HomepageCollectionBlock['config'],
): number =>
    Math.min(config.limit ?? DEFAULT_COLLECTION_LIMIT, MAX_COLLECTION_LIMIT);

export type HomepageResourceKind =
    | 'video'
    | 'doc'
    | 'link'
    | 'claude'
    | 'youtube'
    | 'data-app';

export type HomepageResourceItem = {
    title: string;
    url: string;
    kind: HomepageResourceKind;
    // Optional for back-compat with already-stored items; new items always set them.
    description?: string;
    imageUrl?: string;
    // Set only for `kind: 'data-app'` items. The referenced app's uuid is used
    // to fetch its live thumbnail — data app thumbnails are short-lived signed
    // URLs, so they're resolved at render time rather than baked into `imageUrl`.
    appUuid?: string;
};

export type HomepageResourcesLayout = 'card' | 'list';

export type HomepageResourcesBlock = {
    id: string;
    type: 'resources';
    config: {
        title: string;
        items: HomepageResourceItem[];
        // Optional for back-compat: undefined renders as 'list'.
        layout?: HomepageResourcesLayout;
    };
};

/** Detected metadata for a pasted resource URL (Claude Artifact / YouTube). */
export type HomepageLinkMetadata = {
    kind: HomepageResourceKind;
    title: string | null;
    description: string | null;
    imageUrl: string | null;
};

export type HomepageAnnouncementsBlock = {
    id: string;
    type: 'announcements';
    /** Feed reference — items live in `project_announcements`. */
    config: { title: string };
};

export type HomepageQuickActionTarget =
    | { type: 'ask-ai' }
    | { type: 'run-query' }
    | { type: 'browse-dashboards' }
    | { type: 'browse-spaces' }
    | { type: 'dashboard'; dashboardUuid: string; label: string };

/** Any quick action can be promoted to the row's primary one, which renders
 * as the same chip inverted. Optional so older configs still load. */
export type HomepageQuickAction = HomepageQuickActionTarget & {
    primary?: boolean;
};

export type HomepageQuickActionsBlock = {
    id: string;
    type: 'quick-actions';
    config: { actions: HomepageQuickAction[] };
};

export type HomepageMetricRef = {
    tableName: string;
    metricName: string;
    label: string;
};

export type HomepageMetricsBlock = {
    id: string;
    type: 'metrics';
    config: { title: string; items: HomepageMetricRef[] };
};

export type HomepageFavoritesBlock = {
    id: string;
    type: 'favorites';
    config: { title: string };
};

export type HomepageRecentBlock = {
    id: string;
    type: 'recent';
    config: { title: string };
};

export type HomepageRecommendedActionKey =
    | 'connect-warehouse'
    | 'add-semantic-layer'
    | 'connect-source-control'
    | 'connect-slack';

export const HOMEPAGE_RECOMMENDED_ACTION_SCOPES: Record<
    HomepageRecommendedActionKey,
    'organization' | 'project'
> = {
    'connect-warehouse': 'organization',
    'add-semantic-layer': 'project',
    'connect-source-control': 'organization',
    'connect-slack': 'organization',
};

export const SKIPPABLE_HOMEPAGE_RECOMMENDED_ACTION_KEYS = [
    'add-semantic-layer',
    'connect-source-control',
    'connect-slack',
] as const satisfies readonly HomepageRecommendedActionKey[];

export type SkippableHomepageRecommendedActionKey =
    (typeof SKIPPABLE_HOMEPAGE_RECOMMENDED_ACTION_KEYS)[number];

export type SkipHomepageRecommendedActionRequest = {
    actionKey: HomepageRecommendedActionKey;
};

export type ApiHomepageRecommendedActionSkipsResponse = ApiSuccess<
    SkippableHomepageRecommendedActionKey[]
>;

export type HomepageBlock =
    | HomepageMarkdownBlock
    | HomepageAskAiHeroBlock
    | HomepageGreetingBlock
    | HomepageCollectionBlock
    | HomepageResourcesBlock
    | HomepageAnnouncementsBlock
    | HomepageMetricsBlock
    | HomepageQuickActionsBlock
    | HomepageFavoritesBlock
    | HomepageRecentBlock;

export type HomepageAudience =
    | { type: 'everyone' }
    | { type: 'groups'; groupUuids: string[] }
    | { type: 'roles'; roles: ProjectMemberRole[] };

export type PublishProjectHomepageRequest = {
    audience: HomepageAudience;
};

export type HomepageAssignment = {
    assignmentUuid: string;
    homepageUuid: string;
    homepageName: string;
    targetType: 'group' | 'role';
    groupUuid: string | null;
    groupName: string | null;
    role: ProjectMemberRole | null;
    priority: number;
};

export type UpdateHomepageGroupPrioritiesRequest = {
    /** Group uuids in priority order — first wins for multi-group users */
    groupUuids: string[];
};

export type ApiHomepageAssignmentsResponse = ApiSuccess<HomepageAssignment[]>;

export type HomepageRecentlyViewedItem = {
    contentType: 'chart' | 'dashboard';
    uuid: string;
    viewedAt: Date;
};

export type ApiRecentlyViewedResponse = ApiSuccess<
    HomepageRecentlyViewedItem[]
>;

export type HomepageRow = {
    id: string;
    blocks: HomepageBlock[];
};

export type HomepageConfig = {
    version: 1;
    rows: HomepageRow[];
};

export const HOMEPAGE_MAX_BLOCKS_PER_ROW = 2;

export const defaultHomepageConfig = (): HomepageConfig => ({
    version: 1,
    rows: [
        {
            id: 'row-1',
            blocks: [
                {
                    id: 'block-1',
                    type: 'markdown',
                    config: {
                        content:
                            '## Welcome\n\nEdit this homepage to get started.',
                    },
                },
            ],
        },
    ],
});

// `hero` (Greeting) is no longer a block type. Convert any legacy stored hero
// block into a markdown block so old configs still load, save and render — its
// {name} token keeps personalizing via the markdown block's own interpolation.
const migrateBlock = (block: HomepageBlock): HomepageBlock => {
    if ((block.type as string) !== 'hero') return block;
    const legacyConfig = (block as { config: Record<string, unknown> }).config;
    const title =
        typeof legacyConfig.title === 'string' ? legacyConfig.title : '';
    const subtitle =
        typeof legacyConfig.subtitle === 'string' ? legacyConfig.subtitle : '';
    const content = subtitle ? `## ${title}\n\n${subtitle}` : `## ${title}`;
    return { id: block.id, type: 'markdown', config: { content } };
};

export const migrateHomepageConfig = (
    config: HomepageConfig,
): HomepageConfig => ({
    ...config,
    rows: config.rows.map((row) => ({
        ...row,
        blocks: row.blocks.map(migrateBlock),
    })),
});

export type ProjectHomepage = {
    homepageUuid: string;
    projectUuid: string;
    name: string;
    draftConfig: HomepageConfig;
    publishedConfig: HomepageConfig | null;
    isDefault: boolean;
    createdByUserUuid: string | null;
    createdAt: Date;
    updatedAt: Date;
};

export type PublishedProjectHomepage = {
    homepageUuid: string;
    name: string;
    config: HomepageConfig;
};

export type ResolvedHomepage = {
    type: 'homepage';
    homepage: PublishedProjectHomepage;
};

export type HomepageResolutionSource =
    | { type: 'group'; groupUuid: string; priority: number }
    | { type: 'role'; role: ProjectMemberRole }
    | { type: 'default' };

export type ResolvedPublishedHomepage = {
    homepage: PublishedProjectHomepage;
    source: HomepageResolutionSource;
};

export type HomepageViewAsTarget =
    | { type: 'user'; userUuid: string }
    | { type: 'group'; groupUuid: string }
    | { type: 'role'; role: ProjectMemberRole };

export type HomepageViewAsReason = HomepageResolutionSource;

export type HomepageViewAsResult = {
    resolved: ResolvedHomepage | null;
    reason: HomepageViewAsReason | null;
};

export type ApiHomepageViewAsResponse = ApiSuccess<HomepageViewAsResult>;

export type ApiResolvedHomepageResponse = ApiSuccess<ResolvedHomepage | null>;

export type CreateProjectHomepageRequest = {
    name: string;
    duplicateFrom?: string;
};

export type UpdateProjectHomepageDraftRequest = {
    name?: string;
    draftConfig: HomepageConfig;
    /** Compare-and-set token: the updatedAt the client based its edit on */
    baseUpdatedAt: Date;
};

export type ApiHomepageLinkMetadataResponse = ApiSuccess<HomepageLinkMetadata>;

export type ApiProjectHomepageResponse = ApiSuccess<ProjectHomepage>;
export type ApiProjectHomepagesResponse = ApiSuccess<ProjectHomepage[]>;
export type ApiProjectHomepageOrNullResponse =
    ApiSuccess<ProjectHomepage | null>;

/**
 * Curated announcement categories a data team uses to signal intent to
 * business users. Fixed set (not user-managed) — each maps to a label + colour
 * in `ANNOUNCEMENT_CATEGORY_META`.
 */
export enum AnnouncementCategory {
    /** Something new to use — a new dashboard, metric, or capability. */
    LAUNCH = 'launch',
    /** Something changed — a metric definition or dashboard refresh. */
    UPDATE = 'update',
    /** Something to be aware of — data delays, quality issues, maintenance. */
    HEADS_UP = 'heads_up',
}

export const ANNOUNCEMENT_CATEGORY_META: Record<
    AnnouncementCategory,
    { label: string; color: string }
> = {
    [AnnouncementCategory.LAUNCH]: { label: 'Launch', color: 'green' },
    [AnnouncementCategory.UPDATE]: { label: 'Update', color: 'violet' },
    [AnnouncementCategory.HEADS_UP]: { label: 'Heads up', color: 'orange' },
};

export type ProjectAnnouncement = {
    announcementUuid: string;
    projectUuid: string;
    title: string;
    body: string | null;
    category: AnnouncementCategory | null;
    pinned: boolean;
    published: boolean;
    /**
     * Slack channel the announcement will notify when it publishes. Always
     * null once published (consumed) — only drafts carry a value, and drafts
     * are only visible to users who can manage announcements.
     */
    pendingSlackChannelId: string | null;
    createdByUserUuid: string | null;
    authorName: string | null;
    createdAt: Date;
    updatedAt: Date;
};

export type AnnouncementsPage = {
    items: ProjectAnnouncement[];
    totalCount: number;
};

export type CreateAnnouncementRequest = {
    title: string;
    body: string | null;
    category: AnnouncementCategory | null;
    /**
     * Transient (not persisted): when set, publishing posts a notification to
     * this Slack channel. Requires the org to have Slack installed.
     */
    slackChannelId?: string | null;
};

/** PATCH semantics: omitted fields are left unchanged */
export type UpdateAnnouncementRequest = {
    title?: string;
    body?: string | null;
    category?: AnnouncementCategory | null;
    pinned?: boolean;
    /** Only drafts: set to retarget the Slack notification, null to cancel it */
    slackChannelId?: string | null;
};

/** Slack's markdown block rejects ~12k chars; cap bodies well under it */
export const ANNOUNCEMENT_BODY_MAX_LENGTH = 8000;

export type ApiAnnouncementsResponse = ApiSuccess<AnnouncementsPage>;
export type ApiAnnouncementResponse = ApiSuccess<ProjectAnnouncement>;
export type ApiAnnouncementImageUploadResponse = ApiSuccess<{ url: string }>;
