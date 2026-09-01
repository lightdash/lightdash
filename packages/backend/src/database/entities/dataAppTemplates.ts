import { type TemplateQuestion } from '@lightdash/common';
import { Knex } from 'knex';

export const DataAppTemplatesTableName = 'data_app_templates';
export const DataAppTemplateFilesTableName = 'data_app_template_files';

export type DbDataAppTemplate = {
    template_uuid: string;
    organization_uuid: string;
    slug: string;
    name: string;
    description: string;
    category: string;
    questions: TemplateQuestion[];
    created_at: Date;
    updated_at: Date;
    created_by_user_uuid: string | null;
};

export type DbDataAppTemplateIn = Pick<
    DbDataAppTemplate,
    | 'template_uuid'
    | 'organization_uuid'
    | 'slug'
    | 'name'
    | 'description'
    | 'category'
    | 'created_by_user_uuid'
> & { questions: string };

export type DbDataAppTemplateUpdate = Partial<
    Pick<
        DbDataAppTemplate,
        'name' | 'description' | 'category' | 'updated_at'
    > & {
        questions: string;
    }
>;

export type DataAppTemplatesTable = Knex.CompositeTableType<
    DbDataAppTemplate,
    DbDataAppTemplateIn,
    DbDataAppTemplateUpdate
>;

export type DbDataAppTemplateFile = {
    file_uuid: string;
    template_uuid: string;
    filename: string;
    size_bytes: number;
    created_at: Date;
};

export type DbDataAppTemplateFileIn = Pick<
    DbDataAppTemplateFile,
    'template_uuid' | 'filename' | 'size_bytes'
>;

export type DataAppTemplateFilesTable = Knex.CompositeTableType<
    DbDataAppTemplateFile,
    DbDataAppTemplateFileIn,
    never
>;
