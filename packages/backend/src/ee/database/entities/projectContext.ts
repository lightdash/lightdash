import type {
    AiProjectContextEntryStatus,
    AiProjectContextObjectRef,
    ProjectContextEntry,
} from '@lightdash/common';
import { Knex } from 'knex';

export const ProjectContextDocumentTableName = 'project_context_document';

// Legacy blob cache: project_context_entries rows are canonical; the blob is
// still dual-written on reconcile so old code stays correct across rolling
// deploys/rollbacks. Dropping the table (and the dual-write) is a follow-up.
export type DbProjectContextDocument = {
    project_uuid: string;
    version: number;
    entries: ProjectContextEntry[];
    updated_at: Date;
};

export const ProjectContextEntriesTableName = 'project_context_entries';

// One row per (project, content hash). Rows survive file edits and removals:
// a tombstoned row is the content snapshot an old citation resolves to.
export type DbProjectContextEntry = {
    project_context_entry_uuid: string;
    project_uuid: string;
    hash: string;
    entry_id: string;
    kind: ProjectContextEntry['kind'];
    content: string;
    title: string | null;
    apply: string | null;
    terms: string[];
    objects: AiProjectContextObjectRef[];
    status: AiProjectContextEntryStatus;
    cited_count: number;
    last_cited_at: Date | null;
    pulled_count: number;
    last_pulled_at: Date | null;
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
        | 'status'
        | 'title'
        | 'apply'
        | 'cited_count'
        | 'last_cited_at'
        | 'pulled_count'
        | 'last_pulled_at'
        | 'created_at'
        | 'updated_at'
    > &
        ProjectContextEntryJsonbWrite &
        Partial<
            Pick<
                DbProjectContextEntry,
                'status' | 'title' | 'apply' | 'cited_count' | 'pulled_count'
            >
        >,
    Partial<
        Omit<
            DbProjectContextEntry,
            | keyof ProjectContextEntryJsonbWrite
            | 'project_context_entry_uuid'
            | 'project_uuid'
            | 'hash'
            | 'created_at'
            | 'updated_at'
            | 'cited_count'
            | 'last_cited_at'
            | 'pulled_count'
            | 'last_pulled_at'
        > &
            ProjectContextEntryJsonbWrite
    > & {
        updated_at?: Date | Knex.Raw;
        cited_count?: number | Knex.Raw;
        last_cited_at?: Date | Knex.Raw;
        pulled_count?: number | Knex.Raw;
        last_pulled_at?: Date | Knex.Raw;
    }
>;
