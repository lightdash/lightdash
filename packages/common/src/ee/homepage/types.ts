import { type ApiSuccess } from '../../types/api/success';

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

export type HomepageBlock =
    | HomepageMarkdownBlock
    | HomepageHeroBlock
    | HomepageAiBlock
    | HomepageCollectionBlock;

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
};

export type ApiProjectHomepageResponse = ApiSuccess<ProjectHomepage>;
export type ApiProjectHomepagesResponse = ApiSuccess<ProjectHomepage[]>;
export type ApiProjectHomepageOrNullResponse =
    ApiSuccess<ProjectHomepage | null>;
export type ApiPublishedHomepageResponse =
    ApiSuccess<PublishedProjectHomepage | null>;
