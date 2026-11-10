import { type SemanticLayerDraftImpact } from '@lightdash/common';
import { Knex } from 'knex';

export const ProjectModelDraftImpactsTableName = 'project_model_draft_impacts';

export type DraftImpactCheckStatus = 'checking' | 'done' | 'failed';

/** What applying the whole draft breaks, and what applying each model alone breaks. */
export type DraftImpactBreaks = {
    draft: SemanticLayerDraftImpact['breaks'];
    models: Record<string, SemanticLayerDraftImpact['breaks']>;
};

export type DbProjectModelDraftImpact = {
    project_model_draft_impact_uuid: string;
    project_uuid: string;
    created_by_user_uuid: string;
    /** The draft and live models the check is for; any change to either makes it stale. */
    draft_hash: string;
    status: DraftImpactCheckStatus;
    breaks: DraftImpactBreaks | null;
    created_at: Date;
};

export type ProjectModelDraftImpactsTable = Knex.CompositeTableType<
    DbProjectModelDraftImpact,
    Pick<
        DbProjectModelDraftImpact,
        'project_uuid' | 'created_by_user_uuid' | 'draft_hash' | 'status'
    > & { breaks: string | null; created_at: Date },
    Pick<DbProjectModelDraftImpact, 'status'> & { breaks: string | null }
>;
