import { AiAgentDocumentStructuredSummary } from '@lightdash/ai';
import { Knex } from 'knex';

export const AiAgentDocumentTableName = 'ai_agent_document';

export type DbAiAgentDocument = {
    ai_agent_document_uuid: string;
    organization_uuid: string;
    project_uuid: string | null;
    name: string;
    original_filename: string;
    mime_type: string;
    content: string | null;
    content_size_bytes: number;
    summary: AiAgentDocumentStructuredSummary;
    storage_key: string;
    created_by_user_uuid: string | null;
    updated_by_user_uuid: string | null;
    created_at: Date;
    updated_at: Date;
};

export type AiAgentDocumentTable = Knex.CompositeTableType<
    DbAiAgentDocument,
    Omit<
        DbAiAgentDocument,
        'ai_agent_document_uuid' | 'created_at' | 'updated_at'
    >,
    Partial<
        Omit<
            DbAiAgentDocument,
            | 'ai_agent_document_uuid'
            | 'organization_uuid'
            | 'created_at'
            | 'updated_at'
        >
    > & {
        updated_at: Knex.Raw;
    }
>;

export const AiAgentDocumentAccessTableName = 'ai_agent_document_access';

export type DbAiAgentDocumentAccess = {
    ai_agent_document_uuid: string;
    ai_agent_uuid: string;
    created_at: Date;
};

export type AiAgentDocumentAccessTable = Knex.CompositeTableType<
    DbAiAgentDocumentAccess,
    Omit<DbAiAgentDocumentAccess, 'created_at'>,
    Partial<
        Omit<
            DbAiAgentDocumentAccess,
            'ai_agent_document_uuid' | 'ai_agent_uuid' | 'created_at'
        >
    >
>;
