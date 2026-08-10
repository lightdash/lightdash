import {
    AiProjectContextObjectRef,
    ProjectContextEntry,
    ProjectContextEntryStatus,
} from '@lightdash/common';
import { Knex } from 'knex';

// project_context_document, the pre-rows JSONB blob, is no longer read or
// written: the create-entries migration backfilled it into these rows. The
// table itself is left in place so this release can be rolled back.
export const ProjectContextEntriesTableName = 'project_context_entries';

/**
 * One project-context entry, keyed by the hash of its content. Rows are the
 * source of truth for what the agent reads and what a citation resolves to;
 * removal tombstones (`status = 'removed'`) so old citations keep resolving to
 * exactly the content that was read.
 */
export type DbProjectContextEntry = {
    project_context_entry_uuid: string;
    project_uuid: string;
    hash: string;
    slug: string;
    /** Human-readable id from the file. Cosmetic — it may churn per ingest. */
    file_id: string;
    kind: ProjectContextEntry['kind'];
    content: string;
    title: string | null;
    apply: string | null;
    terms: string[];
    objects: AiProjectContextObjectRef[];
    status: ProjectContextEntryStatus;
    position: number;
    /** Hash of the entry this one was edited from, when lineage is known. */
    predecessor_hash: string | null;
    cited_count: number;
    last_cited_at: Date | null;
    pulled_count: number;
    last_pulled_at: Date | null;
    generated_at: Date;
    removed_at: Date | null;
    created_at: Date;
    updated_at: Date;
};

type ProjectContextEntryJsonbWrite = {
    terms: string;
    objects: string;
};

export type ProjectContextEntriesTable = Knex.CompositeTableType<
    DbProjectContextEntry,
    Omit<
        DbProjectContextEntry,
        | keyof ProjectContextEntryJsonbWrite
        | 'project_context_entry_uuid'
        | 'generated_at'
        | 'removed_at'
        | 'created_at'
        | 'updated_at'
    > &
        ProjectContextEntryJsonbWrite &
        Partial<Pick<DbProjectContextEntry, 'generated_at' | 'removed_at'>>,
    Partial<
        Omit<
            DbProjectContextEntry,
            | keyof ProjectContextEntryJsonbWrite
            | 'project_context_entry_uuid'
            | 'project_uuid'
            | 'hash'
            | 'created_at'
            | 'updated_at'
            | 'removed_at'
            | 'last_cited_at'
            | 'last_pulled_at'
            | 'cited_count'
            | 'pulled_count'
        > &
            ProjectContextEntryJsonbWrite
    > &
        // Timestamps set by the database clock and counters incremented in
        // place are written as raw SQL, never as a read value.
        {
            updated_at?: Knex.Raw;
            removed_at?: Knex.Raw | Date | null;
            last_cited_at?: Knex.Raw | Date | null;
            last_pulled_at?: Knex.Raw | Date | null;
            cited_count?: Knex.Raw | number;
            pulled_count?: Knex.Raw | number;
        }
>;
