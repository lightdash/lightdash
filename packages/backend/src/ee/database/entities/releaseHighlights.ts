import { Knex } from 'knex';
import { type ReleaseFeatureCandidate } from '../../clients/GithubReleaseNotes/releaseFeatureCandidates';

export const ReleaseHighlightsTableName = 'release_highlights';

export type RankedReleaseHighlight = {
    candidateId: string;
    title: string;
    benefit: string;
};

export type DbReleaseHighlights = {
    from_version: string;
    to_version: string;
    candidates: ReleaseFeatureCandidate[];
    ranked: RankedReleaseHighlight[];
    created_at: Date;
};

export type ReleaseHighlightsTable = Knex.CompositeTableType<
    DbReleaseHighlights,
    Omit<DbReleaseHighlights, 'created_at' | 'candidates' | 'ranked'> & {
        candidates: string;
        ranked: string;
    }
>;
