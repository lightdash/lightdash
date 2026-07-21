import { type ApiSuccess } from '../../types/api/success';
import { type ProjectMemberRole } from '../../types/projectMemberRole';

export type HomepageMarkdownBlock = {
    id: string;
    type: 'markdown';
    config: { content: string };
};

export type HomepageAskAiHeroBlock = {
    id: string;
    type: 'ask-ai-hero';
    config: {
        showGreeting: boolean;
        /** Replaces the prompt suggestions with the setup checklist.
         * Optional for configs persisted before this field existed. */
        showRecommendedActions?: boolean;
    };
};

export type HomepageCollectionItemRef = {
    contentType: 'chart' | 'dashboard';
    uuid: string;
};

export type HomepageCollectionBlock = {
    id: string;
    type: 'collection';
    config: { title: string; items: HomepageCollectionItemRef[] };
};

export type HomepageResourceKind =
    | 'video'
    | 'doc'
    | 'link'
    | 'claude'
    | 'youtube';

export type HomepageResourceItem = {
    title: string;
    url: string;
    kind: HomepageResourceKind;
    // Optional for back-compat with already-stored items; new items always set them.
    description?: string;
    imageUrl?: string;
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

export type HomepageAnnouncementItem = {
    /** Markdown — @-mentioned charts/dashboards are plain markdown links
     * (`[label](/projects/.../saved/:uuid/view)`), rendered as rich chips by
     * `rehypeAiAgentContentLinks`. */
    text: string;
    date: string;
    author: string;
};

export type HomepageAnnouncementsBlock = {
    id: string;
    type: 'announcements';
    config: { title: string; items: HomepageAnnouncementItem[] };
};

export type HomepageQuickAction =
    | { type: 'ask-ai' }
    | { type: 'run-query' }
    | { type: 'browse-dashboards' }
    | { type: 'browse-spaces' }
    | { type: 'dashboard'; dashboardUuid: string; label: string };

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

export type HomepageBlock =
    | HomepageMarkdownBlock
    | HomepageAskAiHeroBlock
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
    allowPersonal: boolean;
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
    allowPersonal: boolean;
    createdByUserUuid: string | null;
    createdAt: Date;
    updatedAt: Date;
};

export type PublishedProjectHomepage = {
    homepageUuid: string;
    name: string;
    config: HomepageConfig;
    allowPersonal: boolean;
};

export type ResolvedHomepage =
    | { type: 'homepage'; homepage: PublishedProjectHomepage }
    | { type: 'dashboard'; dashboardUuid: string };

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

export type HomepageViewAsReason =
    | { type: 'personal'; dashboardUuid: string }
    | HomepageResolutionSource;

export type HomepageViewAsResult = {
    resolved: ResolvedHomepage | null;
    reason: HomepageViewAsReason | null;
};

export type ApiHomepageViewAsResponse = ApiSuccess<HomepageViewAsResult>;

export type SetPersonalHomepageRequest = {
    dashboardUuid: string;
};

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

export type AnnouncementCategory = {
    categoryUuid: string;
    projectUuid: string;
    name: string;
    color: string;
};

export type ProjectAnnouncement = {
    announcementUuid: string;
    projectUuid: string;
    title: string;
    body: string | null;
    categoryUuid: string | null;
    pinned: boolean;
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
    categoryUuid: string | null;
};

/** PATCH semantics: omitted fields are left unchanged */
export type UpdateAnnouncementRequest = {
    title?: string;
    body?: string | null;
    categoryUuid?: string | null;
    pinned?: boolean;
};

export type CreateAnnouncementCategoryRequest = {
    name: string;
    color: string;
};

export type ApiAnnouncementsResponse = ApiSuccess<AnnouncementsPage>;
export type ApiAnnouncementResponse = ApiSuccess<ProjectAnnouncement>;
export type ApiAnnouncementCategoriesResponse = ApiSuccess<
    AnnouncementCategory[]
>;
export type ApiAnnouncementCategoryResponse = ApiSuccess<AnnouncementCategory>;
