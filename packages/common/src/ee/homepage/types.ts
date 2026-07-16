import { type ApiSuccess } from '../../types/api/success';
import { type ProjectMemberRole } from '../../types/projectMemberRole';

export type HomepageMarkdownBlock = {
    id: string;
    type: 'markdown';
    config: { content: string };
};

export type HomepageHeroBlock = {
    id: string;
    type: 'hero';
    config: { title: string; subtitle: string };
};

export type HomepageAskAiHeroBlock = {
    id: string;
    type: 'ask-ai-hero';
    config: { showGreeting: boolean };
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

export type HomepageResourceKind = 'video' | 'doc' | 'link';

export type HomepageResourceItem = {
    title: string;
    url: string;
    kind: HomepageResourceKind;
};

export type HomepageResourcesBlock = {
    id: string;
    type: 'resources';
    config: { title: string; items: HomepageResourceItem[] };
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

export type HomepageBlock =
    | HomepageMarkdownBlock
    | HomepageHeroBlock
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

export type ApiProjectHomepageResponse = ApiSuccess<ProjectHomepage>;
export type ApiProjectHomepagesResponse = ApiSuccess<ProjectHomepage[]>;
export type ApiProjectHomepageOrNullResponse =
    ApiSuccess<ProjectHomepage | null>;
