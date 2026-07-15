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

export type HomepageAiBlock = {
    id: string;
    type: 'ai';
    config: { chips: string[] };
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
    | HomepageAiBlock
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

export const HOMEPAGE_MAX_BLOCKS_PER_ROW = 3;

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
    createdByUserUuid: string | null;
    createdAt: Date;
    updatedAt: Date;
};

export type PublishedProjectHomepage = {
    homepageUuid: string;
    name: string;
    config: HomepageConfig;
};

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
export type ApiPublishedHomepageResponse =
    ApiSuccess<PublishedProjectHomepage | null>;
