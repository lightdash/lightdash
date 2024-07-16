import { ChartContent, ContentType, SummaryContent } from '@lightdash/common';
import { Knex } from 'knex';

export type ContentFilters = {
    projectUuids?: string[];
    spaceUuids?: string[];
    contentTypes?: ContentType[];
    chart?: {
        sources?: ChartContent['source'][];
    };
};

export type SummaryContentRow<
    T extends Record<string, unknown> = Record<string, unknown>,
> = {
    content_type: string;
    uuid: string;
    name: string;
    description: string | null;
    slug: string;
    space_uuid: string;
    space_name: string;
    project_uuid: string;
    project_name: string;
    organization_uuid: string;
    organization_name: string;
    pinned_list_uuid: string | null;
    created_at: Date;
    created_by_user_uuid: string | null;
    created_by_user_first_name: string | null;
    created_by_user_last_name: string | null;
    last_updated_at: Date | null;
    last_updated_by_user_uuid: string | null;
    last_updated_by_user_first_name: string | null;
    last_updated_by_user_last_name: string | null;
    metadata: T;
};

export type ContentConfiguration<
    T extends SummaryContentRow = SummaryContentRow,
> = {
    shouldQueryBeIncluded: (filters: ContentFilters) => boolean;
    getSummaryQuery: (knex: Knex, filters: ContentFilters) => Knex.QueryBuilder;
    shouldRowBeConverted: (value: SummaryContentRow) => value is T;
    convertSummaryRow: (value: SummaryContentRow) => SummaryContent;
};
