import { Knex } from 'knex';
import { type ReleaseFeatureCandidate } from '../clients/GithubReleaseNotes/releaseFeatureCandidates';
import {
    ReleaseHighlightsTableName,
    type RankedReleaseHighlight,
} from '../database/entities/releaseHighlights';

export type CachedReleaseHighlights = {
    fromVersion: string;
    toVersion: string;
    candidates: ReleaseFeatureCandidate[];
    ranked: RankedReleaseHighlight[];
    generatedAt: Date;
};

export class ReleaseHighlightsModel {
    private readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    async get(
        fromVersion: string,
        toVersion: string,
    ): Promise<CachedReleaseHighlights | null> {
        const row = await this.database(ReleaseHighlightsTableName)
            .where({ from_version: fromVersion, to_version: toVersion })
            .first();
        return row
            ? {
                  fromVersion: row.from_version,
                  toVersion: row.to_version,
                  candidates: row.candidates.map((candidate) => ({
                      ...candidate,
                      relatedNumbers:
                          candidate.relatedNumbers ??
                          (candidate.number === null ? [] : [candidate.number]),
                  })),
                  ranked: row.ranked,
                  generatedAt: row.created_at,
              }
            : null;
    }

    async insert(
        fromVersion: string,
        toVersion: string,
        candidates: ReleaseFeatureCandidate[],
        ranked: RankedReleaseHighlight[],
    ): Promise<void> {
        await this.database(ReleaseHighlightsTableName)
            .insert({
                from_version: fromVersion,
                to_version: toVersion,
                candidates: JSON.stringify(candidates),
                ranked: JSON.stringify(ranked),
            })
            .onConflict(['from_version', 'to_version'])
            .ignore();
    }
}
