import {
    type SkippableHomepageRecommendedActionKey,
    type UUID,
} from '@lightdash/common';
import { Knex } from 'knex';

export const HomepageRecommendedActionSkipsTableName =
    'homepage_recommended_action_skips';

export type DbHomepageRecommendedActionSkip = {
    homepage_recommended_action_skip_uuid: UUID;
    organization_uuid: UUID;
    project_uuid: UUID | null;
    action_key: SkippableHomepageRecommendedActionKey;
    created_by_user_uuid: UUID | null;
    created_at: Date;
};

export type HomepageRecommendedActionSkipsTable = Knex.CompositeTableType<
    DbHomepageRecommendedActionSkip,
    Pick<
        DbHomepageRecommendedActionSkip,
        | 'organization_uuid'
        | 'project_uuid'
        | 'action_key'
        | 'created_by_user_uuid'
    >
>;
